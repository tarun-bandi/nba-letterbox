import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  Switch,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { X, ImagePlus, XCircle } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import { useToastStore } from '@/lib/store/toastStore';
import { removeGameRanking } from '@/lib/rankingService';
import { pickLogImages, uploadLogImage, deleteLogImage, MAX_IMAGES } from '@/lib/uploadLogImages';
import * as Haptics from 'expo-haptics';
import type { GameLog, WatchMode, LogTag } from '@/types/database';

export interface LogModalResult {
  showRankingFlow?: boolean;
  gameId?: string;
}

interface LogModalProps {
  gameId: string;
  existingLog: (GameLog & { tags?: LogTag[] }) | null;
  onClose: () => void;
  onSuccess: (result?: LogModalResult) => void;
}

const WATCH_MODES: { value: WatchMode; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'replay', label: 'Replay' },
  { value: 'condensed', label: 'Condensed' },
  { value: 'highlights', label: 'Highlights' },
];

export default function LogModal({
  gameId,
  existingLog,
  onClose,
  onSuccess,
}: LogModalProps) {
  const { user } = useAuthStore();
  const toast = useToastStore();
  const [watchMode, setWatchMode] = useState<WatchMode | null>(
    existingLog?.watch_mode ?? null
  );
  const [review, setReview] = useState(existingLog?.review ?? '');
  const [hasSpoilers, setHasSpoilers] = useState(
    existingLog?.has_spoilers ?? false
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Images
  const [imageUrls, setImageUrls] = useState<string[]>(
    existingLog?.image_urls ?? []
  );
  const [uploading, setUploading] = useState(false);

  // Tags
  const [availableTags, setAvailableTags] = useState<LogTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(
    new Set((existingLog?.tags ?? []).map((t) => t.id))
  );

  useEffect(() => {
    supabase
      .from('log_tags')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (data) setAvailableTags(data as LogTag[]);
      });
  }, []);

  function toggleTag(tagId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  async function handlePickImages() {
    if (!user) return;
    const remaining = MAX_IMAGES - imageUrls.length;
    if (remaining <= 0) return;

    const assets = await pickLogImages(remaining);
    if (!assets) return;

    setUploading(true);
    try {
      const urls: string[] = [];
      for (const asset of assets) {
        const url = await uploadLogImage(user.id, asset.uri, asset.mimeType);
        urls.push(url);
      }
      setImageUrls((prev) => [...prev, ...urls]);
    } catch (err: any) {
      toast.show(err.message ?? 'Failed to upload image', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveImage(url: string) {
    try {
      await deleteLogImage(url);
    } catch {} // best-effort cleanup
    setImageUrls((prev) => prev.filter((u) => u !== url));
  }

  async function performDelete() {
    if (!existingLog || !user) return;
    setDeleting(true);
    const { error } = await supabase
      .from('game_logs')
      .delete()
      .eq('id', existingLog.id);
    if (!error) {
      // Also remove ranking if it exists
      try {
        await removeGameRanking(user.id, gameId);
      } catch {}
      // Clean up images from storage
      for (const url of imageUrls) {
        try { await deleteLogImage(url); } catch {}
      }
    }
    setDeleting(false);
    if (error) {
      toast.show(error.message, 'error');
    } else {
      toast.show('Log deleted');
      onSuccess();
    }
  }

  function handleDelete() {
    if (!existingLog) return;
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete this log? This cannot be undone.')) {
        performDelete();
      }
    } else {
      Alert.alert(
        'Delete Log',
        'Are you sure you want to delete this log? This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: performDelete },
        ],
      );
    }
  }

  async function handleSave() {
    if (!user) return;

    setSaving(true);

    // Upsert the game log
    const { data: logData, error } = await supabase
      .from('game_logs')
      .upsert(
        {
          user_id: user.id,
          game_id: gameId,
          watch_mode: watchMode,
          review: review.trim() || null,
          has_spoilers: hasSpoilers,
          image_urls: imageUrls.length > 0 ? imageUrls : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,game_id' }
      )
      .select('id')
      .single();

    if (error || !logData) {
      setSaving(false);
      toast.show(error?.message ?? 'Failed to save log', 'error');
      return;
    }

    // Update tags: delete existing, insert selected
    const logId = logData.id;
    await supabase.from('game_log_tag_map').delete().eq('log_id', logId);

    if (selectedTagIds.size > 0) {
      const tagRows = [...selectedTagIds].map((tag_id) => ({
        log_id: logId,
        tag_id,
      }));
      await supabase.from('game_log_tag_map').insert(tagRows);
    }

    setSaving(false);
    toast.show(existingLog ? 'Log updated' : 'Game logged!');
    onSuccess(
      !existingLog
        ? { showRankingFlow: true, gameId }
        : undefined
    );
  }

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end bg-black/60">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View className="bg-surface rounded-t-3xl border-t border-border">
            {/* Handle bar */}
            <View className="items-center pt-3 pb-1">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>

            {/* Header */}
            <View className="flex-row justify-between items-center px-5 pt-2 pb-4">
              <Text className="text-white text-lg font-semibold">
                {existingLog ? 'Edit Log' : 'Log This Game'}
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              className="px-5"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Watch Mode */}
              <View className="mb-5">
                <Text className="text-muted text-sm mb-2">How did you watch?</Text>
                <View className="flex-row flex-wrap gap-2">
                  {WATCH_MODES.map(({ value, label }) => (
                    <TouchableOpacity
                      key={value}
                      className={`px-4 py-2 rounded-full border ${
                        watchMode === value
                          ? 'bg-accent border-accent'
                          : 'bg-background border-border'
                      }`}
                      onPress={() =>
                        setWatchMode((prev) => (prev === value ? null : value))
                      }
                    >
                      <Text
                        className={`text-sm font-medium ${
                          watchMode === value ? 'text-background' : 'text-muted'
                        }`}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Tags */}
              {availableTags.length > 0 && (
                <View className="mb-5">
                  <Text className="text-muted text-sm mb-2">Tags</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {availableTags.map((tag) => {
                      const selected = selectedTagIds.has(tag.id);
                      return (
                        <TouchableOpacity
                          key={tag.id}
                          className={`px-3 py-1.5 rounded-full border ${
                            selected
                              ? 'bg-accent/20 border-accent'
                              : 'bg-background border-border'
                          }`}
                          onPress={() => toggleTag(tag.id)}
                        >
                          <Text
                            className={`text-xs font-medium ${
                              selected ? 'text-accent' : 'text-muted'
                            }`}
                          >
                            {tag.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Review */}
              <View className="mb-5">
                <Text className="text-muted text-sm mb-2">Review (optional)</Text>
                <TextInput
                  className="bg-background border border-border rounded-xl px-4 py-3 text-white text-sm"
                  placeholder="What did you think of this game?"
                  placeholderTextColor="#6b7280"
                  value={review}
                  onChangeText={setReview}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  style={{ minHeight: 96 }}
                  maxLength={1000}
                />
              </View>

              {/* Photos */}
              <View className="mb-5">
                <Text className="text-muted text-sm mb-2">Photos (optional)</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {imageUrls.map((url) => (
                    <View key={url} style={{ position: 'relative' }}>
                      <Image
                        source={{ uri: url }}
                        style={{ width: 80, height: 80, borderRadius: 10 }}
                        contentFit="cover"
                      />
                      <TouchableOpacity
                        style={{ position: 'absolute', top: -6, right: -6 }}
                        onPress={() => handleRemoveImage(url)}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      >
                        <XCircle size={20} color="#e63946" fill="#0a0a0a" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {imageUrls.length < MAX_IMAGES && (
                    <TouchableOpacity
                      className="bg-background border border-border rounded-xl items-center justify-center"
                      style={{ width: 80, height: 80 }}
                      onPress={handlePickImages}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <ActivityIndicator color="#c9a84c" size="small" />
                      ) : (
                        <ImagePlus size={24} color="#6b7280" />
                      )}
                    </TouchableOpacity>
                  )}
                </ScrollView>
              </View>

              {/* Spoiler toggle */}
              <View className="flex-row justify-between items-center mb-6">
                <View>
                  <Text className="text-white text-sm font-medium">
                    Contains spoilers
                  </Text>
                  <Text className="text-muted text-xs mt-0.5">
                    Hides your review behind a warning
                  </Text>
                </View>
                <Switch
                  value={hasSpoilers}
                  onValueChange={setHasSpoilers}
                  trackColor={{ false: '#2a2a2a', true: '#c9a84c' }}
                  thumbColor="#ffffff"
                />
              </View>

              {/* Review character counter */}
              <Text className="text-muted text-xs mt-1 text-right">
                {review.length}/1000
              </Text>

              {/* Save button */}
              <TouchableOpacity
                className="bg-accent rounded-xl py-4 items-center mb-4"
                onPress={handleSave}
                disabled={saving || deleting || uploading}
              >
                {saving ? (
                  <ActivityIndicator color="#0a0a0a" />
                ) : (
                  <Text className="text-background font-semibold text-base">
                    {existingLog ? 'Save Changes' : 'Log Game'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Delete button (edit mode only) */}
              {existingLog && (
                <TouchableOpacity
                  className="rounded-xl py-4 items-center mb-8 border border-[#e63946]"
                  onPress={handleDelete}
                  disabled={saving || deleting}
                >
                  {deleting ? (
                    <ActivityIndicator color="#e63946" />
                  ) : (
                    <Text className="text-[#e63946] font-semibold text-base">
                      Delete Log
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
