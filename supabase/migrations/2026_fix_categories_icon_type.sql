-- Fix categories icon column type being too small
-- This migration changes the icon column from VARCHAR(50) (if applicable) to TEXT

ALTER TABLE categories ALTER COLUMN icon TYPE text;
