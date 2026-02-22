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

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <Text className="text-background font-semibold text-base">
                Sign In
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
