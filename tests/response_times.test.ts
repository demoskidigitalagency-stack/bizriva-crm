// bun test tests/response_times.test.ts — how response times are written.
import { expect, test } from "bun:test";
import { duration } from "../src/components/app/ResponseTimes";

test("durations read naturally", () => {
  expect([duration(0.5), duration(12), duration(60), duration(95), duration(1500), duration(2880), duration(null)]).toEqual(["30 sec", "12 min", "1 h", "1 h 35 min", "1 day 1 h", "2 days", "—"]);
});
