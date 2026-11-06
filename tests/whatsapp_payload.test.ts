// bun test tests/whatsapp_payload.test.ts — what goes to WhatsApp, and customers' files.
import { describe, expect, test } from "bun:test";
import { payloadFor, type Job } from "../supabase/functions/whatsapp-send/payload";
import { inboundPath, mediaOf } from "../supabase/functions/whatsapp-webhook/media";

const j: Job = { id: "m1", workspace_id: "w", phone_number_id: "123456", token: "t", to_phone: "+234 803 123 4567", body: "Here is the photo", template_name: null, in_window: true };

describe("sending", () => {
  test("text inside 24 hours", () => expect(payloadFor(j)).toEqual({ body: expect.objectContaining({ to: "2348031234567", type: "text" }) }));
  test("a photo with its caption and a 1-hour link", () => {
    const p = payloadFor({ ...j, media_path: "w/out/a.jpg", media_kind: "image" }, "https://x/sign/a.jpg?token=1");
    expect(p).toEqual({ body: expect.objectContaining({ type: "image", image: { link: "https://x/sign/a.jpg?token=1", caption: "Here is the photo" } }) });
  });
  test("a document keeps its file name", () => {
    const p = payloadFor({ ...j, media_path: "w/out/a.pdf", media_kind: "document", media_name: "Invoice BZ-1001.pdf" }, "https://x/a.pdf");
    expect((p as { body: Record<string, Record<string, unknown>> }).body["document"]?.["filename"]).toBe("Invoice BZ-1001.pdf");
  });
  test("voice notes have no caption", () => {
    const p = payloadFor({ ...j, media_path: "w/out/a.ogg", media_kind: "audio" }, "https://x/a.ogg") as { body: Record<string, Record<string, unknown>> };
    expect(p.body["audio"]).toEqual({ link: "https://x/a.ogg" });
  });
  test("files only inside 24 hours", () => expect(payloadFor({ ...j, in_window: false, media_path: "w/out/a.jpg", media_kind: "image" }, "https://x")).toEqual({ error: expect.stringMatching(/^Outside the 24-hour window/) }));
  test("missing file is a clear error", () => expect(payloadFor({ ...j, media_path: "w/out/a.jpg", media_kind: "image" }, null)).toEqual({ error: "The file couldn't be found" }));
  test("no phone", () => expect(payloadFor({ ...j, to_phone: null })).toEqual({ error: "No phone number for this customer" }));
});

describe("customers' files", () => {
  test("reads Meta's media id, kind and name", () => {
    expect(mediaOf({ type: "document", document: { id: "999", filename: "proof.pdf", mime_type: "application/pdf" } })).toEqual({ id: "999", kind: "document", name: "proof.pdf", mime: "application/pdf" });
    expect(mediaOf({ type: "audio", audio: { id: "7", mime_type: "audio/ogg; codecs=opus" } })?.mime).toBe("audio/ogg");
    expect(mediaOf({ type: "text", text: { body: "hi" } })).toBeNull();
  });
  test("stores under the business's in/ folder", () => expect(inboundPath("ws1", "m1", "image/jpeg")).toBe("ws1/in/m1.jpg"));
});
