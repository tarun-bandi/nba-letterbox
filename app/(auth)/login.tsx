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
} from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { signInWithGoogle } from '@/lib/googleAuth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      Alert.alert('Login Failed', error.message);
    }
    // On success, the onAuthStateChange listener in _layout.tsx updates the session
    // and the navigator automatically redirects to (tabs)
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
      <View className="flex-1 justify-center px-6">
        {/* Logo / Header */}
        <View className="mb-12 items-center">
          <Text className="text-accent text-4xl font-bold tracking-tight">
            NBA Letterbox
          </Text>
          <Text className="text-muted text-base mt-2">
            Your basketball journal
          </Text>
        </View>

        {/* Form */}
        <View className="gap-4">
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
            placeholder="Password"
            placeholderTextColor="#6b7280"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />

          <TouchableOpacity
            className="bg-accent rounded-xl py-4 items-center mt-2"
            onPress={handleLogin}
            disabled={loading || googleLoading}
          >
            {loading ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <Text className="text-background font-semibold text-base">
                Sign In
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

        {/* Sign up link */}
        <View className="mt-8 flex-row justify-center">
          <Text className="text-muted">Don't have an account? </Text>
          <Link href="/(auth)/signup">
            <Text className="text-accent font-medium">Sign Up</Text>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
