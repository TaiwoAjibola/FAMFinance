-- Guided first-time experience.
--
-- Adds a persisted onboarding state to the household. It deliberately lives in
-- the database rather than localStorage: a "have I finished setup?" flag that
-- only exists in one browser is lost when the user installs the PWA on a phone
-- or signs in elsewhere, which would re-prompt them forever.
--
-- Existing rows keep their data; nothing is dropped.

ALTER TABLE households
  ADD COLUMN IF NOT EXISTS onboarding_state TEXT NOT NULL DEFAULT 'pending';

-- Optional free-text note captured while creating the first account.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Guard against values written before the constraint existed.
UPDATE households
SET onboarding_state = 'pending'
WHERE onboarding_state IS NULL
   OR onboarding_state NOT IN ('pending', 'completed', 'skipped');

ALTER TABLE households DROP CONSTRAINT IF EXISTS households_onboarding_state_check;
ALTER TABLE households
  ADD CONSTRAINT households_onboarding_state_check
  CHECK (onboarding_state IN ('pending', 'completed', 'skipped'));

-- Households that already have money set up are considered done — this keeps
-- existing users from ever being interrupted by the new-user flow.
UPDATE households h
SET onboarding_state = 'completed'
WHERE EXISTS (SELECT 1 FROM accounts a WHERE a.household_id = h.id);
