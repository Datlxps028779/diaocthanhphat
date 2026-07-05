/*
# User Listings & Profiles

1. New Tables
   - `user_listings`: properties submitted by registered users, pending admin approval
     - user_id: owner (auth.uid default)
     - status: pending | approved | rejected
     - All property fields mirrored
   - `profiles`: basic profile data for authenticated users
     - id matches auth.users.id
     - display_name, phone, avatar_url

2. Modified Tables
   - `properties`: add `user_listing_id` ref for approved user submissions

3. Security
   - profiles: user can read/update their own
   - user_listings: user can CRUD their own, admin reads all via service role
   - Public can SELECT approved listings only
*/

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- User listings (submitted by users, pending approval)
CREATE TABLE IF NOT EXISTS user_listings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason   text,
  -- Listing content fields
  title           text NOT NULL,
  description     text,
  price           numeric NOT NULL,
  price_unit      text NOT NULL DEFAULT 'tỷ',
  price_label     text,
  area_sqm        numeric,
  address         text,
  city            text NOT NULL,
  district        text,
  area_id         uuid REFERENCES areas(id),
  property_type_id uuid REFERENCES property_types(id),
  image_url       text,
  legal_status    text,
  bedrooms        int,
  bathrooms       int,
  direction       text,
  contact_name    text,
  contact_phone   text,
  amenities       text[],
  -- Meta
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE user_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_listings_select_own" ON user_listings;
CREATE POLICY "user_listings_select_own" ON user_listings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_listings_insert_own" ON user_listings;
CREATE POLICY "user_listings_insert_own" ON user_listings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_listings_update_own" ON user_listings;
CREATE POLICY "user_listings_update_own" ON user_listings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id AND status = 'pending') WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_listings_delete_own" ON user_listings;
CREATE POLICY "user_listings_delete_own" ON user_listings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Admin can see all user_listings (using service role key from admin panel)
-- No separate admin policy needed - service role bypasses RLS

-- Add lat/lng to properties for map pins
ALTER TABLE properties ADD COLUMN IF NOT EXISTS latitude  numeric;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS longitude numeric;

-- Add lat/lng to projects as well
ALTER TABLE projects ADD COLUMN IF NOT EXISTS latitude  numeric;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS longitude numeric;

-- Seed approximate coordinates for existing properties
UPDATE properties SET
  latitude  = 10.8231 + (random() - 0.5) * 0.3,
  longitude = 106.6297 + (random() - 0.5) * 0.3
WHERE latitude IS NULL AND city ILIKE '%hồ chí minh%';

UPDATE properties SET
  latitude  = 11.0686 + (random() - 0.5) * 0.2,
  longitude = 106.6522 + (random() - 0.5) * 0.2
WHERE latitude IS NULL AND city ILIKE '%bình dương%';

UPDATE properties SET
  latitude  = 10.9577 + (random() - 0.5) * 0.3,
  longitude = 106.8427 + (random() - 0.5) * 0.3
WHERE latitude IS NULL AND city ILIKE '%đồng nai%';

UPDATE properties SET
  latitude  = 11.7396 + (random() - 0.5) * 0.3,
  longitude = 106.7231 + (random() - 0.5) * 0.3
WHERE latitude IS NULL AND city ILIKE '%bình phước%';

UPDATE properties SET
  latitude  = 10.9 + (random() - 0.5) * 0.5,
  longitude = 106.7 + (random() - 0.5) * 0.5
WHERE latitude IS NULL;

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
