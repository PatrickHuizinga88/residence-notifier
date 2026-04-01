-- HuurRadar Database Schema
-- Initial migration: all tables, enums, indexes, and RLS policies

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE property_type AS ENUM ('apartment', 'house', 'room', 'studio');
CREATE TYPE furnished_status AS ENUM ('furnished', 'unfurnished', 'negotiable');
CREATE TYPE landlord_type AS ENUM ('agency', 'private', 'housing_corp');
CREATE TYPE listing_status AS ENUM ('active', 'rented', 'expired');
CREATE TYPE notification_channel AS ENUM ('email', 'whatsapp');
CREATE TYPE notification_frequency AS ENUM ('daily', 'weekly');

-- ============================================================================
-- LISTINGS
-- ============================================================================

CREATE TABLE listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_url text NOT NULL,
  source_listing_id text NOT NULL,
  title text NOT NULL,
  description text,
  price_monthly integer NOT NULL,
  price_includes text[],
  city text NOT NULL,
  neighborhood text,
  postal_code text,
  address text,
  latitude float8,
  longitude float8,
  surface_m2 integer,
  rooms integer,
  bedrooms integer,
  property_type property_type NOT NULL,
  furnished furnished_status,
  available_from date,
  minimum_stay_months integer,
  energy_label text,
  images text[],
  landlord_type landlord_type,
  pets_allowed boolean,
  income_requirement integer,
  ai_score float4,
  ai_summary text,
  status listing_status NOT NULL DEFAULT 'active',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_source_listing UNIQUE (source, source_listing_id)
);

-- Indexes for optimized search queries
CREATE INDEX idx_listings_city ON listings (city);
CREATE INDEX idx_listings_price ON listings (price_monthly);
CREATE INDEX idx_listings_status ON listings (status);
CREATE INDEX idx_listings_city_price_status ON listings (city, price_monthly, status);
CREATE INDEX idx_listings_source ON listings (source);
CREATE INDEX idx_listings_first_seen ON listings (first_seen_at DESC);

-- ============================================================================
-- USER PROFILES (extends Supabase Auth)
-- ============================================================================

CREATE TABLE user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- SEARCH PROFILES
-- ============================================================================

CREATE TABLE search_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  city text,
  neighborhoods text[],
  min_price integer,
  max_price integer,
  min_surface_m2 integer,
  min_rooms integer,
  min_bedrooms integer,
  property_types property_type[],
  furnished furnished_status[],
  radius_km integer,
  center_latitude float8,
  center_longitude float8,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_search_profiles_user ON search_profiles (user_id);

-- ============================================================================
-- NOTIFICATION SETTINGS
-- ============================================================================

CREATE TABLE notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_profile_id uuid NOT NULL REFERENCES search_profiles(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL,
  frequency notification_frequency NOT NULL DEFAULT 'daily',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_notification_profile_channel UNIQUE (search_profile_id, channel)
);

-- ============================================================================
-- NOTIFICATION LOG
-- ============================================================================

CREATE TABLE notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES listings(id) ON DELETE SET NULL,
  channel notification_channel NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_log_user ON notification_log (user_id, sent_at DESC);

-- ============================================================================
-- FAVORITES
-- ============================================================================

CREATE TABLE favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_favorite UNIQUE (user_id, listing_id)
);

CREATE INDEX idx_favorites_user ON favorites (user_id);

-- ============================================================================
-- SCRAPE LOGS
-- ============================================================================

CREATE TABLE scrape_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  listings_new integer DEFAULT 0,
  listings_updated integer DEFAULT 0,
  errors text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scrape_logs_source ON scrape_logs (source, started_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Listings: public read, no direct user write
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Listings are publicly readable"
  ON listings FOR SELECT
  USING (true);

-- User profiles: users can only access their own
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Search profiles: users can only access their own
ALTER TABLE search_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own search profiles"
  ON search_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own search profiles"
  ON search_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own search profiles"
  ON search_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own search profiles"
  ON search_profiles FOR DELETE
  USING (auth.uid() = user_id);

-- Notification settings: via search profile ownership
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification settings"
  ON notification_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM search_profiles
      WHERE search_profiles.id = notification_settings.search_profile_id
      AND search_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own notification settings"
  ON notification_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM search_profiles
      WHERE search_profiles.id = notification_settings.search_profile_id
      AND search_profiles.user_id = auth.uid()
    )
  );

-- Favorites: users can only access their own
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own favorites"
  ON favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own favorites"
  ON favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites"
  ON favorites FOR DELETE
  USING (auth.uid() = user_id);

-- Notification log: users can only view their own
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification log"
  ON notification_log FOR SELECT
  USING (auth.uid() = user_id);

-- Scrape logs: no public access (service role only)
ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_search_profiles_updated_at
  BEFORE UPDATE ON search_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_notification_settings_updated_at
  BEFORE UPDATE ON notification_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
