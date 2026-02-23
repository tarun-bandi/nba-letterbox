import { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, Camera } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useToastStore } from '@/lib/store/toastStore';
import { pickAndUploadAvatar } from '@/lib/uploadAvatar';
import Avatar from './Avatar';
import type { UserProfile } from '@/types/database';

interface EditProfileModalProps {
  profile: UserProfile;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditProfileModal({
  profile,
  onClose,
  onSuccess,
}: EditProfileModalProps) {
  const toast = useToastStore();
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [handle, setHandle] = useState(profile.handle);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAdvancedAvatar, setShowAdvancedAvatar] = useState(false);

  async function handlePickAvatar() {
    try {
      setUploading(true);
      const url = await pickAndUploadAvatar(profile.user_id);
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

  async function handleSave() {
    const trimmedName = displayName.trim();
    const trimmedHandle = handle.trim().toLowerCase();

    if (!trimmedName) {
      Alert.alert('Error', 'Display name is required');
      return;
    }
    if (!trimmedHandle || trimmedHandle.length < 3) {
      Alert.alert('Error', 'Handle must be at least 3 characters');
      return;
    }
    if (!/^[a-z0-9_]+$/.test(trimmedHandle)) {
      Alert.alert('Error', 'Handle can only contain lowercase letters, numbers, and underscores');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('user_profiles')
      .update({
        display_name: trimmedName,
        handle: trimmedHandle,
        bio: bio.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', profile.user_id);

    setSaving(false);

    if (error) {
      if (error.message.includes('unique') || error.message.includes('duplicate')) {
        toast.show('That handle is already taken', 'error');
      } else {
        toast.show(error.message, 'error');
      }
    } else {
      toast.show('Profile updated');
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
                Edit Profile
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
              {/* Avatar picker */}
              <View className="items-center mb-5">
                <TouchableOpacity
                  onPress={handlePickAvatar}
                  disabled={uploading}
                  activeOpacity={0.7}
                >
                  <View style={{ position: 'relative' }}>
                    <Avatar
                      url={avatarUrl || null}
                      name={displayName}
                      size={80}
                    />
                    <View
                      className="absolute bottom-0 right-0 bg-accent rounded-full p-1.5"
                      style={{ borderWidth: 2, borderColor: '#1a1a1a' }}
                    >
                      {uploading ? (
                        <ActivityIndicator color="#0a0a0a" size="small" />
                      ) : (
                        <Camera size={14} color="#0a0a0a" />
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
                <Text className="text-muted text-xs mt-2">Tap to change photo</Text>
              </View>

              {/* Display Name */}
              <View className="mb-4">
                <Text className="text-muted text-sm mb-2">Display Name</Text>
                <TextInput
                  className="bg-background border border-border rounded-xl px-4 py-3 text-white text-sm"
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Your name"
                  placeholderTextColor="#6b7280"
                  autoCapitalize="words"
                  maxLength={50}
                />
              </View>

              {/* Handle */}
              <View className="mb-4">
                <Text className="text-muted text-sm mb-2">Handle</Text>
                <View className="flex-row items-center bg-background border border-border rounded-xl px-4">
                  <Text className="text-muted text-sm">@</Text>
                  <TextInput
                    className="flex-1 py-3 text-white text-sm ml-1"
                    value={handle}
                    onChangeText={(t) => setHandle(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="handle"
                    placeholderTextColor="#6b7280"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={30}
                  />
                </View>
              </View>

              {/* Bio */}
              <View className="mb-4">
                <Text className="text-muted text-sm mb-2">Bio</Text>
                <TextInput
                  className="bg-background border border-border rounded-xl px-4 py-3 text-white text-sm"
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

              {/* Advanced: Avatar URL */}
              <TouchableOpacity
                onPress={() => setShowAdvancedAvatar(!showAdvancedAvatar)}
                className="mb-2"
              >
                <Text className="text-muted text-xs">
                  {showAdvancedAvatar ? '▾ Hide' : '▸ Advanced'}: Avatar URL
                </Text>
              </TouchableOpacity>
              {showAdvancedAvatar && (
                <View className="mb-4">
                  <TextInput
                    className="bg-background border border-border rounded-xl px-4 py-3 text-white text-sm"
                    value={avatarUrl}
                    onChangeText={setAvatarUrl}
                    placeholder="https://example.com/avatar.jpg"
                    placeholderTextColor="#6b7280"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </View>
              )}

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
                    Save Profile
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
