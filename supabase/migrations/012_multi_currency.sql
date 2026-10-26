-- Multi-currency support (recording + display only, no FX conversion).
--
-- `households.currency` and `accounts.currency` already exist from the original
-- schema, so no table changes are required. This migration only normalises
-- existing data and documents the supported list.
--
-- Deliberately NO check constraint against a hard-coded currency list: the
-- supported set is owned by the application (`src/lib/currency.ts`) so new
-- currencies can be added without a migration.

UPDATE households
SET currency = 'NGN'
WHERE currency IS NULL OR btrim(currency) = '';

UPDATE households
SET currency = upper(btrim(currency))
WHERE currency <> upper(btrim(currency));

UPDATE accounts
SET currency = 'NGN'
WHERE currency IS NULL OR btrim(currency) = '';

UPDATE accounts
SET currency = upper(btrim(currency))
WHERE currency <> upper(btrim(currency));

-- Legacy NGN records keep their exact meaning: nothing below changes an amount,
-- it only records which currency it was entered in.
COMMENT ON COLUMN accounts.currency IS
  'ISO 4217 code for every amount recorded in this account. Amounts are never converted.';

COMMENT ON COLUMN households.currency IS
  'Default ISO 4217 code for new accounts. Display only — never used to convert.';
