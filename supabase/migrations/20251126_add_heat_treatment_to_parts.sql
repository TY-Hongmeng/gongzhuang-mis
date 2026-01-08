-- Add heat_treatment field to parts_info table
ALTER TABLE parts_info 
ADD COLUMN IF NOT EXISTS heat_treatment BOOLEAN DEFAULT FALSE;