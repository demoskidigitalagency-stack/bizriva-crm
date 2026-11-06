-- Security advisor follow-ups: these three are for signed-in people only (they also check membership inside).
revoke execute on function public.ad_performance(uuid, date, date), public.admin_is(), public.plan_usage(uuid) from public, anon;
grant execute on function public.ad_performance(uuid, date, date), public.admin_is(), public.plan_usage(uuid) to authenticated;
alter function private.media_ws(text) set search_path = '';
