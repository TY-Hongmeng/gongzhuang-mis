-- Change heat_treatment column to remarks column in cutting_orders table
-- This migration changes the boolean heat_treatment field to a text remarks field

ALTER TABLE cutting_orders 
ALTER COLUMN heat_treatment TYPE TEXT USING 
  CASE 
    WHEN heat_treatment = true THEN '需调质'
    ELSE ''
  END;

-- Rename the column from heat_treatment to remarks
ALTER TABLE cutting_orders 
RENAME COLUMN heat_treatment TO remarks;