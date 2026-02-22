import { useState } from 'react';
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
import StarRating from './StarRating';
import type { GameLog, WatchMode } from '@/types/database';

interface LogModalProps {
  gameId: string;
  existingLog: GameLog | null;
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

  async function handleSave() {
    if (!user) return;

    setSaving(true);
    const { error } = await supabase
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
      );
    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      onSuccess();
    }
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
                  trackColor={{ false: '#2a2a2a', true: '#c9a84c' }}
                  thumbColor="#ffffff"
                />
              </View>

              {/* Save button */}
              <TouchableOpacity
                className="bg-accent rounded-xl py-4 items-center mb-8"
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#0a0a0a" />
                ) : (
                  <Text className="text-background font-semibold text-base">
                    {existingLog ? 'Save Changes' : 'Log Game'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
