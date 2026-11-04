/**
 * Pull a customer's details out of their chat messages (Sandala's
 * "auto-extracted contact card"). Simple patterns, tuned for Nigerian
 * phone numbers and addresses. The backend can swap in an AI extractor
 * behind the same return shape.
 */
import type { Conversation } from "./types";

export interface ExtractedDetails {
  name?: string;
  phone?: string;
  address?: string;
  landmark?: string;
  city?: string;
}

const CITIES = ["Lagos", "Lekki", "Ikeja", "Victoria Island", "Ajah", "Surulere", "Yaba", "Abuja", "Wuse", "Ibadan", "Port Harcourt", "Benin", "Enugu", "Kano", "Abeokuta", "Owerri"];
const CITY_OF: Record<string, string> = { Lekki: "Lagos", Ikeja: "Lagos", "Victoria Island": "Lagos", Ajah: "Lagos", Surulere: "Lagos", Yaba: "Lagos", Wuse: "Abuja" };

const PHONE = /(?:\+?234[\s-]?|0)[789][01]\d[\s-]?\d{3}[\s-]?\d{4}/;
const NAME = /(?:[Mm]y name is|[Tt]his is|I am|I'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/;
const ADDRESS = /(?:deliver(?:y)?\s+(?:it\s+)?to|send\s+(?:it\s+)?to|address(?:\s+is)?\s*:?)\s+((?:no\.?\s*)?\d[^.\n]{6,90}?)(?=\.\s|\.$|\s+(?:landmark|close to|near|opposite|beside|you can|my number|call)\b|$)/i;
const LANDMARK = /(?:landmark\s*:?|close to|near|opposite|beside)\s+(?:the\s+)?([^.\n]{3,60}?)(?=\.|\s+(?:you can|my number|call)\b|\s+\+?\d|$)/i;

function normalisePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("234") ? `0${digits.slice(3)}` : digits;
  return local.length === 11 ? `+234 ${local.slice(1, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : raw.trim();
}

export function extractDetails(conversation: Conversation): ExtractedDetails {
  const text = conversation.messages.filter((m) => m.direction === "in").map((m) => m.body).join("\n");
  const out: ExtractedDetails = {};
  const phone = text.match(PHONE)?.[0];
  if (phone) out.phone = normalisePhone(phone);
  const name = text.match(NAME)?.[1];
  if (name) out.name = name;
  const address = text.match(ADDRESS)?.[1]?.trim().replace(/[,\s]+$/, "");
  if (address) out.address = address;
  const landmark = text.match(LANDMARK)?.[1]?.trim();
  if (landmark) out.landmark = landmark;
  const city = CITIES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(address ?? text));
  if (city) out.city = CITY_OF[city] ?? city;
  return out;
}
