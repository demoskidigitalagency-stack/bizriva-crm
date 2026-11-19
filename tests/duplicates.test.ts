// bun test tests/duplicates.test.ts — nameless WhatsApp customers are not duplicates of each other.
import { expect, test } from "bun:test";
import { findDuplicates, isPlaceholderName } from "../src/domain/repositories";
import { createInitialDatabase } from "../src/domain/database";

const base = createInitialDatabase();
const person = (id: string, firstName: string, lastName: string, phone: string, city = "") => ({ ...base.contacts[0]!, id, firstName, lastName, phone, city, email: undefined });

test("placeholder names never match each other", () => {
  const db = { ...base, contacts: [person("a", "Customer", "4567", "233244114567"), person("b", "Customer", "8899", "233200118899"), person("c", "Customer", "", "")] };
  expect(findDuplicates(db as never)).toEqual([]);
  expect(isPlaceholderName(db.contacts[0] as never)).toBe(true);
});

test("same phone in two formats is one person", () => {
  const db = { ...base, contacts: [person("a", "Customer", "4567", "0244114567"), person("b", "Ama", "Mensah", "+233 244 114 567")] };
  const g = findDuplicates(db as never);
  expect(g).toHaveLength(1);
  expect(g[0]!.reason).toContain("phone");
});
