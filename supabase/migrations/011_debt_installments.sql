-- Debt repayment in multiple installments.
--
-- Extends the existing debts / debt_repayments model instead of replacing it,
-- so every historical debt record and repayment keeps working unchanged.
-- All new debt columns are optional — creating a simple "I owe X" debt still
-- only needs a name and an amount.

ALTER TABLE debts
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS interest_rate NUMERIC(6, 3),
  ADD COLUMN IF NOT EXISTS repayment_frequency TEXT,
  ADD COLUMN IF NOT EXISTS installment_amount INTEGER,
  ADD COLUMN IF NOT EXISTS num_installments INTEGER,
  ADD COLUMN IF NOT EXISTS first_payment_date DATE;

-- Normalise anything written before the constraints existed.
UPDATE debts SET repayment_frequency = NULL
WHERE repayment_frequency IS NOT NULL
  AND repayment_frequency NOT IN ('weekly', 'biweekly', 'monthly');

UPDATE debts SET installment_amount = NULL WHERE installment_amount IS NOT NULL AND installment_amount <= 0;
UPDATE debts SET num_installments = NULL WHERE num_installments IS NOT NULL AND num_installments <= 0;
UPDATE debts SET interest_rate = NULL WHERE interest_rate IS NOT NULL AND interest_rate < 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'debts_repayment_frequency_check'
  ) THEN
    ALTER TABLE debts
      ADD CONSTRAINT debts_repayment_frequency_check
      CHECK (repayment_frequency IS NULL OR repayment_frequency IN ('weekly', 'biweekly', 'monthly'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debts_interest_rate_check') THEN
    ALTER TABLE debts ADD CONSTRAINT debts_interest_rate_check
      CHECK (interest_rate IS NULL OR (interest_rate >= 0 AND interest_rate <= 100));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debts_installment_amount_check') THEN
    ALTER TABLE debts ADD CONSTRAINT debts_installment_amount_check
      CHECK (installment_amount IS NULL OR installment_amount > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debts_num_installments_check') THEN
    ALTER TABLE debts ADD CONSTRAINT debts_num_installments_check
      CHECK (num_installments IS NULL OR num_installments > 0);
  END IF;
END $$;

-- Existing repayment rows become installments too: every row that was already
-- recorded is a completed payment, and gets a sequence number so history order
-- stays stable and no repayment can be counted twice.
ALTER TABLE debt_repayments
  ADD COLUMN IF NOT EXISTS installment_number INTEGER,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE debt_repayments SET status = 'paid' WHERE status IS NULL OR status NOT IN ('pending', 'paid', 'skipped');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debt_repayments_status_check') THEN
    ALTER TABLE debt_repayments ADD CONSTRAINT debt_repayments_status_check
      CHECK (status IN ('pending', 'paid', 'skipped'));
  END IF;
END $$;

-- Backfill sequence numbers for repayments recorded before installments existed.
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY debt_id ORDER BY date, created_at) AS rn
  FROM debt_repayments
  WHERE installment_number IS NULL
)
UPDATE debt_repayments r
SET installment_number = numbered.rn
FROM numbered
WHERE r.id = numbered.id;

CREATE INDEX IF NOT EXISTS idx_debt_repayments_debt ON debt_repayments(debt_id);
CREATE INDEX IF NOT EXISTS idx_debts_household ON debts(household_id);

-- No RLS policies are touched. `debt_repayments` keeps the member-read /
-- editor-write policies created in 009, which already scope rows through the
-- parent debt's household.
