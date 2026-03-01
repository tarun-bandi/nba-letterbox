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
import { signInWithGoogle } from '@/lib/googleAuth';
import { PageContainer } from '@/components/PageContainer';

export default function SignupScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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
    }
    // If email confirmation is disabled, onAuthStateChange in _layout.tsx
    // picks up the new session automatically and redirects to (tabs)
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      Alert.alert('Google Sign In Failed', error.message);
    } finally {
      setGoogleLoading(false);
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
        <PageContainer className="px-6">
          {/* Header */}
          <View className="mb-12 items-center">
            <Text className="text-accent text-4xl font-bold tracking-tight">
              Know Ball
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
              disabled={loading || googleLoading}
            >
              {loading ? (
                <ActivityIndicator color="#0a0a0a" />
              ) : (
                <Text className="text-background font-semibold text-base">
                  Create Account
                </Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View className="flex-row items-center mt-4">
              <View className="flex-1 h-px bg-border" />
              <Text className="text-muted text-sm mx-4">or</Text>
              <View className="flex-1 h-px bg-border" />
            </View>

            {/* Google Sign In */}
            <TouchableOpacity
              className="bg-surface border border-border rounded-xl py-4 items-center mt-4"
              onPress={handleGoogleSignIn}
              disabled={loading || googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-white font-semibold text-base">
                  Continue with Google
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
        </PageContainer>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
