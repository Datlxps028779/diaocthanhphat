/*
# Advanced Features Migration

1. New Columns on properties
   - latitude, longitude (DECIMAL) for geospatial map display
   - vr_tour_url (TEXT) for 360° VR tour embed links
   - formatted_address (TEXT) for display address
   - contact_zalo (TEXT) for Zalo contact link

2. New Columns on user_listings
   - Same five columns as properties above

3. New Column on profiles
   - role TEXT with CHECK constraint (user|admin), default 'user'
   - Used for admin panel access control
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='vr_tour_url') THEN
    ALTER TABLE properties ADD COLUMN vr_tour_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='formatted_address') THEN
    ALTER TABLE properties ADD COLUMN formatted_address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='contact_zalo') THEN
    ALTER TABLE properties ADD COLUMN contact_zalo TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='latitude') THEN
    ALTER TABLE properties ADD COLUMN latitude DECIMAL(10,8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='longitude') THEN
    ALTER TABLE properties ADD COLUMN longitude DECIMAL(11,8);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_listings' AND column_name='vr_tour_url') THEN
    ALTER TABLE user_listings ADD COLUMN vr_tour_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_listings' AND column_name='formatted_address') THEN
    ALTER TABLE user_listings ADD COLUMN formatted_address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_listings' AND column_name='contact_zalo') THEN
    ALTER TABLE user_listings ADD COLUMN contact_zalo TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_listings' AND column_name='latitude') THEN
    ALTER TABLE user_listings ADD COLUMN latitude DECIMAL(10,8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_listings' AND column_name='longitude') THEN
    ALTER TABLE user_listings ADD COLUMN longitude DECIMAL(11,8);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='role') THEN
    ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));
  END IF;
END $$;
