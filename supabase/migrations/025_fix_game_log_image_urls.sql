-- Ensure image_urls column exists on game_logs.
-- Migration 023 may have rolled back if storage policies already existed,
-- leaving this column missing. This migration is fully idempotent.

ALTER TABLE public.game_logs ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}';

-- Ensure storage bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('game-log-images', 'game-log-images', true)
ON CONFLICT (id) DO NOTHING;

-- Recreate RLS policies idempotently
DROP POLICY IF EXISTS "Users can upload game log images" ON storage.objects;
CREATE POLICY "Users can upload game log images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'game-log-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can update their own game log images" ON storage.objects;
CREATE POLICY "Users can update their own game log images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'game-log-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Anyone can view game log images" ON storage.objects;
CREATE POLICY "Anyone can view game log images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'game-log-images');

DROP POLICY IF EXISTS "Users can delete their own game log images" ON storage.objects;
CREATE POLICY "Users can delete their own game log images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'game-log-images' AND (storage.foldername(name))[1] = auth.uid()::text);
