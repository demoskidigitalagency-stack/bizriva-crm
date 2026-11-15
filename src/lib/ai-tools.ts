/** Calls the ai-tools Edge Function (business's own AI key). Returns the data or a readable error. */
import { supabase } from "@/lib/supabase";

export async function aiTool<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const sb = supabase();
  if (!sb) return { error: "AI tools work once your business is live." };
  const { data, error } = await sb.functions.invoke("ai-tools", { body });
  if (!error) return { data: data as T };
  let msg = "The AI couldn't do that right now.";
  if ("context" in error) { try { msg = (await (error as { context: Response }).context.json()).error ?? msg; } catch { /* keep */ } }
  return { error: msg };
}

/** File → base64 (no data: prefix), shrinking big photos so the request stays small. */
export async function imageBase64(f: File, max = 1280): Promise<{ data: string; mime: string }> {
  const bmp = await createImageBitmap(f);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.85);
  return { data: url.slice(url.indexOf(",") + 1), mime: "image/jpeg" };
}
