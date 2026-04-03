-- ============================================================================
-- Update cron jobs to use Supabase Edge Functions instead of Netlify
-- ============================================================================

-- Add apify_api_token to app_settings
INSERT INTO app_settings (key, value) VALUES
  ('apify_api_token', '')
ON CONFLICT (key) DO NOTHING;

-- Update trigger_scrape to call Supabase Edge Function
CREATE OR REPLACE FUNCTION trigger_scrape()
RETURNS void AS $$
DECLARE
  supabase_url text;
  service_key text;
BEGIN
  -- SUPABASE_URL is available via current_setting in Supabase
  supabase_url := current_setting('app.settings.supabase_url', true);
  IF supabase_url IS NULL THEN
    SELECT value INTO supabase_url FROM app_settings WHERE key = 'site_url';
  END IF;

  -- Use service role key to invoke edge function
  service_key := current_setting('app.settings.service_role_key', true);
  IF service_key IS NULL THEN
    RAISE WARNING 'service_role_key not found, cannot invoke edge function';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/scrape?mode=start',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update notify function to call Supabase Edge Function
CREATE OR REPLACE FUNCTION trigger_notify()
RETURNS void AS $$
DECLARE
  supabase_url text;
  service_key text;
BEGIN
  supabase_url := current_setting('app.settings.supabase_url', true);
  IF supabase_url IS NULL THEN
    SELECT value INTO supabase_url FROM app_settings WHERE key = 'site_url';
  END IF;

  service_key := current_setting('app.settings.service_role_key', true);
  IF service_key IS NULL THEN
    RAISE WARNING 'service_role_key not found, cannot invoke edge function';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update cron jobs
SELECT cron.unschedule('daily-scrape');
SELECT cron.unschedule('daily-email-digest');

SELECT cron.schedule(
  'daily-scrape',
  '0 8 * * *',
  $$SELECT trigger_scrape()$$
);

SELECT cron.schedule(
  'daily-email-digest',
  '30 8 * * *',
  $$SELECT trigger_notify()$$
);
