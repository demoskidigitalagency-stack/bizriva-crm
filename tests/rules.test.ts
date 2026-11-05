// bun test tests/rules.test.ts — the order rules the app shares with the database triggers.
import { describe, expect, test } from "bun:test";
import { acceptsPayment, canMove, csvCell } from "../src/domain/rules";
import type { OrderStatus, OrderSummary } from "../src/domain/types";

const ALL: OrderStatus[] = ["pending_verification", "confirmed", "processing", "ready_for_dispatch", "dispatched", "in_transit", "delivered", "cancelled", "refused", "returned"];

describe("order status rules", () => {
  test("unverified orders must be confirmed first", () => {
    expect(canMove("pending_verification", "confirmed")).toBe(true);
    expect(canMove("pending_verification", "cancelled")).toBe(true);
    for (const to of ["processing", "ready_for_dispatch", "dispatched", "in_transit", "delivered", "refused", "returned"] as OrderStatus[]) {
      expect(canMove("pending_verification", to)).toBe(false);
    }
  });
  test("cancelled and returned are final", () => {
    for (const to of ALL) { expect(canMove("cancelled", to)).toBe(false); expect(canMove("returned", to)).toBe(false); }
  });
  test("forward along the delivery path, never back", () => {
    expect(canMove("confirmed", "ready_for_dispatch")).toBe(true);
    expect(canMove("ready_for_dispatch", "delivered")).toBe(true);
    expect(canMove("dispatched", "confirmed")).toBe(false);
    expect(canMove("delivered", "dispatched")).toBe(false);
    expect(canMove("in_transit", "pending_verification")).toBe(false);
  });
  test("cancel only before it leaves; refuse/return only after", () => {
    expect(canMove("dispatched", "cancelled")).toBe(false);
    expect(canMove("delivered", "cancelled")).toBe(false);
    expect(canMove("confirmed", "refused")).toBe(false);
    expect(canMove("in_transit", "refused")).toBe(true);
    expect(canMove("delivered", "returned")).toBe(true);
    expect(canMove("refused", "returned")).toBe(true);
    expect(canMove("confirmed", "returned")).toBe(false);
  });
  test("every move the Orders screen offers is allowed", () => {
    const offered: [OrderStatus, OrderStatus][] = [
      ["pending_verification", "confirmed"], ["pending_verification", "cancelled"], ["confirmed", "processing"], ["confirmed", "ready_for_dispatch"], ["confirmed", "cancelled"],
      ["processing", "ready_for_dispatch"], ["processing", "cancelled"], ["ready_for_dispatch", "dispatched"], ["ready_for_dispatch", "cancelled"],
      ["dispatched", "in_transit"], ["dispatched", "delivered"], ["dispatched", "refused"], ["in_transit", "delivered"], ["in_transit", "refused"], ["in_transit", "returned"],
      ["delivered", "returned"], ["refused", "returned"],
    ];
    for (const [a, b] of offered) expect(canMove(a, b)).toBe(true);
  });
});

describe("payments", () => {
  const o = (status: OrderStatus, total: number, amountPaid: number) => ({ status, total, amountPaid } as OrderSummary);
  test("closed or fully paid orders take no money", () => {
    expect(acceptsPayment(o("confirmed", 10000, 4000))).toBe(true);
    expect(acceptsPayment(o("confirmed", 10000, 10000))).toBe(false);
    expect(acceptsPayment(o("cancelled", 10000, 0))).toBe(false);
    expect(acceptsPayment(o("returned", 10000, 0))).toBe(false);
  });
});

describe("CSV export", () => {
  test("formulas are neutralised", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvCell("-1500")).toBe(`"-1500"`); // a plain negative number stays a number
    expect(csvCell("-cmd|' /C calc'!A0")).toBe(`"'-cmd|' /C calc'!A0"`);
  });
  test("phone numbers and text stay as they are", () => {
    expect(csvCell("+234 803 123 4567")).toBe(`"+234 803 123 4567"`);
    expect(csvCell("Ada Obi")).toBe(`"Ada Obi"`);
    expect(csvCell(15000)).toBe(`"15000"`);
  });
});
