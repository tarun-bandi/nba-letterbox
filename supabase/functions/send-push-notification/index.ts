import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/api/v2/push/send';

const REACTION_EMOJI: Record<string, string> = {
  like: '\u2764\uFE0F',
  fire: '\uD83D\uDD25',
  ice: '\uD83E\uDDCA',
  skull: '\uD83D\uDC80',
  mind_blown: '\uD83E\uDD2F',
  respect: '\uD83D\uDC4F',
};

interface WebhookPayload {
  type: 'INSERT';
  table: string;
  record: Record<string, any>;
  schema: string;
}

serve(async (req) => {
  try {
    const payload: WebhookPayload = await req.json();
    const { table, record } = payload;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let targetUserId: string | null = null;
    let title = 'NBA Letterbox';
    let body = '';
    let data: Record<string, string> = {};

    if (table === 'likes') {
      // Find the log owner
      const { data: logData } = await supabase
        .from('game_logs')
        .select('user_id, game_id')
        .eq('id', record.log_id)
        .single();
      if (!logData || logData.user_id === record.user_id) {
        return new Response('Skip self-reaction', { status: 200 });
      }
      targetUserId = logData.user_id;

      // Get actor name
      const { data: actor } = await supabase
        .from('user_profiles')
        .select('display_name')
        .eq('user_id', record.user_id)
        .single();
      const name = actor?.display_name ?? 'Someone';
      const emoji = REACTION_EMOJI[record.reaction_type ?? 'like'] ?? '';
      body = `${name} reacted ${emoji} to your log`;
      data = { type: 'like', gameId: logData.game_id };
    } else if (table === 'comments') {
      const { data: logData } = await supabase
        .from('game_logs')
        .select('user_id, game_id')
        .eq('id', record.log_id)
        .single();
      if (!logData || logData.user_id === record.user_id) {
        return new Response('Skip self-comment', { status: 200 });
      }
      targetUserId = logData.user_id;

      const { data: actor } = await supabase
        .from('user_profiles')
        .select('display_name')
        .eq('user_id', record.user_id)
        .single();
      const name = actor?.display_name ?? 'Someone';
      body = `${name} commented on your log`;
      data = { type: 'comment', gameId: logData.game_id };
    } else if (table === 'follows') {
      targetUserId = record.following_id;
      if (targetUserId === record.follower_id) {
        return new Response('Skip self-follow', { status: 200 });
      }

      const { data: actor } = await supabase
        .from('user_profiles')
        .select('display_name, handle')
        .eq('user_id', record.follower_id)
        .single();
      const name = actor?.display_name ?? 'Someone';
      body = `${name} started following you`;
      data = { type: 'follow', handle: actor?.handle ?? '' };
    }

    if (!targetUserId || !body) {
      return new Response('No notification needed', { status: 200 });
    }

    // Get push tokens for the target user
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', targetUserId);

    if (!tokens || tokens.length === 0) {
      return new Response('No push tokens', { status: 200 });
    }

    // Send to all tokens
    const messages = tokens.map((t) => ({
      to: t.token,
      title,
      body,
      data,
      sound: 'default' as const,
    }));

    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    return new Response('Sent', { status: 200 });
  } catch (err) {
    console.error('Push notification error:', err);
    return new Response('Error', { status: 500 });
  }
});
