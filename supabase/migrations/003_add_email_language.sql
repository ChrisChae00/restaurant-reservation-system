-- Add email_language column to bookings table
-- Migration: 003_add_email_language

ALTER TABLE bookings ADD COLUMN email_language TEXT DEFAULT 'en' CHECK (email_language IN ('en', 'fr'));
