-- Bizriva's WhatsApp server runs on Render's free plan, which sleeps after 15 minutes
-- without visits. Visit its health check every 10 minutes so the WhatsApp links stay open.
-- On a paid always-on host this is harmless; remove it with: select cron.unschedule('bizriva-wa-keepalive');
select cron.schedule('bizriva-wa-keepalive', '*/10 * * * *', $job$
  select net.http_get(url := 'https://bizriva-whatsapp.onrender.com/', timeout_milliseconds := 60000)
$job$);
