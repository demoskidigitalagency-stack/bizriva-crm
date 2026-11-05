import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, ChevronDown, Menu, Minus, X } from "lucide-react";

const TITLE = "Bizriva — turn WhatsApp ad chats into delivered, paid orders";
const DESC = "The sales desk for cash-on-delivery sellers in Nigeria: one WhatsApp inbox for your team, an AI sales agent in English and Pidgin, COD checks before dispatch, riders, cash and ad results in one place.";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" },
    ],
  }),
  component: Welcome,
});

/* ───────────────────────── content ───────────────────────── */

const LEAKS = [
  { n: "01", title: "Chats wait, buyers cool off", body: "Hundreds of ad chats land on one or two phones. By the time someone replies, the buyer has moved on to the next seller." },
  { n: "02", title: "\"How much?\" — then silence", body: "People ask the price and go quiet. Nobody follows up, so leads you paid for never become orders." },
  { n: "03", title: "Fake COD orders", body: "Unserious orders burn delivery fees and rider trips. You only find out at the gate." },
  { n: "04", title: "Cash stuck with riders", body: "Delivered doesn't mean paid. Without a ledger, money arrives late or not at all." },
  { n: "05", title: "Ads you can't read", body: "Ads Manager counts chats and form fills. You need to know which ad brought orders that were actually delivered." },
];

const JOURNEY = [
  { k: "Ad", v: "Buyer taps your click-to-WhatsApp ad. The chat lands with the ad's name on it." },
  { k: "Chat", v: "Your AI agent answers price, sizes and delivery from your catalogue — in English or Pidgin." },
  { k: "Details", v: "Name, phone, address and landmark are picked out of the chat. One tap saves them." },
  { k: "Order", v: "Order created in the chat, or from your landing-page order form." },
  { k: "Verify", v: "COD check and a risk score before any rider moves." },
  { k: "Deliver", v: "Dispatch to your rider or a courier. Track attempts and refusals." },
  { k: "Cash in", v: "Delivered and paid. The receipt and a how-to-use guide land in their chat; revenue counts only when the money is real." },
];

const FEATURES = [
  { t: "Every platform, one inbox", d: "WhatsApp, Instagram, Messenger, TikTok and website chats in one list for the whole team, with \"Needs reply\" first." },
  { t: "AI sales agent that doesn't make things up", d: "Replies, sells and sends payment links — only from your products and knowledge base. Hands over to a person when it isn't sure." },
  { t: "COD verification", d: "A confirmation queue with risk scores from history, city and order value. High-risk orders alert you before dispatch." },
  { t: "Order forms that never lose an order", d: "Buy 1 / 2 / 3 packages, free gifts, a live total. Saved the moment it's placed, with the ad source and region." },
  { t: "Delivery, riders and cash", d: "Dispatch board, rider phone view, failed attempts with reasons, and how much cash each rider is holding." },
  { t: "Follow-ups that respect the rules", d: "Nudges quiet buyers inside WhatsApp's 24-hour window, with approved templates, consent and quiet hours." },
  { t: "Deposits, balances, invoices", d: "Record a deposit, send a balance request into the chat, print an invoice." },
  { t: "Customer 360", d: "Every chat, order, payment, note and address for one person. Import your old WhatsApp chats so history isn't lost." },
  { t: "Create Facebook & Instagram ads", d: "Pick a product, choose a draft in English or Pidgin, set the states and budget, preview it — and Bizriva judges every ad on delivered sales, then sends those sales back to Meta." },
];

type Cell = "yes" | "no" | "part";
const COMPARE: { row: string; cells: [Cell, Cell, Cell, Cell, Cell] }[] = [
  { row: "Shared inbox for a whole team", cells: ["yes", "no", "no", "no", "no"] },
  { row: "CRM: every customer's history in one place", cells: ["yes", "no", "no", "no", "no"] },
  { row: "COD confirmation and risk check", cells: ["yes", "no", "no", "part", "no"] },
  { row: "Order forms with packages and gifts", cells: ["yes", "no", "part", "yes", "no"] },
  { row: "Riders, deliveries and cash remitted", cells: ["yes", "no", "no", "no", "no"] },
  { row: "AI replies from your own catalogue", cells: ["yes", "no", "no", "no", "part"] },
  { row: "Return on ads from delivered orders", cells: ["yes", "no", "no", "part", "part"] },
  { row: "Create Facebook and Instagram ads", cells: ["yes", "no", "part", "no", "yes"] },
  { row: "Follow-ups within WhatsApp's rules", cells: ["yes", "part", "no", "no", "no"] },
];
const COMPARE_COLS = ["Bizriva", "WhatsApp Business app", "Link-in-bio store", "Form plugin", "Ad tool"];

const PLANS = [
  { name: "Trial", price: "Free", per: "14 days", pitch: "Everything, to see it work on your business.", items: ["500 contacts", "3 team seats", "1,000 messages", "All core modules"] },
  { name: "Starter", price: "₦25,000", per: "/ month", pitch: "For a seller and a small team.", items: ["2,000 contacts", "3 team seats", "5,000 messages / month", "WhatsApp inbox, AI agent, COD checks"] },
  { name: "Growth", price: "₦60,000", per: "/ month", pitch: "For brands running ads every day.", items: ["10,000 contacts", "10 team seats", "25,000 messages / month", "Automations, broadcasts, ad results"], best: true },
  { name: "Scale", price: "₦150,000", per: "/ month", pitch: "For many numbers and bigger teams.", items: ["50,000 contacts", "30 team seats", "100,000 messages / month", "Multiple numbers, priority support"] },
];

const FAQ = [
  { q: "What is the Money Brief?", a: "A short summary waiting for you every morning: yesterday's delivered revenue against your average, cash still with riders, orders to confirm, how your ads did, birthdays, and the few things that need you today. You choose the time, and whether it comes in the app, on WhatsApp or by email." },
  { q: "Which platforms does the inbox cover?", a: "WhatsApp, Instagram, Facebook Messenger and your website chat, with TikTok messages as TikTok opens its business messaging to more countries. One list, one customer record, however they reached you." },
  { q: "I already have a WordPress site and order forms. Do I have to change them?", a: "No. Connect Elementor, Gravity Forms, WPForms, Contact Form 7, Fluent Forms, WooCommerce, Shopify, Google Forms, Typeform, Jotform or Tally in a few minutes — or anything else through Zapier or Make. Your pages stay as they are; the orders just land in Bizriva." },
  { q: "Can I create my Facebook and Instagram ads in Bizriva?", a: "Yes. Connect your Meta ad account, pick a product and a picture, choose ad text in English or Pidgin, set the states, age and budget, and preview it. The ad is created paused in your own Meta account — Meta charges your card, never us — and starts when you press Start. Bizriva also sends your delivered sales back to Meta, so it finds more people who actually pay." },
  { q: "Can customers pay without leaving WhatsApp?", a: "Almost. WhatsApp's own in-chat payments aren't available in Nigeria yet, so Bizriva does the next best thing: each customer gets their own account number (or a payment link) right in the chat. They transfer from their bank app, and within seconds the order is marked paid and a receipt lands back in their WhatsApp — no screenshots to check." },
  { q: "Do I need the WhatsApp Business API?", a: "Yes — Bizriva connects to the official WhatsApp Cloud API, so your team shares one number safely. We guide you through Meta's business verification. You can start in Practice Mode today while that's approved." },
  { q: "What happens to my old WhatsApp chats?", a: "Export any chat from WhatsApp and import it into Bizriva. It lands in that customer's history, and duplicates are skipped. Some numbers can also keep using the WhatsApp Business app alongside Bizriva." },
  { q: "How do you count revenue on cash-on-delivery?", a: "Created, confirmed and delivered are counted separately. Cash-on-delivery only counts as revenue once it's delivered — so your numbers match your bank, not your hopes." },
  { q: "Will the AI agent say something wrong to my customers?", a: "It only answers from your product list and the answers you write in the knowledge base. It won't invent prices or promises, and it hands over to a person when asked or unsure." },
  { q: "Can my riders and staff use it?", a: "Yes. Six roles — owner, manager, sales, support, dispatcher and finance — each see what they need. Riders get a simple phone view to mark drops delivered." },
  { q: "Is my data separate from other businesses?", a: "Every record belongs to one business and is locked to its team at the database level. Other businesses can never see it." },
  { q: "Is it only for product sellers?", a: "It's built for cash-on-delivery commerce — fashion, hair, beauty, skincare, gadgets, home goods. Service businesses can use the inbox, CRM, follow-ups and payments too." },
];

/* ───────────────────────── visuals ───────────────────────── */

function HeroVisual() {
  return (
    <div className="lp-hero-visual relative mx-auto w-full max-w-[460px]" aria-hidden="true">
      <div className="lp-phone">
        <div className="lp-phone-bar"><span className="lp-dot" /> Luxe Hair · from the Bone Straight 20″ ad</div>
        <div className="space-y-2 p-3">
          <p className="lp-bubble lp-in" style={{ animationDelay: ".2s" }}>Good evening, how much is the bone straight 20 inches?</p>
          <p className="lp-bubble lp-out" style={{ animationDelay: ".7s" }}>Good evening! It's ₦185,000 and you can pay on delivery in Lagos 🙌 Which length do you want?</p>
          <p className="lp-bubble lp-in" style={{ animationDelay: "1.2s" }}>Abeg send 20 inches. 12 Ogunlana Drive, Surulere. Near Total filling station. 0805 331 2094</p>
          <p className="lp-chip" style={{ animationDelay: "1.7s" }}>✓ Name, phone and address saved</p>
        </div>
      </div>
      <div className="lp-waybill" style={{ animationDelay: "2.1s" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="lp-mono text-[10px] tracking-[0.2em] text-[var(--ink-soft)]">WAYBILL</p>
            <p className="lp-mono text-lg font-semibold">BZ-1184</p>
          </div>
          <span className="lp-stamp">DELIVERED · PAID</span>
        </div>
        <dl className="lp-mono mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <dt className="text-[var(--ink-soft)]">Customer</dt><dd>Chioma E.</dd>
          <dt className="text-[var(--ink-soft)]">COD check</dt><dd>Confirmed 18:52</dd>
          <dt className="text-[var(--ink-soft)]">Rider</dt><dd>Musa · Surulere</dd>
          <dt className="text-[var(--ink-soft)]">Cash</dt><dd>Remitted ₦185,000</dd>
        </dl>
        <div className="lp-perf mt-3" />
        <p className="lp-mono mt-2 text-[10px] text-[var(--ink-soft)]">Source: Bone Straight 20″ ad · counted as revenue on delivery</p>
      </div>
    </div>
  );
}

function Mark({ c }: { c: Cell }) {
  if (c === "yes") return <Check className="mx-auto size-5 text-[var(--green)]" aria-label="Yes" />;
  if (c === "part") return <span className="lp-mono text-xs text-[var(--ink-soft)]" aria-label="Partly">partly</span>;
  return <Minus className="mx-auto size-4 text-[var(--ink-faint)]" aria-label="No" />;
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ul className="divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
      {FAQ.map((f, i) => (
        <li key={f.q}>
          <button type="button" className="flex w-full items-center justify-between gap-4 py-5 text-left" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
            <span className="lp-display text-lg font-semibold sm:text-xl">{f.q}</span>
            <ChevronDown className={`size-5 shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`} />
          </button>
          {open === i && <p className="max-w-3xl pb-5 text-[var(--ink-soft)]">{f.a}</p>}
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────── page ───────────────────────── */

function Welcome() {
  const [nav, setNav] = useState(false);
  const links = [["#problem", "Why"], ["#how", "How it works"], ["#features", "Features"], ["#brief", "Money Brief"], ["#pay", "Payments"], ["#compare", "Compare"], ["#pricing", "Pricing"], ["#faq", "FAQ"]] as const;
  return (
    <div className="lp">
      <style>{CSS}</style>

      <header className="sticky top-0 z-40 border-b border-[var(--rule)] bg-[var(--paper)]/90 backdrop-blur">
        <div className="lp-wrap flex h-16 items-center gap-6">
          <Link to="/welcome" className="lp-display flex items-center gap-2 text-xl font-extrabold tracking-tight">
            <span className="lp-logo" aria-hidden="true">B</span> Bizriva
          </Link>
          <nav className="hidden flex-1 items-center gap-6 text-sm font-medium md:flex" aria-label="Page sections">
            {links.map(([h, l]) => <a key={h} href={h} className="hover:text-[var(--green)]">{l}</a>)}
          </nav>
          <div className="ml-auto hidden items-center gap-3 md:flex">
            <Link to="/account" className="text-sm font-semibold hover:text-[var(--green)]">Sign in</Link>
            <Link to="/account" className="lp-btn lp-btn-dark">Start free</Link>
          </div>
          <button type="button" className="ml-auto md:hidden" aria-label={nav ? "Close menu" : "Open menu"} onClick={() => setNav(!nav)}>{nav ? <X className="size-6" /> : <Menu className="size-6" />}</button>
        </div>
        {nav && (
          <nav className="lp-wrap grid gap-3 pb-4 text-base font-medium md:hidden" aria-label="Page sections">
            {links.map(([h, l]) => <a key={h} href={h} onClick={() => setNav(false)}>{l}</a>)}
            <Link to="/account" className="lp-btn lp-btn-dark justify-center">Start free</Link>
          </nav>
        )}
      </header>

      <main>
        {/* Hero */}
        <section className="lp-hero">
          <div className="lp-wrap grid items-center gap-12 py-14 md:py-20 lg:grid-cols-[1.1fr_1fr]">
            <div className="min-w-0">
              <p className="lp-kicker">For cash-on-delivery sellers in Nigeria</p>
              <h1 className="lp-display mt-4 text-[2.6rem] font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.4rem]">
                Turn ad chats into <span className="lp-highlight">delivered, paid</span> orders.
              </h1>
              <p className="mt-6 max-w-xl text-lg text-[var(--ink-soft)]">
                Bizriva is an AI sales desk that never sleeps: WhatsApp, Instagram, Messenger and TikTok chats in one inbox, an agent that replies, sells and sends payment links in English or Pidgin, COD checks before dispatch — and a Money Brief every morning that counts only the money that landed.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/account" className="lp-btn lp-btn-dark">Start free — no card <ArrowRight className="size-4" /></Link>
                <Link to="/" className="lp-btn lp-btn-line">Try the live demo</Link>
              </div>
              <p className="lp-mono mt-4 text-xs text-[var(--ink-soft)]">The demo runs on sample data. Nothing is sent to anyone.</p>
            </div>
            <HeroVisual />
          </div>
        </section>

        {/* Problem */}
        <section id="problem" className="lp-band-ink">
          <div className="lp-wrap py-20">
            <p className="lp-kicker lp-kicker-light">Where the money leaks</p>
            <h2 className="lp-display mt-3 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">You don't lose sales at the ad. You lose them between the ad and the doorstep.</h2>
            <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
              {LEAKS.map((l) => (
                <li key={l.n} className="bg-[var(--ink)] p-6">
                  <p className="lp-mono text-sm text-[var(--danfo)]">{l.n}</p>
                  <p className="lp-display mt-3 text-xl font-bold">{l.title}</p>
                  <p className="mt-2 text-sm text-white/70">{l.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Journey */}
        <section id="how" className="lp-wrap py-20">
          <p className="lp-kicker">How it works</p>
          <h2 className="lp-display mt-3 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">One path, from tap to cash.</h2>
          <ol className="lp-route mt-12 grid gap-6 md:grid-cols-7 md:gap-3">
            {JOURNEY.map((s, i) => (
              <li key={s.k} className="relative md:pt-10">
                <span className="lp-stop" aria-hidden="true">{i + 1}</span>
                <p className="lp-display text-lg font-bold">{s.k}</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">{s.v}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" className="border-y border-[var(--rule)] bg-[var(--paper-2)]">
          <div className="lp-wrap py-20">
            <div className="grid gap-6 lg:grid-cols-[1fr_2fr] lg:gap-16">
              <div>
                <p className="lp-kicker">Everything in one desk</p>
                <h2 className="lp-display mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">Built around how COD actually works.</h2>
                <p className="mt-4 text-[var(--ink-soft)]">Not a chatbot bolted onto a store. A CRM where the conversation, the order, the rider and the cash are one record.</p>
              </div>
              <ul className="grid gap-px overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-2">
                {FEATURES.map((f) => (
                  <li key={f.t} className="bg-[var(--paper)] p-6">
                    <p className="lp-display text-lg font-bold">{f.t}</p>
                    <p className="mt-2 text-sm text-[var(--ink-soft)]">{f.d}</p>
                  </li>
                ))}
                <li className="flex flex-col justify-between gap-4 bg-[var(--ink)] p-6 text-white">
                  <p className="lp-display text-lg font-bold">See all 31 modules working on sample data.</p>
                  <Link to="/" className="lp-btn lp-btn-danfo self-start">Open the demo <ArrowRight className="size-4" /></Link>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Brief + memory */}
        <section id="brief" className="lp-wrap grid gap-12 py-20 lg:grid-cols-2">
          <div className="min-w-0">
            <p className="lp-kicker">Every morning, 7:30</p>
            <h2 className="lp-display mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">Wake up to your Money Brief.</h2>
            <p className="mt-4 text-[var(--ink-soft)]">Before you open a single chat: what you delivered yesterday, how much cash your riders are holding, which orders to call first, which ad is earning — and a short list of what needs you today. In the app, on WhatsApp or by email.</p>
            <div className="lp-brief mt-8" aria-label="Example Money Brief">
              <p className="lp-mono text-[11px] tracking-[0.18em] text-[var(--ink-soft)]">☀️ MONEY BRIEF · TUESDAY</p>
              <p className="mt-2 font-semibold">Yesterday you delivered ₦1,619,000 across 4 orders, up on your daily average. ₦3.78m is still with riders.</p>
              <ul className="lp-mono mt-3 space-y-1 text-[12px]">
                <li>🏍️ Cash with riders · ₦3,783,000</li>
                <li>📞 To confirm · 34 orders · 7 high-risk</li>
                <li>📣 Ads · 2.9× return on delivered sales</li>
                <li>🎂 Birthdays · Chiamaka today</li>
              </ul>
              <p className="mt-3 text-sm font-semibold">Today: call the 7 high-risk orders first.</p>
            </div>
          </div>
          <div className="min-w-0">
            <p className="lp-kicker">Remembers every customer</p>
            <h2 className="lp-display mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">Speak to each buyer like you know them. Because you do.</h2>
            <p className="mt-4 text-[var(--ink-soft)]">Bizriva picks up what customers tell you in chat — birthday, size, favourite colour, budget, who they buy for — and your team confirms it in one tap. The AI agent uses it: “Welcome back, Chiamaka! Since you like burgundy…”</p>
            <div className="lp-memory mt-8" aria-label="Example customer memory">
              <p className="font-semibold">Chiamaka O. <span className="lp-mono text-xs text-[var(--ink-soft)]">· 4 orders · Lekki</span></p>
              <ul className="mt-3 flex flex-wrap gap-2 text-xs">
                {["🎂 Birthday · 29 September", "Likes · burgundy", "Size 12", "Buys for her sister", "Budget · about ₦200k"].map((x) => <li key={x} className="lp-chipfact">{x}</li>)}
              </ul>
              <p className="lp-bubble lp-out mt-4 opacity-100" style={{ animation: "none", opacity: 1 }}>Happy birthday, Chiamaka! 🎉 Here's 10% off anything this week — the burgundy deep wave just came in.</p>
            </div>
          </div>
        </section>

        {/* Made for here */}
        <section className="lp-wrap grid gap-10 py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="lp-kicker">Made for here</p>
            <h2 className="lp-display mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">Naira, Pidgin, landmarks and pay-on-delivery — by default.</h2>
            <p className="mt-4 text-[var(--ink-soft)]">Bizriva reads Nigerian phone numbers and "near the Total filling station" addresses, ships with replies in Pidgin, and treats cash-on-delivery as the normal case, not an exception.</p>
          </div>
          <ul className="grid grid-cols-2 gap-3 text-sm">
            {["29 ready replies in English and Pidgin", "7-day setup plan for new sellers", "Share kit: WhatsApp link and QR code", "Import old WhatsApp chats", "Receipt and how-to-use guide after every delivery", "Complaints tracked to resolution", "Courier partners on the roadmap: GIG, Fez, Kwik, Topship"].map((x) => (
              <li key={x} className="lp-ticket"><Check className="size-4 shrink-0 text-[var(--green)]" /> {x}</li>
            ))}
          </ul>
        </section>

        {/* Pay in chat */}
        <section id="pay" className="lp-band-ink">
          <div className="lp-wrap grid gap-10 py-20 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="lp-kicker lp-kicker-light">Get paid in the chat</p>
              <h2 className="lp-display mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">Transfer, confirmed in seconds. Receipt in their WhatsApp.</h2>
              <p className="mt-4 text-white/75">Every customer gets their own account number through Paystack, Flutterwave or Monnify. The moment they transfer, Bizriva matches it to the order, marks it paid, sends a receipt into their chat and tells your team — no screenshots, no "abeg check your account". Card, USSD and pay-on-delivery still work, and money can split to your branches automatically.</p>
            </div>
            <div className="lp-brief" aria-label="Example payment in chat" style={{ transform: "rotate(1deg)" }}>
              <p className="lp-mono text-[11px] tracking-[0.18em]">WHATSAPP · LUXE HAIR</p>
              <p className="lp-bubble lp-out mt-3" style={{ animation: "none", opacity: 1, color: "#14201b" }}>🏦 Bank transfer — confirmed instantly<br />Wema Bank · <b>9945123308</b><br />Luxe Hair/Chiamaka O.</p>
              <p className="lp-bubble lp-in mt-2" style={{ animation: "none", opacity: 1, color: "#14201b" }}>Done ✅</p>
              <p className="lp-bubble lp-out mt-2" style={{ animation: "none", opacity: 1, color: "#14201b" }}>✅ <b>Payment received — thank you!</b><br />₦185,000 for order BZ-1184 · RCPT-1184-001</p>
            </div>
          </div>
        </section>

        {/* Connect */}
        <section id="connect" className="border-t border-[var(--rule)]">
          <div className="lp-wrap py-20">
            <p className="lp-kicker">Keep what you already use</p>
            <h2 className="lp-display mt-3 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">Your website, forms and store — plugged straight in.</h2>
            <p className="mt-4 max-w-2xl text-[var(--ink-soft)]">No need to rebuild your landing pages. Every submission from the tools below arrives in Bizriva as a lead or a COD order to confirm, with a chat in your inbox and the ad it came from. Duplicates are skipped.</p>
            <ul className="mt-10 flex flex-wrap gap-3">
              {["Elementor Forms", "Gravity Forms", "WPForms", "Contact Form 7", "Fluent Forms", "WooCommerce", "Shopify", "Google Forms", "Typeform", "Jotform", "Tally", "Zapier", "Make", "Any website"].map((x) => (
                <li key={x} className="lp-chipfact lp-display text-base font-semibold">{x}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* Compare */}
        <section id="compare" className="border-t border-[var(--rule)] bg-[var(--paper-2)]">
          <div className="lp-wrap py-20">
            <p className="lp-kicker">Compare</p>
            <h2 className="lp-display mt-3 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">Stop stitching five tools together.</h2>
            <p className="mt-4 max-w-2xl text-[var(--ink-soft)]">Most sellers juggle the WhatsApp app, a store link, an order form and an ad tool — and still keep the delivery list in a notebook. Here's what each covers.</p>
            <div className="mt-10 overflow-x-auto rounded-2xl border border-[var(--rule)] bg-[var(--paper)]">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--rule)]">
                    <th className="p-4 text-left font-semibold">What you need</th>
                    {COMPARE_COLS.map((c, i) => <th key={c} className={`p-4 text-center font-semibold ${i === 0 ? "lp-col-us" : "text-[var(--ink-soft)]"}`}>{c}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule)]">
                  {COMPARE.map((r) => (
                    <tr key={r.row}>
                      <td className="p-4">{r.row}</td>
                      {r.cells.map((c, i) => <td key={i} className={`p-4 text-center ${i === 0 ? "lp-col-us" : ""}`}><Mark c={c} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="lp-mono mt-3 text-xs text-[var(--ink-soft)]">Typical tools in each category, as of November 2026. "Partly" means some tools in that category offer it.</p>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="lp-wrap py-20">
          <p className="lp-kicker">Pricing</p>
          <h2 className="lp-display mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">Plain prices in naira.</h2>
          <p className="mt-4 max-w-2xl text-[var(--ink-soft)]">No setup fee, cancel any time. Your ad budget stays in your own Meta account — Bizriva never holds it. WhatsApp's own message charges from Meta are separate.</p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((p) => (
              <li key={p.name} className={`lp-plan ${p.best ? "lp-plan-best" : ""}`}>
                {p.best && <span className="lp-stamp lp-stamp-sm absolute -top-3 right-4">MOST SELLERS</span>}
                <p className="lp-display text-xl font-bold">{p.name}</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">{p.pitch}</p>
                <p className="mt-5"><span className="lp-display text-4xl font-extrabold">{p.price}</span> <span className="text-sm text-[var(--ink-soft)]">{p.per}</span></p>
                <ul className="mt-5 space-y-2 text-sm">
                  {p.items.map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[var(--green)]" />{x}</li>)}
                </ul>
                <Link to="/account" className={`lp-btn mt-6 w-full justify-center ${p.best ? "lp-btn-dark" : "lp-btn-line"}`}>{p.price === "Free" ? "Start free" : `Choose ${p.name}`}</Link>
              </li>
            ))}
          </ul>
          <p className="lp-mono mt-4 text-xs text-[var(--ink-soft)]">Early-access pricing. Prices may change before general release.</p>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-[var(--rule)] bg-[var(--paper-2)]">
          <div className="lp-wrap grid gap-10 py-20 lg:grid-cols-[1fr_2fr]">
            <div>
              <p className="lp-kicker">Questions</p>
              <h2 className="lp-display mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">Before you ask.</h2>
            </div>
            <Faq />
          </div>
        </section>

        {/* Final CTA */}
        <section className="lp-band-ink">
          <div className="lp-wrap flex flex-col items-start gap-8 py-20 lg:flex-row lg:items-end lg:justify-between">
            <h2 className="lp-display max-w-3xl text-4xl font-extrabold leading-tight sm:text-6xl">Every chat you pay for deserves a reply, a record and a delivery.</h2>
            <div className="flex flex-wrap gap-3">
              <Link to="/account" className="lp-btn lp-btn-danfo">Start free <ArrowRight className="size-4" /></Link>
              <Link to="/" className="lp-btn lp-btn-ghost">See the demo</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--rule)]">
        <div className="lp-wrap flex flex-col gap-4 py-10 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="lp-display flex items-center gap-2 text-lg font-extrabold"><span className="lp-logo" aria-hidden="true">B</span> Bizriva</p>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[var(--ink-soft)]" aria-label="Footer">
            <a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a>
            <Link to="/account">Sign in</Link><Link to="/">Live demo</Link>
          </nav>
          <p className="text-[var(--ink-soft)]">© 2026 Bizriva · Made in Nigeria</p>
        </div>
      </footer>
    </div>
  );
}

/* ───────────────────────── styles ───────────────────────── */

const CSS = `
.lp{--paper:#f6f1e7;--paper-2:#efe7d8;--ink:#14201b;--ink-soft:#4b5a52;--ink-faint:#a7ad9f;--rule:#d9cfbd;--green:#0f7a55;--danfo:#f5b800;
  background:var(--paper);color:var(--ink);font-family:Figtree,system-ui,sans-serif;min-height:100vh;overflow-x:clip;
  background-image:radial-gradient(rgba(20,32,27,.045) 1px,transparent 1px);background-size:4px 4px}
.lp ::selection{background:var(--danfo);color:var(--ink)}
.lp-wrap{width:100%;max-width:1200px;margin:0 auto;padding-left:20px;padding-right:20px}
.lp-display{font-family:"Bricolage Grotesque",Figtree,sans-serif}
.lp-mono{font-family:"IBM Plex Mono",ui-monospace,monospace}
.lp-kicker{font-family:"IBM Plex Mono",monospace;font-size:12px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--green)}
.lp-kicker-light{color:var(--danfo)}
.lp-logo{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:8px;background:var(--ink);color:var(--danfo);font-size:17px}
.lp-highlight{background:linear-gradient(transparent 58%,var(--danfo) 58%,var(--danfo) 92%,transparent 92%);padding:0 .05em}
.lp-btn{display:inline-flex;align-items:center;gap:.5rem;border-radius:999px;padding:.8rem 1.35rem;font-weight:700;font-size:15px;transition:transform .15s ease,box-shadow .15s ease}
.lp-btn:hover{transform:translateY(-2px)}
.lp-btn-dark{background:var(--ink);color:var(--paper);box-shadow:0 6px 0 -2px var(--danfo)}
.lp-btn-line{border:1.5px solid var(--ink)}
.lp-btn-danfo{background:var(--danfo);color:var(--ink)}
.lp-btn-ghost{border:1.5px solid rgba(255,255,255,.4);color:#fff}
.lp-hero{position:relative}
.lp-hero:after{content:"";position:absolute;right:-10%;top:10%;width:55%;height:80%;background:radial-gradient(closest-side,rgba(245,184,0,.22),transparent);pointer-events:none;z-index:0}
.lp-hero > *{position:relative;z-index:1}
.lp-phone{background:#e9f0e8;border:1.5px solid var(--ink);border-radius:22px;box-shadow:10px 10px 0 var(--ink);overflow:hidden;transform:rotate(-2deg)}
.lp-phone-bar{display:flex;align-items:center;gap:.5rem;background:var(--green);color:#fff;font-size:12px;font-weight:600;padding:.7rem 1rem}
.lp-dot{width:8px;height:8px;border-radius:99px;background:var(--danfo)}
.lp-bubble{max-width:85%;padding:.55rem .8rem;border-radius:14px;font-size:13.5px;line-height:1.35;opacity:0;animation:lp-pop .45s ease forwards}
.lp-in{background:#fff;border-bottom-left-radius:4px}
.lp-out{background:#cfe9d8;margin-left:auto;border-bottom-right-radius:4px}
.lp-chip{display:inline-block;font-family:"IBM Plex Mono",monospace;font-size:11px;background:var(--ink);color:var(--danfo);padding:.3rem .6rem;border-radius:6px;opacity:0;animation:lp-pop .45s ease forwards}
.lp-waybill{position:relative;margin:-6px -6px 0 auto;width:82%;background:#fffdf7;border:1.5px solid var(--ink);border-radius:6px;padding:1rem 1.1rem;box-shadow:8px 8px 0 var(--danfo);transform:rotate(2.5deg);opacity:0;animation:lp-drop .6s cubic-bezier(.2,.9,.3,1.3) forwards}
.lp-perf{height:10px;background:radial-gradient(circle at 5px 5px,var(--paper) 3px,transparent 3.5px) 0 0/12px 10px repeat-x;border-top:1.5px dashed var(--rule)}
.lp-stamp{display:inline-block;font-family:"IBM Plex Mono",monospace;font-weight:600;font-size:11px;letter-spacing:.12em;color:var(--green);border:2px solid var(--green);border-radius:4px;padding:.25rem .5rem;transform:rotate(-6deg);background:rgba(15,122,85,.06);white-space:nowrap}
.lp-stamp-sm{font-size:10px;background:var(--danfo);color:var(--ink);border-color:var(--ink);transform:rotate(-3deg)}
.lp-band-ink{background:var(--ink);color:#fff}
.lp-route{position:relative}
@media (min-width:768px){.lp-route:before{content:"";position:absolute;left:14px;right:14px;top:13px;border-top:2px dashed var(--ink)}}
.lp-stop{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:99px;background:var(--danfo);border:2px solid var(--ink);font-family:"IBM Plex Mono",monospace;font-weight:600;font-size:12px;margin-bottom:.6rem}
@media (min-width:768px){.lp-stop{position:absolute;top:0;left:0;margin:0}}
.lp-ticket{display:flex;gap:.5rem;align-items:flex-start;background:#fffdf7;border:1.5px solid var(--ink);border-radius:10px;padding:.85rem;box-shadow:4px 4px 0 var(--rule)}
.lp-col-us{background:rgba(245,184,0,.16)}
th.lp-col-us{color:var(--ink)}
.lp-brief{background:var(--ink);color:#f6f1e7;border-radius:18px;padding:1.4rem;box-shadow:10px 10px 0 var(--danfo);transform:rotate(-1deg)}
.lp-brief .lp-mono{color:rgba(246,241,231,.7)}
.lp-memory{background:#fffdf7;border:1.5px solid var(--ink);border-radius:18px;padding:1.4rem;box-shadow:10px 10px 0 var(--green)}
.lp-chipfact{border:1.5px solid var(--ink);border-radius:999px;padding:.3rem .7rem;background:var(--paper)}
.lp-plan{position:relative;display:flex;flex-direction:column;background:#fffdf7;border:1.5px solid var(--rule);border-radius:18px;padding:1.5rem}
.lp-plan > a{margin-top:auto}
.lp-plan-best{border-color:var(--ink);box-shadow:8px 8px 0 var(--danfo)}
.lp-plan ul{margin-bottom:1.5rem}
@keyframes lp-pop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
@keyframes lp-drop{from{opacity:0;transform:translateY(-24px) rotate(8deg)}to{opacity:1;transform:rotate(2.5deg)}}
@media (prefers-reduced-motion:reduce){.lp-bubble,.lp-chip,.lp-waybill{animation:none;opacity:1}.lp-btn:hover{transform:none}}
`;
