ALTER TABLE users
  ADD COLUMN IF NOT EXISTS capability_coeff numeric(10,2) NOT NULL DEFAULT 1;

