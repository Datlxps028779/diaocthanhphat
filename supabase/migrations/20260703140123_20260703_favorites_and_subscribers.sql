/*
# Add property_favorites and subscribers tables

1. New Tables
   - `property_favorites`: Users can save/unsave properties persistently.
     - `id` uuid PK
     - `user_id` uuid FK → auth.users (owner, default auth.uid())
     - `property_id` uuid FK → properties
     - `created_at` timestamp
     - UNIQUE(user_id, property_id) prevents duplicates

   - `subscribers`: Newsletter/notification email subscriptions.
     - `id` uuid PK
     - `email` text UNIQUE NOT NULL
     - `name` text nullable
     - `phone` text nullable
     - `area_interest` text nullable
     - `is_active` boolean default true
     - `created_at` timestamp

2. Security
   - `property_favorites`: RLS enabled, owner-scoped CRUD for authenticated users
   - `subscribers`: RLS enabled, anon+authenticated INSERT (public subscribe), authenticated SELECT/DELETE

3. Notes
   - Favorites owned by auth.uid() — must be logged in to save
   - Subscribers allows anonymous insert so visitors can subscribe without account
*/

-- ─── property_favorites ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON property_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_property ON property_favorites(property_id);

ALTER TABLE property_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_favorites" ON property_favorites;
CREATE POLICY "select_own_favorites" ON property_favorites FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_favorites" ON property_favorites;
CREATE POLICY "insert_own_favorites" ON property_favorites FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_favorites" ON property_favorites;
CREATE POLICY "delete_own_favorites" ON property_favorites FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ─── subscribers ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  phone text,
  area_interest text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);

ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_subscribers" ON subscribers;
CREATE POLICY "anon_insert_subscribers" ON subscribers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_select_subscribers" ON subscribers;
CREATE POLICY "auth_select_subscribers" ON subscribers FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_update_subscribers" ON subscribers;
CREATE POLICY "auth_update_subscribers" ON subscribers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_subscribers" ON subscribers;
CREATE POLICY "auth_delete_subscribers" ON subscribers FOR DELETE
  TO authenticated USING (true);
