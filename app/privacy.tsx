import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PrivacyPolicy() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <ScrollView style={{ flex: 1, padding: 24 }}>
        <Text style={{ color: '#ffffff', fontSize: 28, fontWeight: 'bold', marginBottom: 8 }}>
          Privacy Policy
        </Text>
        <Text style={{ color: '#999999', fontSize: 14, marginBottom: 24 }}>
          Last updated: March 1, 2026
        </Text>

        <Section title="Introduction">
          Know Ball ("we", "our", or "us") is a social NBA game-tracking app. This Privacy Policy
          explains how we collect, use, and protect your information when you use our mobile
          application and website (collectively, the "Service").
        </Section>

        <Section title="Information We Collect">
          {`We collect the following information when you use Know Ball:

• Account Information: Email address, display name, and profile handle when you create an account.
• Authentication Data: If you sign in with Google, we receive your name and email from Google. We do not store your Google password.
• Profile Information: Avatar image, bio, and other profile details you choose to provide.
• Usage Data: Game ratings, reviews, watchlists, lists, diary entries, and other content you create within the app.
• Contacts: If you grant permission, we may access your device contacts solely to help you find friends on Know Ball. Contact data is not stored on our servers.
• Push Notification Tokens: If you enable notifications, we store your device push token to send you updates.`}
        </Section>

        <Section title="How We Use Your Information">
          {`We use your information to:

• Provide and maintain the Service
• Display your profile and content to other users
• Send push notifications about activity relevant to you (likes, comments, follows)
• Help you find friends who also use Know Ball
• Improve and personalize your experience`}
        </Section>

        <Section title="Data Storage & Security">
          Your data is stored securely using Supabase, which provides encrypted database storage and
          authentication services. Authentication tokens are stored on your device using secure
          storage mechanisms provided by the operating system.
        </Section>

        <Section title="Third-Party Services">
          {`We use the following third-party services:

• Supabase — Authentication and database hosting
• Google Sign-In — Optional authentication provider
• Expo — App build and push notification services
• Vercel — Website hosting

These services have their own privacy policies governing their use of your data.`}
        </Section>

        <Section title="Data Sharing">
          We do not sell your personal information. Your public profile information (display name,
          handle, avatar, ratings, and reviews) is visible to other users of the Service. We do not
          share your email address or private data with third parties except as required by law.
        </Section>

        <Section title="Data Deletion">
          You can delete your account and associated data by contacting us at the email below. Upon
          request, we will delete your account and personal data within 30 days.
        </Section>

        <Section title="Children's Privacy">
          Know Ball is not intended for children under the age of 13. We do not knowingly collect
          personal information from children under 13.
        </Section>

        <Section title="Changes to This Policy">
          We may update this Privacy Policy from time to time. We will notify you of any changes by
          posting the new policy within the app.
        </Section>

        <Section title="Contact Us">
          If you have questions about this Privacy Policy, contact us at:{'\n\n'}
          knowballapp@gmail.com
        </Section>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
        {title}
      </Text>
      <Text style={{ color: '#cccccc', fontSize: 15, lineHeight: 22 }}>{children}</Text>
    </View>
  );
}
