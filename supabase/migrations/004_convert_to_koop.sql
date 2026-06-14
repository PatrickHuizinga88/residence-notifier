-- ============================================================================
-- Convert HuurRadar (rental) → KoopRadar (for-sale)
-- Renames the price column, drops rental-only fields and updates the email digest.
-- Safe to replay on a fresh database (runs after 001-003 in order).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- LISTINGS: rename price column (indexes follow the column automatically)
-- ----------------------------------------------------------------------------

ALTER TABLE listings RENAME COLUMN price_monthly TO price;

-- Drop rental-only columns
ALTER TABLE listings
  DROP COLUMN IF EXISTS price_includes,
  DROP COLUMN IF EXISTS furnished,
  DROP COLUMN IF EXISTS available_from,
  DROP COLUMN IF EXISTS minimum_stay_months,
  DROP COLUMN IF EXISTS landlord_type,
  DROP COLUMN IF EXISTS pets_allowed,
  DROP COLUMN IF EXISTS income_requirement;

-- ----------------------------------------------------------------------------
-- SEARCH PROFILES: drop rental-only filter
-- ----------------------------------------------------------------------------

ALTER TABLE search_profiles
  DROP COLUMN IF EXISTS furnished;

-- ----------------------------------------------------------------------------
-- ENUMS: a sold listing is now 'sold' instead of 'rented', and the rental-only
-- enums are no longer referenced by any column.
-- ----------------------------------------------------------------------------

ALTER TYPE listing_status RENAME VALUE 'rented' TO 'sold';

DROP TYPE IF EXISTS furnished_status;
DROP TYPE IF EXISTS landlord_type;

-- ----------------------------------------------------------------------------
-- EMAIL DIGEST: rebrand to KoopRadar and use the purchase price (k.k.)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION send_new_listings_email()
RETURNS void AS $$
DECLARE
  resend_key text;
  recipient text;
  sender text;
  site_url text;
  listing_count integer;
  email_html text;
  listing_row record;
BEGIN
  SELECT value INTO resend_key FROM app_settings WHERE key = 'resend_api_key';
  SELECT value INTO recipient FROM app_settings WHERE key = 'notification_email';
  SELECT value INTO sender FROM app_settings WHERE key = 'notification_from';
  SELECT value INTO site_url FROM app_settings WHERE key = 'site_url';

  -- Skip if not configured
  IF resend_key = '' OR recipient = '' THEN
    RETURN;
  END IF;

  -- Count new listings from last 24 hours
  SELECT count(*) INTO listing_count
  FROM listings
  WHERE first_seen_at > now() - interval '24 hours'
    AND status = 'active';

  IF listing_count = 0 THEN
    RETURN;
  END IF;

  -- Build HTML email
  email_html := '<html><body style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">';
  email_html := email_html || '<h2 style="color: #1a1a1a;">🏠 KoopRadar: ' || listing_count || ' nieuwe woning(en)</h2>';
  email_html := email_html || '<p style="color: #666;">De afgelopen 24 uur gevonden:</p>';
  email_html := email_html || '<table style="width: 100%; border-collapse: collapse;">';

  FOR listing_row IN
    SELECT title, city, price, surface_m2, rooms, source_url, images
    FROM listings
    WHERE first_seen_at > now() - interval '24 hours'
      AND status = 'active'
    ORDER BY price ASC
    LIMIT 20
  LOOP
    email_html := email_html || '<tr style="border-bottom: 1px solid #eee;">';
    email_html := email_html || '<td style="padding: 12px 0;">';

    -- Thumbnail
    IF listing_row.images IS NOT NULL AND array_length(listing_row.images, 1) > 0 THEN
      email_html := email_html || '<img src="' || listing_row.images[1] || '" style="width:80px;height:60px;object-fit:cover;border-radius:4px;float:left;margin-right:12px;" />';
    END IF;

    email_html := email_html || '<strong><a href="' || listing_row.source_url || '" style="color: #2563eb; text-decoration: none;">' || listing_row.title || '</a></strong><br/>';
    email_html := email_html || '<span style="color: #666; font-size: 14px;">' || listing_row.city;

    IF listing_row.surface_m2 IS NOT NULL THEN
      email_html := email_html || ' · ' || listing_row.surface_m2 || ' m²';
    END IF;
    IF listing_row.rooms IS NOT NULL THEN
      email_html := email_html || ' · ' || listing_row.rooms || ' kamers';
    END IF;

    email_html := email_html || '</span><br/>';
    email_html := email_html || '<strong style="color: #16a34a;">€' || (listing_row.price / 100) || ' k.k.</strong>';
    email_html := email_html || '</td></tr>';
  END LOOP;

  email_html := email_html || '</table>';

  IF listing_count > 20 THEN
    email_html := email_html || '<p style="color: #666;">... en ' || (listing_count - 20) || ' meer. <a href="' || site_url || '/woningen">Bekijk alles</a></p>';
  END IF;

  email_html := email_html || '<hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />';
  email_html := email_html || '<p style="color: #999; font-size: 12px;">KoopRadar — automatische koopwoning alerts</p>';
  email_html := email_html || '</body></html>';

  -- Send via Resend API
  PERFORM net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || resend_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', COALESCE(sender, 'KoopRadar <onboarding@resend.dev>'),
      'to', recipient,
      'subject', '🏠 ' || listing_count || ' nieuwe koopwoning(en) gevonden',
      'html', email_html
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- Rebrand the default sender if it was never customised
-- ----------------------------------------------------------------------------

UPDATE app_settings
SET value = 'KoopRadar <onboarding@resend.dev>'
WHERE key = 'notification_from'
  AND value = 'HuurRadar <onboarding@resend.dev>';
