-- Support the public agent listing projection's owner/status join.
CREATE INDEX IF NOT EXISTS user_listings_public_agent_idx
  ON public.user_listings (user_id, created_at DESC, property_id)
  WHERE status = 'approved';
