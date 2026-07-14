-- Migration script to add new columns to infect_gi_hema_day_logs table
-- Run this in your PostgreSQL database

-- Add new INFECTION columns
ALTER TABLE infect_gi_hema_day_logs 
ADD COLUMN IF NOT EXISTS meningitis BOOLEAN,
ADD COLUMN IF NOT EXISTS meningitis_type VARCHAR;

-- Add new GASTROINTESTINAL columns
ALTER TABLE infect_gi_hema_day_logs
ADD COLUMN IF NOT EXISTS men BOOLEAN,
ADD COLUMN IF NOT EXISTS feed_type VARCHAR,
ADD COLUMN IF NOT EXISTS cumulative_feed_volume FLOAT,
ADD COLUMN IF NOT EXISTS iv_fluids BOOLEAN,
ADD COLUMN IF NOT EXISTS cholestasis BOOLEAN;

-- Add new HEMATOLOGY column
ALTER TABLE infect_gi_hema_day_logs
ADD COLUMN IF NOT EXISTS hb_value FLOAT;

-- Rename column (if your PostgreSQL version supports it)
-- Note: This will fail if enteral_feeds_started doesn't exist or enteral_feeds_received already exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'infect_gi_hema_day_logs' 
        AND column_name = 'enteral_feeds_started'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'infect_gi_hema_day_logs' 
        AND column_name = 'enteral_feeds_received'
    ) THEN
        ALTER TABLE infect_gi_hema_day_logs 
        RENAME COLUMN enteral_feeds_started TO enteral_feeds_received;
    END IF;
END $$;

-- Verify the migration
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns
WHERE table_name = 'infect_gi_hema_day_logs'
AND column_name IN (
    'meningitis', 'meningitis_type', 'men', 'feed_type', 
    'cumulative_feed_volume', 'iv_fluids', 'cholestasis', 
    'hb_value', 'enteral_feeds_received'
)
ORDER BY column_name;
