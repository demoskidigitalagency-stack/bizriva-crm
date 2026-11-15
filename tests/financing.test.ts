// bun test tests/financing.test.ts — financing readiness score.
import { expect, test } from "bun:test";
import { financingScore, type FinOrder } from "../src/domain/financing";

const now = new Date("2026-11-15T12:00:00Z");
const o = (month: string, status: string, total = 5000, contactId = "a", paid = true): FinOrder => ({ placedAt: `${month}-10T10:00:00Z`, status, total, contactId, paymentStatus: paid ? "paid" : "unpaid" });

test("no orders: not ready, every part explains why", () => {
  const s = financingScore([], now);
  expect(s.score).toBe(0);
  expect(s.band).toBe("Not ready yet");
  expect(s.parts).toHaveLength(6);
});

test("steady six months, paid, repeat buyers: strong", () => {
  const list: FinOrder[] = [];
  for (const m of ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]) for (let i = 0; i < 8; i++) list.push(o(m, "delivered", 5000, `c${i}`));
  const s = financingScore(list, now);
  expect(s.score).toBe(100);
  expect(s.band).toBe("Strong");
  expect(s.months.map((m) => m.delivered)).toEqual([8, 8, 8, 8, 8, 8]);
});

test("returns and unpaid deliveries cost points and give tips", () => {
  const list = [o("2026-10", "delivered", 5000, "a", false), o("2026-10", "returned"), o("2026-11", "returned"), o("2026-11", "delivered", 5000, "b", false)];
  const s = financingScore(list, now);
  expect(s.parts.find((p) => p.label === "Delivery success")!.points).toBe(8);
  expect(s.parts.find((p) => p.label === "Money collected")!.points).toBe(0);
  expect(s.tips.length).toBeGreaterThanOrEqual(3);
  expect(s.score).toBeLessThan(35);
});

test("orders older than 6 months don't count toward recent months", () => {
  const s = financingScore([o("2026-01", "delivered")], now);
  expect(s.parts[0]!.points).toBe(0);
});
