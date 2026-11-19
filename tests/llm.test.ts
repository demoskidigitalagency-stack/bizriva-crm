// bun test tests/llm.test.ts — the Claude/Gemini adapter (no network).
import { expect, test } from "bun:test";
import { geminiParts, geminiSchema, isGemini, pickModel } from "../supabase/functions/ai-tools/llm";
import { PHOTO_TOOL, ADS_TOOL } from "../supabase/functions/ai-tools/tools";
import { RESPOND_TOOL } from "../supabase/functions/ai-reply/brain";

const G = "AIza" + "x".repeat(35);
test("tells the two kinds of key apart", () => {
  expect(isGemini(G)).toBe(true);
  expect(isGemini("sk-ant-api03-" + "x".repeat(30))).toBe(false);
});
test("model follows the key", () => {
  expect(pickModel(G, null, "claude-haiku-5-5")).toBe("gemini-flash-latest");
  expect(pickModel(G, "claude-sonnet-5-5", "claude-haiku-5-5")).toBe("gemini-flash-latest");
  expect(pickModel(G, "gemini-3.6-flash", "x")).toBe("gemini-3.6-flash");
  expect(pickModel("sk-ant-abc", "gemini-3.6-flash", "claude-haiku-5-5")).toBe("claude-haiku-5-5");
  expect(pickModel("sk-ant-abc", "claude-opus-5-5", "claude-haiku-5-5")).toBe("claude-opus-5-5");
});
test("schemas convert to Gemini's format, keeping fields and enums", () => {
  const s = geminiSchema(ADS_TOOL.input_schema);
  expect(s.type).toBe("OBJECT");
  expect(s.properties.variants.type).toBe("ARRAY");
  expect(s.properties.variants.maxItems).toBe("3");
  expect(s.properties.variants.items.properties.cta.enum).toContain("Order now");
  for (const t of [PHOTO_TOOL, RESPOND_TOOL]) expect(JSON.stringify(geminiSchema(t.input_schema))).not.toContain("additionalProperties");
});
test("images and text become Gemini parts", () => {
  const p = geminiParts([{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } }, { type: "text", text: "hi" }]);
  expect(p).toEqual([{ inlineData: { mimeType: "image/png", data: "AAA" } }, { text: "hi" }]);
  expect(geminiParts("hello")).toEqual([{ text: "hello" }]);
});
