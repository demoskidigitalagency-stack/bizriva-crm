// One AI call with one forced tool, on either the business's Anthropic key (sk-ant-…) or a Google
// Gemini key (AIza…, free tier available). Takes Anthropic-style messages and tool definitions and
// returns the tool's input. Copied identically into ai-tools/ and ai-reply/ (keep them in sync).

export const isGemini = (key: string) => /^AIza[0-9A-Za-z_-]{30,}$/.test(key);
// deno-lint-ignore no-explicit-any
const GEMINI_MODEL = (globalThis as any).Deno?.env.get("GEMINI_MODEL") ?? "gemini-flash-latest";
const GEMINI_FALLBACK = "gemini-2.5-flash";

/** The saved model if it fits the key's provider, else that provider's default. */
export function pickModel(key: string, saved: string | null | undefined, claudeDefault: string): string {
  const m = (saved ?? "").trim();
  if (isGemini(key)) return /^(gemini|gemma)/.test(m) ? m : GEMINI_MODEL;
  return m && m.startsWith("claude") ? m : claudeDefault;
}

// deno-lint-ignore no-explicit-any
type Any = any;
export interface Tool { name: string; description?: string; input_schema: Any }
export interface Msg { role: "user" | "assistant"; content: string | Any[] }

function friendly(status: number, msg: string): Error {
  if (status === 429) return new Error("The AI is busy right now (or the free daily limit is used up) — try again later.");
  if (status === 401 || status === 403) return new Error("The AI key was refused — check it on the AI Agent page.");
  return new Error(`${status} ${msg || "The AI service refused the request"}`);
}

export async function askTool(o: { key: string; model: string; system: string; messages: Msg[]; tool: Tool; maxTokens: number; timeoutMs: number }): Promise<Any> {
  return isGemini(o.key) ? gemini(o) : anthropic(o);
}

async function anthropic(o: { key: string; model: string; system: string; messages: Msg[]; tool: Tool; maxTokens: number; timeoutMs: number }): Promise<Any> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": o.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: o.model, max_tokens: o.maxTokens, system: o.system, messages: o.messages, tools: [o.tool], tool_choice: { type: "tool", name: o.tool.name } }),
    signal: AbortSignal.timeout(o.timeoutMs),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok) throw friendly(r.status, res?.error?.message);
  return (res.content ?? []).find((c: Any) => c.type === "tool_use" && c.name === o.tool.name)?.input;
}

/** JSON Schema → the OpenAPI subset Gemini function declarations accept. */
export function geminiSchema(s: Any): Any {
  if (!s || typeof s !== "object") return s;
  const out: Any = {};
  if (s.type) out.type = String(s.type).toUpperCase();
  for (const k of ["description", "enum", "required", "minItems", "maxItems", "minimum", "maximum", "nullable", "format"]) if (s[k] !== undefined) out[k] = s[k];
  if (out.minItems !== undefined) out.minItems = String(out.minItems);
  if (out.maxItems !== undefined) out.maxItems = String(out.maxItems);
  if (s.items) out.items = geminiSchema(s.items);
  if (s.properties) out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, geminiSchema(v)]));
  return out;
}

/** Anthropic content blocks → Gemini parts (text and base64 images). */
export function geminiParts(content: string | Any[]): Any[] {
  if (typeof content === "string") return [{ text: content }];
  return content.map((c) => c?.type === "image" ? { inlineData: { mimeType: c.source?.media_type, data: c.source?.data } } : { text: String(c?.text ?? "") }).filter((p) => p.inlineData || p.text);
}

async function gemini(o: { key: string; model: string; system: string; messages: Msg[]; tool: Tool; maxTokens: number; timeoutMs: number }): Promise<Any> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: o.system }] },
    contents: o.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: geminiParts(m.content) })),
    tools: [{ functionDeclarations: [{ name: o.tool.name, description: o.tool.description ?? o.tool.name, parameters: geminiSchema(o.tool.input_schema) }] }],
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [o.tool.name] } },
    // Newer Flash models think before answering, and thinking counts toward the output budget.
    generationConfig: { maxOutputTokens: Math.max(4096, o.maxTokens * 4) },
  });
  const call = (model: string) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": o.key, "content-type": "application/json" }, body, signal: AbortSignal.timeout(o.timeoutMs),
  });
  let r = await call(o.model);
  if (r.status === 404 && o.model !== GEMINI_FALLBACK) r = await call(GEMINI_FALLBACK);
  const res = await r.json().catch(() => ({}));
  if (!r.ok) throw friendly(r.status, res?.error?.message);
  const parts: Any[] = res?.candidates?.[0]?.content?.parts ?? [];
  return parts.find((p) => p?.functionCall?.name === o.tool.name)?.functionCall?.args;
}
