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
import { X } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import { useToastStore } from '@/lib/store/toastStore';
import * as Haptics from 'expo-haptics';
import StarRating from './StarRating';
import type { GameLog, WatchMode, LogTag } from '@/types/database';

interface LogModalProps {
  gameId: string;
  existingLog: (GameLog & { tags?: LogTag[] }) | null;
  onClose: () => void;
  onSuccess: () => void;
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
  const [rating, setRating] = useState<number>(
    existingLog?.rating != null ? existingLog.rating / 10 : 0
  );
  const [watchMode, setWatchMode] = useState<WatchMode | null>(
    existingLog?.watch_mode ?? null
  );
  const [review, setReview] = useState(existingLog?.review ?? '');
  const [hasSpoilers, setHasSpoilers] = useState(
    existingLog?.has_spoilers ?? false
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  async function performDelete() {
    if (!existingLog) return;
    setDeleting(true);
    const { error } = await supabase
      .from('game_logs')
      .delete()
      .eq('id', existingLog.id);
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
          rating: rating > 0 ? Math.round(rating * 10) : null,
          watch_mode: watchMode,
          review: review.trim() || null,
          has_spoilers: hasSpoilers,
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
    onSuccess();
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
              {/* Star Rating */}
              <View className="mb-5">
                <Text className="text-muted text-sm mb-2">Rating</Text>
                <View className="flex-row items-center gap-4">
                  <StarRating value={rating} onChange={setRating} size={32} />
                  {rating > 0 && (
                    <Text className="text-accent font-semibold text-base">
                      {rating.toFixed(1)}
                    </Text>
                  )}
                </View>
              </View>

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
                  trackColor={{ false: '#2a2a2a', true: '#e5e5e5' }}
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
                disabled={saving || deleting}
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
