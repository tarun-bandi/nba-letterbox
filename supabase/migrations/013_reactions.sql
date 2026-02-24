-- Add reaction_type column to existing likes table
ALTER TABLE public.likes ADD COLUMN reaction_type text NOT NULL DEFAULT 'like';
-- Valid values: 'like', 'fire', 'ice', 'skull', 'mind_blown', 'respect'
