/**
 * Invoice / receipt as a PDF, made in the browser (no server) so it can be downloaded or sent
 * through the linked WhatsApp as a document. Becomes a receipt once the order is fully paid.
 */
import { jsPDF } from "jspdf";

export interface InvoicePdfInput {
  business: string; businessPhone?: string;
  number: string; orderRef: string; date: string;
  customer: { name: string; phone?: string; address?: string };
  lines: { name: string; qty: number; unitPrice: number }[];
  delivery: number; total: number; paid: number;
  money: (n: number) => string;
  footer?: string;
}

/** jsPDF's built-in fonts are Latin-1: swap symbols they can't draw for readable text. */
export function pdfSafe(s: string): string {
  return s.replace(/₦/g, "NGN ").replace(/GH₵|₵/g, "GHS ").replace(/₹/g, "INR ").replace(/[–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "").replace(/ {2,}/g, " ");
}

export function isReceipt(i: Pick<InvoicePdfInput, "total" | "paid">): boolean { return i.total > 0 && i.paid >= i.total; }

export function invoicePdf(i: InvoicePdfInput): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const t = (s: string) => pdfSafe(s);
  const W = doc.internal.pageSize.getWidth(); const L = 48; const R = W - 48;
  let y = 60;
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text(t(i.business), L, y);
  doc.setFontSize(14); doc.text(isReceipt(i) ? "RECEIPT" : "INVOICE", R, y, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); y += 16;
  if (i.businessPhone) doc.text(t(i.businessPhone), L, y);
  doc.text(t(`${i.number} - Order ${i.orderRef}`), R, y, { align: "right" }); y += 14;
  doc.text(t(i.date), R, y, { align: "right" }); y += 28;
  doc.setFont("helvetica", "bold"); doc.text("Bill to", L, y); doc.setFont("helvetica", "normal"); y += 14;
  for (const s of [i.customer.name, i.customer.phone, i.customer.address].filter(Boolean) as string[]) {
    for (const ln of doc.splitTextToSize(t(s), 300) as string[]) { doc.text(ln, L, y); y += 13; }
  }
  y += 14;
  doc.setFont("helvetica", "bold"); doc.text("Item", L, y); doc.text("Qty", 340, y, { align: "right" }); doc.text("Price", 430, y, { align: "right" }); doc.text("Amount", R, y, { align: "right" });
  y += 6; doc.line(L, y, R, y); y += 16; doc.setFont("helvetica", "normal");
  for (const l of i.lines) {
    const name = doc.splitTextToSize(t(l.name), 260) as string[];
    doc.text(name, L, y); doc.text(String(l.qty), 340, y, { align: "right" });
    doc.text(t(i.money(l.unitPrice)), 430, y, { align: "right" }); doc.text(t(i.money(l.unitPrice * l.qty)), R, y, { align: "right" });
    y += 14 * name.length + 4;
    if (y > 740) { doc.addPage(); y = 60; }
  }
  doc.line(L, y - 6, R, y - 6); y += 8;
  const row = (label: string, v: string, bold = false) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.text(label, 380, y); doc.text(t(v), R, y, { align: "right" }); y += 16; };
  if (i.delivery) row("Delivery", i.money(i.delivery));
  row("Total", i.money(i.total), true);
  row("Paid", i.money(i.paid));
  if (!isReceipt(i)) row("Balance due", i.money(Math.max(0, i.total - i.paid)), true);
  y += 18; doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(doc.splitTextToSize(t(i.footer ?? (isReceipt(i) ? "Paid in full. Thank you for your order!" : "Thank you for your order.")), R - L) as string[], L, y);
  return doc.output("blob");
}
