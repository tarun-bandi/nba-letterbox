import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import { useToastStore } from '@/lib/store/toastStore';
import { pickAndUploadAvatar } from '@/lib/uploadAvatar';
import Avatar from '@/components/Avatar';

export default function OnboardingProfileSetup() {
  const insets = useSafeAreaInsets();
  const { user, setOnboardingCompleted } = useAuthStore();
  const toast = useToastStore();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (user) {
      supabase
        .from('user_profiles')
        .select('display_name, bio, avatar_url')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setDisplayName(data.display_name ?? '');
            setBio(data.bio ?? '');
            setAvatarUrl(data.avatar_url ?? '');
          }
        });
    }
  }, [user]);

  async function handlePickAvatar() {
    if (!user) return;
    try {
      setUploading(true);
      const url = await pickAndUploadAvatar(user.id);
      if (url) {
        setAvatarUrl(url);
        toast.show('Avatar uploaded');
      }
    } catch (err: any) {
      toast.show(err.message ?? 'Failed to upload avatar', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleDone() {
    if (!user) return;
    setSaving(true);

    const updates: Record<string, any> = {
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    };

    const trimmedName = displayName.trim();
    if (trimmedName) {
      updates.display_name = trimmedName;
    }
    if (bio.trim()) {
      updates.bio = bio.trim();
    }
    if (avatarUrl.trim()) {
      updates.avatar_url = avatarUrl.trim();
    }

    const { error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('user_id', user.id);

    setSaving(false);

    if (error) {
      toast.show(error.message, 'error');
    } else {
      setOnboardingCompleted(true);
    }
  }

  async function handleSkip() {
    if (user) {
      await supabase
        .from('user_profiles')
        .update({ onboarding_completed: true })
        .eq('user_id', user.id);
      setOnboardingCompleted(true);
    }
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="px-8 pt-6 pb-4">
            <Text className="text-muted text-sm mb-1">Step 2 of 2</Text>
            <Text className="text-white text-2xl font-bold mb-2">
              Set up your profile
            </Text>
            <Text className="text-muted text-sm">
              Tell others who you are. You can always change this later.
            </Text>
          </View>

          <View className="items-center py-6">
            <TouchableOpacity
              onPress={handlePickAvatar}
              disabled={uploading}
              activeOpacity={0.7}
            >
              <View style={{ position: 'relative' }}>
                <Avatar
                  url={avatarUrl || null}
                  name={displayName || 'User'}
                  size={80}
                />
                <View
                  className="absolute bottom-0 right-0 bg-accent rounded-full p-1.5"
                  style={{ borderWidth: 2, borderColor: '#0a0a0a' }}
                >
                  {uploading ? (
                    <ActivityIndicator color="#0a0a0a" size="small" />
                  ) : (
                    <Camera size={14} color="#0a0a0a" />
                  )}
                </View>
              </View>
            </TouchableOpacity>
            <Text className="text-muted text-xs mt-2">Tap to add photo</Text>
          </View>

          <View className="px-8">
            {/* Display Name */}
            <View className="mb-4">
              <Text className="text-muted text-sm mb-2">Display Name</Text>
              <TextInput
                className="bg-surface border border-border rounded-xl px-4 py-3 text-white text-sm"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                placeholderTextColor="#6b7280"
                autoCapitalize="words"
                maxLength={50}
              />
            </View>

            {/* Bio */}
            <View className="mb-4">
              <Text className="text-muted text-sm mb-2">Bio (optional)</Text>
              <TextInput
                className="bg-surface border border-border rounded-xl px-4 py-3 text-white text-sm"
                value={bio}
                onChangeText={setBio}
                placeholder="Tell us about yourself"
                placeholderTextColor="#6b7280"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={{ minHeight: 72 }}
                maxLength={160}
              />
              <Text className="text-muted text-xs mt-1 text-right">
                {bio.length}/160
              </Text>
            </View>
          </View>
        </ScrollView>

        <View className="px-8 pb-4 pt-2">
          <TouchableOpacity
            className="bg-accent rounded-xl py-4 items-center mb-3 max-w-md self-center w-full"
            onPress={handleDone}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <Text className="text-background font-semibold text-base">
                Done
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            className="py-3 items-center"
            onPress={handleSkip}
            activeOpacity={0.7}
          >
            <Text className="text-muted text-sm">Skip for now</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
