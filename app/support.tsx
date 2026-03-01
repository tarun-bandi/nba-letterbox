import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Support() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#ffffff', fontSize: 28, fontWeight: 'bold', marginBottom: 8 }}>
          Support
        </Text>
        <Text
          style={{
            color: '#999999',
            fontSize: 16,
            textAlign: 'center',
            marginBottom: 32,
            lineHeight: 24,
          }}
        >
          Have a question, found a bug, or want to share feedback? We'd love to hear from you.
        </Text>

        <TouchableOpacity
          onPress={() => Linking.openURL('mailto:knowballapp@gmail.com')}
          style={{
            backgroundColor: '#c9a84c',
            paddingHorizontal: 32,
            paddingVertical: 14,
            borderRadius: 12,
            marginBottom: 16,
          }}
          activeOpacity={0.8}
        >
          <Text style={{ color: '#0a0a0a', fontSize: 16, fontWeight: '600' }}>
            Email Us
          </Text>
        </TouchableOpacity>

        <Text style={{ color: '#666666', fontSize: 14 }}>knowballapp@gmail.com</Text>
      </View>
    </SafeAreaView>
  );
}
