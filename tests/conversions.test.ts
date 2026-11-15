// bun test tests/conversions.test.ts — sales sent back to Meta and TikTok.
import { expect, test } from "bun:test";
import { request, sha256, verdict, type Job } from "../supabase/functions/conversions-send/events";

const job: Job = { id: "1", platform: "meta", event_id: "bz_BZ-1", value: 6900, currency: "GHS", at: 1794700000, pixel: "123456789", token: "EAAtoken_long_enough_123", test_code: "TEST1",
  phone: "233548787754", email: "", name: "Prince Owusu", city: "Kumasi", ad_id: null, contents: [{ id: "p1", quantity: 1, price: 6900, name: "6ft table" }] };

test("Meta: hashed phone and name, value and currency, no raw personal data", async () => {
  const r = await request(job);
  if ("error" in r) throw new Error(r.error);
  expect(r.url).toContain("/123456789/events");
  const body = String(r.init.body);
  expect(body).not.toContain("233548787754");
  expect(body).not.toContain("Prince");
  const d = JSON.parse(body);
  expect(d.data[0].user_data.ph[0]).toBe(await sha256("233548787754"));
  expect(d.data[0].custom_data).toMatchObject({ value: 6900, currency: "GHS" });
  expect(d.test_event_code).toBe("TEST1");
});

test("TikTok: CompletePayment with the token in a header", async () => {
  const r = await request({ ...job, platform: "tiktok", test_code: null });
  if ("error" in r) throw new Error(r.error);
  expect((r.init.headers as Record<string, string>)["Access-Token"]).toBe(job.token!);
  expect(JSON.parse(String(r.init.body)).data[0].event).toBe("CompletePayment");
});

test("missing token and platform answers", async () => {
  expect(await request({ ...job, token: null })).toEqual({ error: "The access token was removed — connect again" });
  expect(verdict("meta", 200, { events_received: 1 })).toBeNull();
  expect(verdict("meta", 400, { error: { message: "Invalid token" } })).toBe("400 Invalid token");
  expect(verdict("tiktok", 200, { code: 0 })).toBeNull();
  expect(verdict("tiktok", 200, { code: 40001, message: "bad pixel" })).toBe("200 bad pixel");
});
