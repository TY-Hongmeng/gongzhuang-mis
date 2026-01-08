-- Change heat_treatment column to remarks column in parts_info table
-- This migration changes the boolean heat_treatment field to a text remarks field
-- that can store dates or other remarks information

ALTER TABLE parts_info 
ALTER COLUMN heat_treatment TYPE TEXT USING 
  CASE 
    WHEN heat_treatment = true THEN '需调质'
    ELSE ''
  END;

-- Rename the column from heat_treatment to remarks
ALTER TABLE parts_info 
RENAME COLUMN heat_treatment TO remarks;