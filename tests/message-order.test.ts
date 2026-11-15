// bun test tests/message-order.test.ts — Message to order (rules, no AI).
import { describe, expect, test } from "bun:test";
import { draftTotal, messageToOrders, normalisePhone } from "../src/lib/message-order";

const products = [
  { id: "multi", name: "6ft multi-game table", price: 6900, aliases: ["4-in-1", "snooker"] },
  { id: "small", name: "4ft 3-in-1 multi table", price: 3000, aliases: ["4ft"] },
  { id: "tt", name: "Table tennis table", price: 6500, aliases: ["table tennis"] },
  { id: "frontal", name: "Frontal wig", price: 45000, aliases: ["frontals", "frontal"] },
];

describe("message to order", () => {
  test("Ghana phones", () => {
    expect(normalisePhone("0538699550", "233")).toBe("233538699550");
    expect(normalisePhone("+233 24 147 0195", "233")).toBe("233241470195");
    expect(normalisePhone("08031234567", "234")).toBe("2348031234567");
    expect(normalisePhone("12", "233")).toBe("");
  });

  test("a customer's own message", () => {
    const [d] = messageToOrders("I want 2 table tennis, deliver to Kumasi. Name: Prince Owusu 0548787754. I will pay on delivery", products, { dial: "233" });
    expect(d!.items).toEqual([{ productId: "tt", qty: 2 }]);
    expect(d!.name).toBe("Prince Owusu");
    expect(d!.phone).toBe("233548787754");
    expect(d!.town).toBe("Kumasi");
    expect(d!.payOnDelivery).toBe(true);
    expect(draftTotal(d!, products)).toBe(13000);
  });

  test("the StitchBook example: quantity, name, deposit in k", () => {
    const [d] = messageToOrders("2 frontals for Tola, deposit 30k", products, { senderName: "Tola" });
    expect(d!.items).toEqual([{ productId: "frontal", qty: 2 }]);
    expect(d!.deposit).toBe(30000);
    expect(d!.name).toBe("Tola");
  });

  test("price the seller quoted finds the product", () => {
    const [d] = messageToOrders("ok send the GH₵ 6,900 one to Tema", products, { dial: "233" });
    expect(d!.items).toEqual([{ productId: "multi", qty: 1 }]);
    expect(d!.town).toBe("Tema");
  });

  test("an agent's list becomes one draft per customer", () => {
    const msg = "Orders today 4ft\nDavid Dapaah Kumasi 0538699550\nMr Okyere Ejisu 0550671301\n2 table tennis\nWilliams goodnews Ho 0240895130";
    const ds = messageToOrders(msg, products, { dial: "233" });
    expect(ds).toHaveLength(3);
    expect(ds[0]).toMatchObject({ name: "David Dapaah", town: "Kumasi", phone: "233538699550" });
    expect(ds[0]!.items).toEqual([{ productId: "small", qty: 1 }]);
    expect(ds[1]).toMatchObject({ name: "Mr Okyere", town: "Ejisu" });
    expect(ds[2]).toMatchObject({ name: "Williams goodnews", town: "Ho", phone: "233240895130" });
    expect(ds[2]!.items).toEqual([{ productId: "tt", qty: 2 }]);
  });

  test("13,000 is not the 3,000 table; 'who' is not the town Ho", () => {
    const [d] = messageToOrders("who has 13,000 budget", products, { dial: "233" });
    expect(d!.items).toEqual([]);
    expect(d!.town).toBe("");
  });
});
