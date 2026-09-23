-- Add unique token column for shareable invite links
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex');

-- Backfill existing invitations with tokens
UPDATE invitations SET token = encode(gen_random_bytes(16), 'hex') WHERE token IS NULL;

-- Make token NOT NULL after backfill
ALTER TABLE invitations ALTER COLUMN token SET NOT NULL;

-- Allow public read access to invitations by token (for the invite page)
CREATE POLICY "Public can view invitation by token" ON invitations
  FOR SELECT USING (true);
