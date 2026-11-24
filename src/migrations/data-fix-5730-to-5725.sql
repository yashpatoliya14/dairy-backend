-- ============================================================================
-- DATA MIGRATION & CORRECTION SCRIPT: MILK RATE 57.30 -> 57.25
-- Project: Milk Management System
-- Purpose: Safely inspect and correct incorrect milk rate of 57.30 to 57.25
--          and recalculate affected daily milk entry totals.
--
-- IMPORTANT SAFETY WARNING:
-- DO NOT EXECUTE AUTOMATICALLY IN PRODUCTION WITHOUT REVIEW.
-- TAKE A FULL DATABASE BACKUP BEFORE RUNNING THIS SCRIPT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: PREVIEW QUERIES (RUN THESE FIRST TO AUDIT AFFECTED ROWS)
-- ----------------------------------------------------------------------------

-- Preview customers configured with 57.30 rate
SELECT cid, name, unique_number, price, did
FROM customers
WHERE price = 57.30 OR price = 57.3;

-- Preview milk entries recorded at 57.30 rate
SELECT eid, cid, entry_date, liters, price, total,
       ROUND(liters * 57.25, 2) AS recalculated_total
FROM milk_entries
WHERE price = 57.30 OR price = 57.3;

-- Preview distributor settings configured with 57.30 default price
SELECT sid, did, default_price, default_liters
FROM settings
WHERE default_price = 57.30 OR default_price = 57.3;


-- ----------------------------------------------------------------------------
-- STEP 2: TRANSACTIONAL CORRECTION SCRIPT
-- Execute in a transaction block so changes can be committed or rolled back.
-- ----------------------------------------------------------------------------

BEGIN;

-- 2.1 Update customers rate from 57.30 to 57.25
UPDATE customers
SET price = 57.25
WHERE price = 57.30 OR price = 57.3;

-- 2.2 Update milk entries rate and recalculate entry totals
UPDATE milk_entries
SET price = 57.25,
    total = ROUND(liters * 57.25, 2)
WHERE price = 57.30 OR price = 57.3;

-- 2.3 Update distributor settings default price
UPDATE settings
SET default_price = 57.25
WHERE default_price = 57.30 OR default_price = 57.3;

-- ----------------------------------------------------------------------------
-- STEP 3: POST-UPDATE VERIFICATION
-- Check that 0 rows remain with 57.30
-- ----------------------------------------------------------------------------

SELECT COUNT(*) AS remaining_5730_customers FROM customers WHERE price = 57.30 OR price = 57.3;
SELECT COUNT(*) AS remaining_5730_entries FROM milk_entries WHERE price = 57.30 OR price = 57.3;
SELECT COUNT(*) AS remaining_5730_settings FROM settings WHERE default_price = 57.30 OR default_price = 57.3;

-- If counts are 0 and rows updated match expectation:
COMMIT;
-- If any unexpected discrepancy is found, cancel changes:
-- ROLLBACK;


-- ----------------------------------------------------------------------------
-- STEP 4: ROLLBACK RECOVERY GUIDANCE (IF EVER NEEDED)
-- ----------------------------------------------------------------------------
/*
BEGIN;
UPDATE customers SET price = 57.30 WHERE price = 57.25;
UPDATE milk_entries SET price = 57.30, total = ROUND(liters * 57.30, 2) WHERE price = 57.25;
UPDATE settings SET default_price = 57.30 WHERE default_price = 57.25;
COMMIT;
*/
