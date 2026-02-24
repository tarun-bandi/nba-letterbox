import * as Contacts from 'expo-contacts';
import { supabase } from './supabase';

export async function requestContactsPermission(): Promise<boolean> {
  const { status } = await Contacts.requestPermissionsAsync();
  return status === 'granted';
}

export async function getContactEmails(): Promise<string[]> {
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Emails],
  });

  const emails = new Set<string>();
  for (const contact of data) {
    if (contact.emails) {
      for (const email of contact.emails) {
        if (email.email) {
          emails.add(email.email.toLowerCase());
        }
      }
    }
  }
  return Array.from(emails);
}

export interface FriendMatch {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
}

export async function findFriendsByEmail(
  emails: string[],
  currentUserId: string,
): Promise<FriendMatch[]> {
  if (emails.length === 0) return [];

  // Batch in chunks of 500 to avoid payload limits
  const chunkSize = 500;
  const results: FriendMatch[] = [];

  for (let i = 0; i < emails.length; i += chunkSize) {
    const chunk = emails.slice(i, i + chunkSize);
    const { data, error } = await supabase.rpc('find_friends_by_email', {
      email_list: chunk,
    });
    if (error) throw error;
    if (data) results.push(...(data as FriendMatch[]));
  }

  // Filter out current user
  return results.filter((f) => f.user_id !== currentUserId);
}
