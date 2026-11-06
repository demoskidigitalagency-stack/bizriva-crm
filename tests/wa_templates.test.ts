// bun test tests/wa_templates.test.ts — templates to Meta, and template variables when sending.
import { describe, expect, test } from "bun:test";
import { checkTemplate, createBody, metaLanguage, ourStatus, reasonFor } from "../supabase/functions/whatsapp-templates/meta";
import { payloadFor } from "../supabase/functions/whatsapp-send/payload";

const t = { id: "x", name: "order_confirm", category: "utility", language: "en", body: "Hi {{1}}, your order {{2}} is confirmed." };

describe("submitting to Meta", () => {
  test("body with examples for each variable", () => expect(createBody(t)).toEqual({ name: "order_confirm", language: "en", category: "UTILITY", components: [{ type: "BODY", text: t.body, example: { body_text: [["Ada", "BZ-1042"]] } }] }));
  test("no variables, no example", () => expect((createBody({ ...t, body: "Thanks for shopping with us!" }).components as object[])[0]).toEqual({ type: "BODY", text: "Thanks for shopping with us!" }));
  test("Pidgin goes as English", () => expect(metaLanguage("pcm")).toBe("en"));
  test("skipped variables are refused before Meta sees them", () => expect(checkTemplate({ ...t, body: "Hi {{1}}, your {{3}} is ready." })).toContain("in order"));
  test("ending on a variable is refused", () => expect(checkTemplate({ ...t, body: "Your order is {{1}}" })).toContain("start or end"));
  test("a good template passes", () => expect(checkTemplate(t)).toBeNull());
});

describe("Meta's answers", () => {
  test("statuses map to ours", () => expect(["APPROVED", "PENDING", "REJECTED", "PAUSED", "WEIRD"].map(ourStatus)).toEqual(["approved", "submitted", "rejected", "rejected", null]));
  test("rejection reasons are plain", () => expect(reasonFor("REJECTED", "TAG_CONTENT_MISMATCH")).toContain("doesn't match"));
  test("approved has no reason", () => expect(reasonFor("APPROVED")).toBeNull());
});

describe("sending a template with its variables", () => {
  const job = { id: "m", workspace_id: "w", phone_number_id: "1", token: "t", to_phone: "2348031234567", body: null, template_name: "order_confirm", in_window: false };
  test("variables go as body parameters", () => {
    const p = payloadFor({ ...job, template_params: ["Ada", "BZ-1001"] });
    expect("body" in p && p.body["template"]).toEqual({ name: "order_confirm", language: { code: "en" }, components: [{ type: "body", parameters: [{ type: "text", text: "Ada" }, { type: "text", text: "BZ-1001" }] }] });
  });
  test("no variables, no components", () => { const p = payloadFor({ ...job, template_params: [] }); expect("body" in p && p.body["template"]).toEqual({ name: "order_confirm", language: { code: "en" } }); });
});
