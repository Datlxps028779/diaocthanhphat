\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  role text NOT NULL DEFAULT 'user'
);

CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  description text,
  price numeric,
  price_unit text,
  price_label text,
  price_per_month numeric,
  loan_support text,
  listing_type text,
  area_sqm numeric,
  address text,
  city text,
  district text,
  ward text,
  area_id uuid,
  district_id uuid,
  ward_id uuid,
  neighborhood_slug text,
  property_type_id uuid,
  image_url text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  legal_status text,
  bedrooms integer,
  bathrooms numeric,
  direction text,
  contact_name text,
  contact_phone text,
  contact_zalo text,
  amenities jsonb NOT NULL DEFAULT '[]'::jsonb,
  latitude numeric,
  longitude numeric,
  formatted_address text,
  vr_tour_url text,
  video_url text,
  meta_title text,
  meta_description text,
  focus_keywords text[],
  schema_markup jsonb,
  faq jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  is_hot boolean NOT NULL DEFAULT false
);

CREATE TABLE public.property_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE
);

CREATE TABLE public.neighborhoods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE
);

CREATE TABLE public.user_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  property_id uuid REFERENCES public.properties(id),
  status text NOT NULL,
  title text,
  description text,
  price numeric,
  price_unit text,
  price_label text,
  price_per_month numeric,
  loan_support text,
  listing_type text NOT NULL DEFAULT 'mua_ban',
  area_sqm numeric,
  address text,
  city text,
  district text,
  ward text,
  area_id uuid,
  district_id uuid,
  ward_id uuid,
  neighborhood_slug text,
  property_type_id uuid,
  image_url text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  legal_status text,
  bedrooms integer,
  bathrooms numeric,
  direction text,
  contact_name text,
  contact_phone text,
  contact_zalo text,
  amenities jsonb NOT NULL DEFAULT '[]'::jsonb,
  latitude numeric,
  longitude numeric,
  formatted_address text,
  vr_tour_url text,
  video_url text,
  meta_title text,
  meta_description text,
  focus_keywords text[],
  schema_markup jsonb,
  faq jsonb,
  expires_at timestamptz,
  reject_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_listings, public.properties, public.property_types, public.neighborhoods TO service_role;

CREATE TABLE public.user_listing_lifecycle_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES public.user_listings(id),
  event_type text NOT NULL,
  to_status text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.is_admin', true), '')::boolean, false)
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_customer_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id);
$$;

REVOKE ALL ON FUNCTION public.is_customer_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_customer_member(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin_or_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'staff'
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin_or_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_or_staff() TO authenticated, service_role;

CREATE TABLE public.staff_permission_catalog (
  module text NOT NULL,
  action text NOT NULL,
  label text NOT NULL,
  PRIMARY KEY (module, action)
);

CREATE TABLE public.staff_permission_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES public.profiles(id),
  module text NOT NULL,
  action text NOT NULL,
  scope_kind text NOT NULL DEFAULT 'global',
  scope_id uuid,
  granted_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (module, action) REFERENCES public.staff_permission_catalog(module, action),
  UNIQUE (staff_user_id, module, action, scope_kind, scope_id)
);

CREATE OR REPLACE FUNCTION public.has_staff_permission(
  p_module text,
  p_action text,
  p_area_id uuid DEFAULT NULL,
  p_district_id uuid DEFAULT NULL,
  p_ward_id uuid DEFAULT NULL,
  p_neighborhood_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.staff_permission_assignments a
      JOIN public.profiles p ON p.id = a.staff_user_id AND p.role = 'staff'
      WHERE a.staff_user_id = auth.uid()
        AND a.module = p_module
        AND a.action = p_action
        AND a.scope_kind = 'global'
        AND a.scope_id IS NULL
    )
$$;

REVOKE ALL ON FUNCTION public.has_staff_permission(text, text, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_staff_permission(text, text, uuid, uuid, uuid, uuid) TO authenticated;
