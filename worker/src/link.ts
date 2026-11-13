// One business's linked WhatsApp number: pairing, history, live messages, sending.
/* eslint-disable @typescript-eslint/no-explicit-any */
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, type WASocket } from "baileys";
import type { SupabaseClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import pino from "pino";
import { dbAuthState } from "./auth.ts";
import { batches, chatNames, chatPhone, contactNames, pause, rememberLid, savedName, textOf, toRow, toThreads } from "./parse.ts";

export interface LinkRow { id: string; workspace_id: string; phone: string; method: "code" | "qr"; status: string; backfill_status?: string | null; save_status?: string | null }

const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });
const MARKETING_PER_DAY = Number(process.env.MARKETING_PER_DAY ?? 500);
const HISTORY_IDLE_MS = 3 * 60_000;
let waVersion: [number, number, number] | undefined;

export class Link {
  sock: WASocket | null = null;
  stopped = false;
  private lid = new Map<string, string>();
  private names = new Map<string, string>();
  private sentIds = new Set<string>();
  private codeAsked = false;
  private wasRegistered = false;
  private sending = false;
  private historyTimer: NodeJS.Timeout | null = null;
  private historyOpen = false;
  private sendTimer: NodeJS.Timeout | null = null;
  private retries = 0;
  private marketing = { day: "", n: 0 };
  private flush: (() => Promise<void>) | null = null;
  private auth: Awaited<ReturnType<typeof dbAuthState>> | null = null;
  private earlyCloses = 0;
  private backfilling = false;
  private saving = false;
  private namesSent = 0;

  private db: SupabaseClient;
  private key: Buffer;
  row: LinkRow;
  constructor(db: SupabaseClient, key: Buffer, row: LinkRow) { this.db = db; this.key = key; this.row = row; }

  private log(msg: string) { console.log(`[${this.row.phone.slice(0, 5)}…${this.row.id.slice(0, 6)}] ${msg}`); }
  /** Update what the owner sees; returns the link's history state ("syncing" until the old chats are in). */
  private async patch(p: Record<string, unknown>): Promise<string | null> {
    const { data, error } = await this.db.rpc("svc_wa_link_patch", { p_link: this.row.id, p_patch: p });
    if (error) this.log(`patch failed: ${error.message}`);
    return (data as string | null) ?? null;
  }

  async start(): Promise<void> {
    if (this.stopped) return;
    // Load the session once; reconnects reuse it (a fresh pairing must not wait on the database).
    this.auth ??= await dbAuthState(this.db, this.row.id, this.key);
    const auth = this.auth;
    this.flush = auth.flush;
    this.wasRegistered = !!(auth.state.creds.registered || auth.state.creds.me);
    if (!waVersion) { try { waVersion = (await fetchLatestBaileysVersion()).version; } catch { /* use Baileys' built-in version */ } }
    const sock = makeWASocket({
      auth: auth.state, logger, version: waVersion,
      browser: Browsers.windows("Desktop"), // Windows Desktop (WIN_HYBRID, see scripts/patch-baileys.mjs) gets full chat history
      markOnlineOnConnect: false,         // the owner's phone keeps getting notifications
      syncFullHistory: true,
      generateHighQualityLinkPreview: false,
      qrTimeout: 45_000,                  // each QR lives 45 s (about 4–5 minutes in all)
    });
    this.sock = sock;
    sock.ev.on("creds.update", () => void auth.saveCreds());
    sock.ev.on("connection.update", (u) => void this.onConnection(u).catch((e) => this.log(`connection handler: ${e}`)));
    sock.ev.on("messaging-history.set", (h) => void this.onHistory(h).catch((e) => this.log(`history: ${e}`)));
    // WhatsApp sends old chats in several waves and reports "complete" after the first quick one,
    // so the chats count as done only once nothing new has arrived for 3 minutes.
    sock.ev.on("messages.upsert", (u) => void this.onMessages(u.messages).catch((e) => this.log(`messages: ${e}`)));
    sock.ev.on("messages.update", (u) => void this.onUpdates(u).catch((e) => this.log(`updates: ${e}`)));
    sock.ev.on("contacts.upsert", (c) => void this.onContacts(c));
    sock.ev.on("contacts.update", (c) => void this.onContacts(c as any[]));
    sock.ev.on("lid-mapping.update" as any, (m: any) => rememberLid(this.lid, m?.lid, m?.pn));
  }

  private async onConnection(u: any) {
    const sock = this.sock!;
    if (u.qr && !this.wasRegistered) {
      if (this.row.method === "code") {
        if (!this.codeAsked) {
          this.codeAsked = true;
          try {
            const code = await sock.requestPairingCode(this.row.phone);
            await this.patch({ status: "waiting", pairing_code: code, qr: null, last_error: null });
            this.log("pairing code ready");
          } catch (e) {
            await this.patch({ status: "failed", last_error: `WhatsApp didn't give a pairing code: ${e instanceof Error ? e.message : e}. Check the number and try again, or use the QR code.` });
            await this.stop(false);
          }
        }
      } else {
        await this.patch({ status: "waiting", qr: await QRCode.toDataURL(u.qr, { margin: 1, width: 280 }), pairing_code: null, last_error: null });
        this.log("QR ready");
      }
    }
    if (u.connection === "open") {
      this.retries = 0;
      this.wasRegistered = true;
      const history = await this.patch({ status: "connected", pairing_code: null, qr: null, wa_name: sock.user?.name ?? null });
      this.log("connected");
      if (history === "syncing") this.armHistoryTimer();
      else if (this.namesSent === 0) setTimeout(() => void this.refreshNames(), 20_000); // fill names for chats already in
      this.sendTimer ??= setInterval(() => void this.sendQueued(), 3000);
    }
    if (u.connection === "close") {
      if (this.sendTimer) { clearInterval(this.sendTimer); this.sendTimer = null; }
      const err = u.lastDisconnect?.error as any;
      const code = err?.output?.statusCode as number | undefined;
      const why = String(err?.message ?? "closed");
      this.log(`closed: ${code ?? "?"} ${why}${this.wasRegistered ? "" : " (not linked yet)"}`);
      this.sock = null;
      if (this.stopped) return;
      if (code === DisconnectReason.loggedOut) {
        await this.patch({ status: "logged_out", last_error: "This device was removed from WhatsApp on the phone. Link again to reconnect." });
        this.stopped = true; return;
      }
      if (code === DisconnectReason.forbidden) {
        await this.patch({ status: "failed", last_error: "WhatsApp refused this number (it may be restricted). Check WhatsApp on your phone." });
        this.stopped = true; return;
      }
      if (code === DisconnectReason.connectionReplaced) {
        await this.patch({ status: "reconnecting", last_error: "Another Bizriva server took over this number." });
        this.stopped = true; return;
      }
      if (!this.wasRegistered && code !== DisconnectReason.restartRequired) {
        // All the QR codes / the pairing code ran out without being used.
        if (/QR refs attempts ended/i.test(why) || (this.row.method === "code" && this.codeAsked && code === DisconnectReason.timedOut)) {
          await this.patch({ status: "failed", pairing_code: null, qr: null, last_error: "The code expired before it was used. Tap “Link my WhatsApp” to get a new one." });
          this.stopped = true; return;
        }
        // The line dropped while waiting: try again quietly a few times before giving up.
        if (++this.earlyCloses > 3) {
          await this.patch({ status: "failed", pairing_code: null, qr: null, last_error: `WhatsApp closed the connection before linking (${code ?? "?"} ${why.slice(0, 80)}). Try again in a minute.` });
          this.stopped = true; return;
        }
        this.codeAsked = false;
        setTimeout(() => void this.start().catch((e) => this.log(`restart failed: ${e}`)), 2000);
        return;
      }
      if (code === DisconnectReason.restartRequired) await this.flush?.().catch(() => {});
      if (this.wasRegistered && code !== DisconnectReason.restartRequired) await this.patch({ status: "reconnecting" });
      const wait = code === DisconnectReason.restartRequired ? 500 : Math.min(60_000, 2000 * 2 ** this.retries++);
      setTimeout(() => void this.start().catch((e) => this.log(`restart failed: ${e}`)), wait);
    }
  }

  private armHistoryTimer() {
    this.historyOpen = true;
    if (this.historyTimer) clearTimeout(this.historyTimer);
    this.historyTimer = setTimeout(() => void this.finishHistory(), HISTORY_IDLE_MS);
  }

  private async finishHistory() {
    if (!this.historyOpen) return;
    this.historyOpen = false;
    if (this.historyTimer) clearTimeout(this.historyTimer);
    await this.pushNames();
    await this.db.rpc("svc_wa_history", { p_link: this.row.id, p_threads: [], p_done: true });
    this.log("history done");
  }

  private async onHistory(h: any) {
    for (const m of h.lidPnMappings ?? []) rememberLid(this.lid, m.lid, m.pn);
    for (const c of contactNames(h.contacts ?? [], this.lid)) this.names.set(c.phone, c.name);
    for (const c of chatNames(h.chats ?? [], this.lid)) this.names.set(c.phone, c.name);
    const threads = toThreads(h.messages ?? [], this.lid, this.names);
    for (const t of threads) if (t.name && !this.names.has(t.wa)) this.names.set(t.wa, t.name);
    if (threads.length) this.armHistoryTimer(); // every wave pushes "done" back by 3 minutes
    for (const b of batches(threads)) {
      const { error } = await this.db.rpc("svc_wa_history", { p_link: this.row.id, p_threads: b, p_done: false });
      if (error) this.log(`history save failed: ${error.message}`);
    }
    if (threads.length) this.log(`history chunk: ${threads.length} chats (${h.progress ?? "?"}%)`);
  }

  private async phoneFor(key: any): Promise<string | null> {
    const p = chatPhone(key, this.lid);
    if (p) return p;
    const jid = String(key?.remoteJid ?? "");
    if (!jid.endsWith("@lid") || !this.sock) return null;
    try {
      const pn = await (this.sock.signalRepository as any)?.lidMapping?.getPNForLID?.(jid);
      if (pn) { rememberLid(this.lid, jid, pn); return chatPhone(key, this.lid); }
    } catch { /* unknown */ }
    return null;
  }

  private async onMessages(list: any[]) {
    for (const msg of list) {
      const wa = await this.phoneFor(msg.key);
      if (!wa || !msg.key?.id) continue;
      const r = toRow({ ...msg, key: { ...msg.key, remoteJid: `${wa}@s.whatsapp.net` } }, this.lid);
      if (!r) continue;
      if (r.out) {
        if (this.sentIds.has(r.id)) continue; // sent by Bizriva itself
        await this.db.rpc("svc_whatsapp_echo", { p_workspace: this.row.workspace_id, p_wa_id: wa, p_msg_id: r.id, p_body: r.body, p_at: r.at });
      } else {
        const type = Object.keys(msg.message ?? {})[0] ?? "message";
        const { data } = await this.db.rpc("svc_whatsapp_inbound", { p_workspace: this.row.workspace_id, p_wa_id: wa, p_name: msg.pushName ?? null, p_msg_id: r.id, p_body: r.body, p_type: type, p_at: r.at });
        if ((data as any)?.status === "saved") void this.wakeAssistant();
      }
    }
  }

  private async wakeAssistant() {
    const { data: secret } = await this.db.rpc("svc_cron_secret");
    if (secret) await fetch(`${process.env.SUPABASE_URL}/functions/v1/ai-reply`, { method: "POST", headers: { "Content-Type": "application/json", "x-bizriva-cron": String(secret) }, body: "{}" }).catch(() => {});
  }

  private async onUpdates(list: any[]) {
    for (const u of list) {
      if (!u.key?.fromMe || !u.key.id || u.update?.status == null) continue;
      const s = Number(u.update.status);
      const status = s >= 4 ? "read" : s === 3 ? "delivered" : s === 2 ? "sent" : s === 0 ? "failed" : null;
      if (status) await this.db.rpc("svc_whatsapp_status", { p_workspace: this.row.workspace_id, p_msg_id: `wa:${u.key.id}`, p_status: status, p_error: status === "failed" ? "WhatsApp couldn't deliver it" : null });
    }
  }

  private async onContacts(list: any[]) {
    const named = contactNames(list ?? [], this.lid);
    for (const c of named) this.names.set(c.phone, c.name);
    if (named.length) await this.db.rpc("svc_wa_names", { p_link: this.row.id, p_contacts: named });
  }

  private async sendQueued() {
    if (this.sending || !this.sock || this.stopped) return;
    this.sending = true;
    try {
      const { data, error } = await this.db.rpc("svc_wa_claim", { p_link: this.row.id, p_limit: 10 });
      if (error) { this.log(`claim failed: ${error.message}`); return; }
      for (const j of (data ?? []) as { id: string; to_wa: string; body: string | null; media_path: string | null; media_kind: string | null; media_name: string | null; purpose: string | null }[]) {
        if (!this.sock) break;
        const today = new Date().toISOString().slice(0, 10);
        if (this.marketing.day !== today) this.marketing = { day: today, n: 0 };
        if (j.purpose === "marketing" && this.marketing.n >= MARKETING_PER_DAY) {
          await this.db.rpc("svc_whatsapp_result", { p_message: j.id, p_provider_id: null, p_error: `Today's safe limit of ${MARKETING_PER_DAY} marketing messages on a linked number is reached — it will try again later` });
          continue;
        }
        let providerId: string | null = null, err: string | null = null;
        try {
          if (!/^\d{7,15}$/.test(j.to_wa ?? "")) throw new Error("No phone number for this customer");
          const jid = `${j.to_wa}@s.whatsapp.net`;
          let content: any = { text: j.body ?? "" };
          if (j.media_path) {
            const { data: file, error: fe } = await this.db.storage.from("chat-media").download(j.media_path);
            if (fe || !file) throw new Error(`Couldn't load the file: ${fe?.message ?? "missing"}`);
            const buf = Buffer.from(await file.arrayBuffer());
            const caption = j.body ?? undefined;
            content = j.media_kind === "image" ? { image: buf, caption }
              : j.media_kind === "video" ? { video: buf, caption }
              : j.media_kind === "audio" ? { audio: buf, mimetype: file.type || "audio/ogg; codecs=opus", ptt: true }
              : { document: buf, mimetype: file.type || "application/octet-stream", fileName: j.media_name ?? "file", caption };
          } else if (!j.body?.trim()) throw new Error("Empty message");
          const sent = await this.sock.sendMessage(jid, content);
          if (!sent?.key?.id) throw new Error("WhatsApp didn't confirm the message");
          providerId = `wa:${sent.key.id}`;
          this.sentIds.add(providerId);
          if (this.sentIds.size > 5000) this.sentIds = new Set([...this.sentIds].slice(-2000));
          if (j.purpose === "marketing") this.marketing.n++;
        } catch (e) { err = (e instanceof Error ? e.message : String(e)).slice(0, 300); }
        await this.db.rpc("svc_whatsapp_result", { p_message: j.id, p_provider_id: providerId, p_error: err });
        await new Promise((r) => setTimeout(r, pause(j.purpose)));
      }
    } finally { this.sending = false; }
  }

  private async historyCount(): Promise<number> {
    const { data } = await this.db.from("wa_links").select("history_messages").eq("id", this.row.id).maybeSingle();
    return Number((data as { history_messages?: number } | null)?.history_messages ?? 0);
  }
  private async backfillPatch(p: Record<string, unknown>) {
    const { error } = await this.db.rpc("svc_wa_backfill_progress", { p_link: this.row.id, p_patch: p });
    if (error) this.log(`backfill progress failed: ${error.message}`);
  }

  /**
   * "Bring in older messages": ask the phone, chat by chat, for the 50 messages before the
   * oldest one Bizriva has. Repeat in rounds until a round brings nothing new, the chats reach
   * back 12 months, or 12 rounds. Answers arrive as ordinary history (onHistory).
   */
  async backfill(): Promise<void> {
    if (this.backfilling || !this.sock || this.stopped) return;
    this.backfilling = true;
    const cutoff = Date.now() - 365 * 86_400_000;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let secondsMode = false; // the request's time is in milliseconds; fall back to seconds if the phone ignores it
    try {
      await this.backfillPatch({ status: "running", round: 0, done: 0, total: 0 });
      this.log("backfill started");
      for (let round = 1; round <= 12 && !this.stopped; round++) {
        const { data, error } = await this.db.rpc("svc_wa_backfill_targets", { p_link: this.row.id, p_months: 12 });
        if (error) throw new Error(error.message);
        const targets = ((data ?? []) as { wa: string; msg_id: string; from_me: boolean; at: string }[]).filter((x) => new Date(x.at).getTime() > cutoff);
        if (!targets.length) break;
        const before = await this.historyCount();
        await this.backfillPatch({ round, done: 0, total: targets.length });
        for (let i = 0; i < targets.length; i++) {
          if (!this.sock || this.stopped) throw new Error("WhatsApp disconnected — tap Bring in older messages again once it's back");
          const x = targets[i]!;
          const ms = new Date(x.at).getTime();
          try {
            await this.sock.fetchMessageHistory(50, { remoteJid: `${x.wa}@s.whatsapp.net`, id: x.msg_id, fromMe: x.from_me }, secondsMode ? Math.floor(ms / 1000) : ms);
          } catch (e) { this.log(`ask older ${x.wa.slice(0, 5)}…: ${e instanceof Error ? e.message : e}`); }
          if (i % 10 === 9) await this.backfillPatch({ done: i + 1 });
          await sleep(1200);
        }
        await this.backfillPatch({ done: targets.length });
        await sleep(45_000); // give the phone time to answer
        const added = (await this.historyCount()) - before;
        await this.backfillPatch({ added: Math.max(0, added) });
        this.log(`backfill round ${round}: ${added} older messages`);
        if (added <= 0) {
          if (round === 1 && !secondsMode) { secondsMode = true; continue; }
          break;
        }
      }
      await this.backfillPatch({ status: "done" });
      this.log("backfill done");
    } catch (e) {
      await this.backfillPatch({ status: "failed", error: e instanceof Error ? e.message : String(e) });
    } finally { this.backfilling = false; }
  }

  /** Send every name collected (phone address book, chat names, WhatsApp names) to fill customers without one. */
  async pushNames(): Promise<void> {
    const all = [...this.names].map(([phone, name]) => ({ phone, name }));
    for (let i = 0; i < all.length; i += 500) {
      const { data, error } = await this.db.rpc("svc_wa_names", { p_link: this.row.id, p_contacts: all.slice(i, i + 500) });
      if (error) this.log(`names failed: ${error.message}`); else this.namesSent += Number(data ?? 0);
    }
    this.log(`names: ${all.length} known, ${this.namesSent} customers named`);
  }

  /** Ask WhatsApp to send the phone's saved contacts again (names), then fill blanks. */
  async refreshNames(): Promise<void> {
    if (!this.sock) return;
    try { await this.sock.resyncAppState(["critical_unblock_low", "regular_high", "regular_low", "regular", "critical_block"], true); }
    catch (e) { this.log(`resync names: ${e instanceof Error ? e.message : e}`); }
    await new Promise((r) => setTimeout(r, 5000));
    await this.pushNames();
  }

  /**
   * "Save to my phone": save each WhatsApp customer in the phone's own contacts (WhatsApp's
   * "save to phone" for linked devices), named with the owner's format, so they see the Status.
   * Paced at about one a second; at most 2,000 a run.
   */
  async saveContacts(): Promise<void> {
    if (this.saving || !this.sock || this.stopped) return;
    this.saving = true;
    const patch = async (p: Record<string, unknown>) => { const { error } = await this.db.rpc("svc_wa_save_progress", { p_link: this.row.id, p_patch: p }); if (error) this.log(`save progress: ${error.message}`); };
    try {
      await this.refreshNames(); // best names first
      const { data, error } = await this.db.rpc("svc_wa_save_targets", { p_link: this.row.id });
      if (error) throw new Error(error.message);
      const rows = ((data ?? []) as { wa: string; name: string | null; tags: string[]; template: string }[]).slice(0, 2000);
      await patch({ status: "running", done: 0, total: rows.length });
      let saved = 0, failed = 0;
      for (let i = 0; i < rows.length; i++) {
        if (!this.sock || this.stopped) throw new Error("WhatsApp disconnected — tap Save to my phone again once it's back");
        const r = rows[i]!;
        const full = savedName(r.wa, r.name, r.tags ?? [], r.template ?? "{name}");
        try {
          await this.sock.addOrEditContact(`${r.wa}@s.whatsapp.net`, { fullName: full, firstName: full.split(" ")[0] ?? full, pnJid: `${r.wa}@s.whatsapp.net`, saveOnPrimaryAddressbook: true });
          saved++;
        } catch (e) { failed++; if (failed <= 3) this.log(`save ${r.wa.slice(0, 5)}…: ${e instanceof Error ? e.message : e}`); }
        if (i % 20 === 19) await patch({ done: i + 1, saved, failed });
        await new Promise((res) => setTimeout(res, 900 + Math.floor(Math.random() * 400)));
      }
      await patch({ status: "done", done: rows.length, saved, failed });
      this.log(`saved ${saved} contacts to the phone (${failed} failed)`);
    } catch (e) {
      await patch({ status: "failed", error: e instanceof Error ? e.message : String(e) });
    } finally { this.saving = false; }
  }

  /** Stop holding the line. logout = also remove the device from the owner's WhatsApp. */
  async stop(logout: boolean): Promise<void> {
    this.stopped = true;
    if (this.sendTimer) { clearInterval(this.sendTimer); this.sendTimer = null; }
    if (this.historyTimer) clearTimeout(this.historyTimer);
    const s = this.sock; this.sock = null;
    if (s) {
      if (logout) { try { await s.logout(); } catch { /* already gone */ } }
      else s.end(undefined);
    }
    await this.flush?.().catch(() => {});
  }
}

export { textOf };
