import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function SignupScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!displayName.trim() || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName.trim() },
      },
    });
    setLoading(false);

    if (error) {
      Alert.alert('Sign Up Failed', error.message);
    } else {
      Alert.alert(
        'Check your email',
        'We sent you a confirmation link. Click it to activate your account.',
      );
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ justifyContent: 'center', flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-6">
          {/* Header */}
          <View className="mb-12 items-center">
            <Text className="text-accent text-4xl font-bold tracking-tight">
              NBA Letterbox
            </Text>
            <Text className="text-muted text-base mt-2">
              Create your account
            </Text>
          </View>

          {/* Form */}
          <View className="gap-4">
            <TextInput
              className="bg-surface border border-border rounded-xl px-4 py-3.5 text-white text-base"
              placeholder="Display Name"
              placeholderTextColor="#6b7280"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              autoComplete="name"
            />
            <TextInput
              className="bg-surface border border-border rounded-xl px-4 py-3.5 text-white text-base"
              placeholder="Email"
              placeholderTextColor="#6b7280"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextInput
              className="bg-surface border border-border rounded-xl px-4 py-3.5 text-white text-base"
              placeholder="Password (min 6 characters)"
              placeholderTextColor="#6b7280"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
            />

            <TouchableOpacity
              className="bg-accent rounded-xl py-4 items-center mt-2"
              onPress={handleSignup}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#0a0a0a" />
              ) : (
                <Text className="text-background font-semibold text-base">
                  Create Account
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Login link */}
          <View className="mt-8 flex-row justify-center">
            <Text className="text-muted">Already have an account? </Text>
            <Link href="/(auth)/login">
              <Text className="text-accent font-medium">Sign In</Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
