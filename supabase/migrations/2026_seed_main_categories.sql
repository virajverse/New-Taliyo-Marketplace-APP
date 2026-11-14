-- Seed 4 main categories with professional descriptions
-- Run this in Supabase SQL Editor

INSERT INTO categories (name, slug, description, icon, is_active, sort_order)
VALUES
  (
    'Customer Handling Systems',
    'customer-handling-systems',
    'Automate and enhance your customer interactions with AI chatbots, support ticketing systems, and CRM integrations. Ensure no customer query goes unanswered.',
    'chat',
    true,
    1
  ),
  (
    'Business Operations Systems',
    'business-operations-systems',
    'Streamline your day-to-day operations with custom ERPs, inventory management, HR portals, and automated workflow solutions designed for efficiency.',
    'web',
    true,
    2
  ),
  (
    'Owner Visibility Systems',
    'owner-visibility-systems',
    'Gain complete control and insight into your business with real-time analytics dashboards, financial reporting tools, and performance logic monitoring.',
    'consulting',
    true,
    3
  ),
  (
    'Business Launch Systems',
    'business-launch-systems',
    'Everything you need to launch a new venture: from brand identity and website development to legal incorporation and digital marketing kickoff strategies.',
    'marketing',
    true,
    4
  )
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  -- Only update icon if it's the specific placeholder or null, so we don't overwrite user's custom uploaded images
  icon = CASE 
    WHEN categories.icon IS NULL OR categories.icon IN ('chat', 'web', 'consulting', 'marketing', 'package') 
    THEN EXCLUDED.icon 
    ELSE categories.icon 
  END,
  sort_order = EXCLUDED.sort_order;
