-- Add image_urls array column to game_logs
ALTER TABLE game_logs ADD COLUMN image_urls text[] DEFAULT '{}';

-- Create game-log-images storage bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('game-log-images', 'game-log-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies (same pattern as avatars bucket)
-- Users upload to their own folder: {userId}/{filename}
CREATE POLICY "Users can upload game log images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'game-log-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own game log images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'game-log-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Anyone can view game log images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'game-log-images');

CREATE POLICY "Users can delete their own game log images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'game-log-images' AND (storage.foldername(name))[1] = auth.uid()::text);
