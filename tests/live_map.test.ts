// bun test tests/live_map.test.ts — real database rows become what the screens show.
import { describe, expect, test } from "bun:test";
import { toDatabase, type RawData } from "../src/data/live";
import { agentScores } from "../src/domain/ops";

const WS = "ws-1", AG = "u-agent", NOW = new Date("2026-11-06T12:00:00Z");
const empty = { complaints: [], consents: [], facts: [], accounts: [], templates: [], knowledge: [], rules: [], forms: [], connections: [], events: [], paymentEvents: [], campaigns: [], campaignResults: [], providers: [], meta: [] };
const raw: RawData = {
  ...empty,
  workspace: { id: WS, name: "Glow Naturals", currency: "NGN", plan: "trial", settings: { deliveryFee: 2500 }, assignment: { mode: "least_busy", call_within_minutes: 120 }, after_delivery: { receipt: true }, commission_per_order: 300, partner_accept_minutes: 60, brief_time: "07:30:00", created_at: "2026-11-04T10:00:00Z" },
  team: [{ user_id: "u-owner", role: "owner", email: "o@x.ng", full_name: "Ade Owner", on_duty: true, states: [], monthly_target: 0 }, { user_id: AG, role: "sales", email: "c@x.ng", full_name: "Chidi Okeke", on_duty: true, states: ["Lagos"], monthly_target: 30 }],
  contacts: [{ workspace_id: WS, id: "c1", name: "Ada Obi", phone: "+2348031234567", address: "12 Allen Avenue", location: "Ikeja", tags: [], created_at: "2026-11-04T10:00:00Z" }],
  leads: [{ workspace_id: WS, id: "l1", contact_id: "c1", stage: "converted", source_channel: "whatsapp", created_at: "2026-11-04T10:00:00Z" }],
  conversations: [{ workspace_id: WS, id: "v1", contact_id: "c1", channel: "whatsapp", status: "open", handled_by: "ai", created_at: "2026-11-04T10:00:00Z" }],
  messages: [{ workspace_id: WS, id: "m1", conversation_id: "v1", direction: "in", body: "Hi", status: "received", created_at: "2026-11-04T10:00:00Z" }],
  products: [{ workspace_id: WS, id: "p1", name: "Glow Body Cream", price: "12000.00", cost: "5000.00", stock: 40, reorder_level: 10, active: true, created_at: "2026-11-04T10:00:00Z" }],
  orders: [{ workspace_id: WS, id: "o1", ref: "BZ-1001", contact_id: "c1", status: "delivered", total: "26500.00", subtotal: 24000, delivery_fee: 2500, discount: 0, amount_paid: 26500, payment_method: "cod", channel: "whatsapp", assigned_to: AG, assigned_at: "2026-11-04T10:00:00Z", moved_from: [], receipt_no: "RCPT-BZ-1001", created_at: "2026-11-04T10:00:00Z" }],
  items: [{ workspace_id: WS, id: "i1", order_id: "o1", product_id: "p1", quantity: 2, unit_price: 12000 }],
  attempts: [{ workspace_id: WS, id: "a1", order_id: "o1", by_user: AG, via: "call", outcome: "reached", at: "2026-11-04T11:00:00Z" }],
  deliveries: [{ workspace_id: WS, id: "d1", order_id: "o1", partner_id: "k1", outcome: "delivered", fee: 2500, cash_collected: 26500, delivered_at: "2026-11-05T10:00:00Z", attempts: 0 }],
  payments: [{ workspace_id: WS, id: "pay1", order_id: "o1", contact_id: "c1", kind: "cod_cash", amount: 26500, method: "cash", paid_at: "2026-11-05T10:00:00Z" }],
  partners: [{ workspace_id: WS, id: "k1", name: "Kunle Rider", phone: "+2348065521180", kind: "rider", states: ["Lagos"], fees: { Lagos: 2500 }, failed_fee: 1000, vehicle: "bike", active: true }],
};

describe("live rows to screens", () => {
  const db = toDatabase(raw, NOW);
  const o = db.orders[0]!;
  test("orders keep their number, money as numbers, agent and line items", () => {
    expect(o.reference).toBe("BZ-1001");
    expect(o.total).toBe(26500);
    expect(typeof o.total).toBe("number");
    expect(o.status).toBe("delivered");
    expect(o.paymentMethod).toBe("cash_on_delivery");
    expect(o.assignedTo).toBe(AG);
    expect(o.contactAttempts?.length).toBe(1);
  });
  test("team roles use the app's names", () => {
    expect(db.team.find((m) => m.id === AG)?.role).toBe("sales_rep");
    expect(db.team.find((m) => m.id === AG)?.name).toBe("Chidi Okeke");
  });
  test("customer, product, rider and delivery link up", () => {
    expect(db.contacts[0]?.firstName).toBe("Ada");
    expect(db.products[0]?.price).toBe(12000);
    expect(db.riders[0]?.name).toBe("Kunle Rider");
    expect(db.deliveries.find((d) => d.orderId === "o1")?.status).toBe("delivered");
  });
  test("settings come from the business row", () => {
    expect(db.settings.businessName).toBe("Glow Naturals");
    expect(db.settings.deliveryFee).toBe(2500);
    expect(db.settings.commission?.perOrder).toBe(300);
  });
  test("commission counts the delivered, paid order", () => {
    const s = agentScores(db, NOW).find((x) => x.member.id === AG);
    expect(s?.closed).toBe(1);
    expect(s?.earned).toBe(300);
  });
});
