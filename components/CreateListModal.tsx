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
import { useToastStore } from '@/lib/store/toastStore';
import type { List } from '@/types/database';

interface CreateListModalProps {
  existingList?: List | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateListModal({
  existingList,
  onClose,
  onSuccess,
}: CreateListModalProps) {
  const { user } = useAuthStore();
  const toast = useToastStore();
  const [title, setTitle] = useState(existingList?.title ?? '');
  const [description, setDescription] = useState(existingList?.description ?? '');
  const [isPrivate, setIsPrivate] = useState(existingList?.is_private ?? false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!user) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('Error', 'Title is required');
      return;
    }

    setSaving(true);

    if (existingList) {
      const { error } = await supabase
        .from('lists')
        .update({
          title: trimmedTitle,
          description: description.trim() || null,
          is_private: isPrivate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingList.id);

      setSaving(false);
      if (error) {
        toast.show(error.message, 'error');
      } else {
        toast.show('List updated');
        onSuccess();
      }
    } else {
      const { error } = await supabase.from('lists').insert({
        user_id: user.id,
        title: trimmedTitle,
        description: description.trim() || null,
        is_private: isPrivate,
      });

      setSaving(false);
      if (error) {
        toast.show(error.message, 'error');
      } else {
        toast.show('List created');
        onSuccess();
      }
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
            <View className="items-center pt-3 pb-1">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>

            <View className="flex-row justify-between items-center px-5 pt-2 pb-4">
              <Text className="text-white text-lg font-semibold">
                {existingList ? 'Edit List' : 'New List'}
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
              <View className="mb-4">
                <Text className="text-muted text-sm mb-2">Title</Text>
                <TextInput
                  className="bg-background border border-border rounded-xl px-4 py-3 text-white text-sm"
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Best Games of 2024"
                  placeholderTextColor="#6b7280"
                  maxLength={100}
                />
              </View>

              <View className="mb-4">
                <Text className="text-muted text-sm mb-2">Description (optional)</Text>
                <TextInput
                  className="bg-background border border-border rounded-xl px-4 py-3 text-white text-sm"
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What's this list about?"
                  placeholderTextColor="#6b7280"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  style={{ minHeight: 72 }}
                  maxLength={300}
                />
              </View>

              <View className="flex-row justify-between items-center mb-6">
                <View>
                  <Text className="text-white text-sm font-medium">Private</Text>
                  <Text className="text-muted text-xs mt-0.5">
                    Only you can see this list
                  </Text>
                </View>
                <Switch
                  value={isPrivate}
                  onValueChange={setIsPrivate}
                  trackColor={{ false: '#2a2a2a', true: '#e5e5e5' }}
                  thumbColor="#ffffff"
                />
              </View>

              <TouchableOpacity
                className="bg-accent rounded-xl py-4 items-center mb-8"
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#0a0a0a" />
                ) : (
                  <Text className="text-background font-semibold text-base">
                    {existingList ? 'Save Changes' : 'Create List'}
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
