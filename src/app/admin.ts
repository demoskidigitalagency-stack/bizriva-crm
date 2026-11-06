import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** True when the signed-in person is a Bizriva platform admin (checked by the server). */
export function useIsAdmin(signedIn: boolean): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => { const sb = supabase(); if (sb && signedIn) void sb.rpc("admin_is").then(({ data }) => setOk(data === true)); else setOk(false); }, [signedIn]);
  return ok;
}
