import { useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import { enrichLogs } from '@/lib/enrichLogs';
import DiaryCalendar from '@/components/DiaryCalendar';
import GameCard from '@/components/GameCard';
import { PageContainer } from '@/components/PageContainer';
import type { GameLogWithGame } from '@/types/database';

function toLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalDayUtcWindow(dateStr: string): { startUTC: string; endUTC: string } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return {
    startUTC: start.toISOString(),
    endUTC: end.toISOString(),
  };
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

async function fetchDiaryDayLogs(userId: string, dateStr: string): Promise<GameLogWithGame[]> {
  const { startUTC, endUTC } = getLocalDayUtcWindow(dateStr);

  const { data, error } = await supabase
    .from('game_logs')
    .select(`
      *,
      game:games (
        *,
        home_team:teams!games_home_team_id_fkey (*),
        away_team:teams!games_away_team_id_fkey (*),
        season:seasons (*)
      )
    `)
    .eq('user_id', userId)
    .gte('logged_at', startUTC)
    .lt('logged_at', endUTC)
    .order('logged_at', { ascending: false });

  if (error) throw error;

  const rawLogs = (data ?? []) as unknown as GameLogWithGame[];
  const logsWithGame = rawLogs.filter((log) => !!log.game);
  return enrichLogs(logsWithGame, userId);
}

export default function DiaryScreen() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<string>(toLocalDateStr(new Date()));

  const {
    data: dayLogs,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['diary-day', user?.id, selectedDate],
    queryFn: () => fetchDiaryDayLogs(user!.id, selectedDate),
    enabled: !!user && !!selectedDate,
  });

  const selectedDateLabel = useMemo(
    () => formatDateLabel(selectedDate),
    [selectedDate],
  );

  if (!user) return null;

  const logs = dayLogs ?? [];

  return (
    <ScrollView
      className="flex-1 bg-background"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={async () => {
            await Promise.all([
              refetch(),
              queryClient.invalidateQueries({ queryKey: ['diary-month', user.id] }),
            ]);
          }}
          tintColor="#c9a84c"
        />
      }
    >
      <PageContainer>
        <View className="px-4 pt-4">
          <DiaryCalendar
            userId={user.id}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </View>

        <View className="px-4 pt-4 pb-8">
          <View className="flex-row items-end justify-between mb-3">
            <Text className="text-white font-semibold text-base">
              {selectedDateLabel}
            </Text>
            {!isLoading && !error && (
              <Text className="text-muted text-xs">
                {logs.length} {logs.length === 1 ? 'log' : 'logs'}
              </Text>
            )}
          </View>

          {isLoading ? (
            <View className="bg-surface border border-border rounded-xl p-6 items-center">
              <ActivityIndicator size="small" color="#c9a84c" />
              <Text className="text-muted text-sm mt-3">Loading logs...</Text>
            </View>
          ) : error ? (
            <View className="bg-surface border border-border rounded-xl p-4 items-center">
              <Text className="text-white font-medium">Couldn't load logs for this day</Text>
              <TouchableOpacity
                className="mt-3 bg-accent/15 border border-accent/30 rounded-lg px-4 py-2"
                onPress={() => refetch()}
                activeOpacity={0.7}
              >
                <Text className="text-accent font-semibold text-sm">Retry</Text>
              </TouchableOpacity>
            </View>
          ) : logs.length === 0 ? (
            <View className="bg-surface border border-border rounded-xl p-6 items-center">
              <Text className="text-muted text-sm text-center">
                No games logged on this day yet.
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {logs.map((log) => (
                <GameCard key={log.id} log={log} />
              ))}
            </View>
          )}
        </View>
      </PageContainer>
    </ScrollView>
  );
}
