// bun test tests/invoice-pdf.test.ts — the invoice / receipt PDF.
import { expect, test } from "bun:test";
import { invoicePdf, isReceipt, pdfSafe } from "../src/lib/invoice-pdf";

test("symbols the PDF fonts can't draw are written out", () => {
  expect(pdfSafe("GH₵6,900 – ₦3,000")).toBe("GHS 6,900 - NGN 3,000");
  expect(pdfSafe("Ama 😊 Kumasi")).toBe("Ama Kumasi");
});

test("a receipt once fully paid; makes a real PDF", async () => {
  expect(isReceipt({ total: 6900, paid: 6900 })).toBe(true);
  expect(isReceipt({ total: 6900, paid: 1000 })).toBe(false);
  const b = invoicePdf({ business: "Dxmart", number: "INV-0001", orderRef: "ORD-1", date: "15 Nov 2026", customer: { name: "Prince Owusu", phone: "+233548787754", address: "Atonsu, Kumasi" },
    lines: [{ name: "6ft multi-game table", qty: 1, unitPrice: 6900 }], delivery: 0, total: 6900, paid: 1000, money: (n) => `GH₵${n.toLocaleString()}` });
  const head = new TextDecoder().decode(new Uint8Array(await b.arrayBuffer()).slice(0, 5));
  expect(head).toBe("%PDF-");
  expect(b.size).toBeGreaterThan(1500);
});
