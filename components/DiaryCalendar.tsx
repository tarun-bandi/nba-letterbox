import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import TeamLogo from './TeamLogo';

interface DiaryEntry {
  game_id: string;
  logged_at: string;
  home_abbr: string;
  away_abbr: string;
}

async function fetchDiaryMonth(userId: string, year: number, month: number): Promise<DiaryEntry[]> {
  const startDate = new Date(year, month, 1).toISOString();
  const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  const { data, error } = await supabase
    .from('game_logs')
    .select(`
      game_id,
      logged_at,
      game:games (
        home_team:teams!games_home_team_id_fkey (abbreviation),
        away_team:teams!games_away_team_id_fkey (abbreviation)
      )
    `)
    .eq('user_id', userId)
    .gte('logged_at', startDate)
    .lte('logged_at', endDate)
    .order('logged_at', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as any[]).map((d) => ({
    game_id: d.game_id,
    logged_at: d.logged_at,
    home_abbr: d.game?.home_team?.abbreviation ?? '',
    away_abbr: d.game?.away_team?.abbreviation ?? '',
  }));
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface DiaryCalendarProps {
  userId: string;
}

export default function DiaryCalendar({ userId }: DiaryCalendarProps) {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const { data: entries } = useQuery({
    queryKey: ['diary', userId, year, month],
    queryFn: () => fetchDiaryMonth(userId, year, month),
  });

  const goBack = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const goForward = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  // Build a map of day-of-month → entries
  const dayMap = useMemo(() => {
    const map: Record<number, DiaryEntry[]> = {};
    for (const entry of entries ?? []) {
      const day = new Date(entry.logged_at).getDate();
      if (!map[day]) map[day] = [];
      map[day].push(entry);
    }
    return map;
  }, [entries]);

  // Calendar grid
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View className="bg-surface border border-border rounded-2xl p-4">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <TouchableOpacity onPress={goBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ChevronLeft size={20} color="#e5e5e5" />
        </TouchableOpacity>
        <Text className="text-white font-semibold text-base">
          {MONTH_NAMES[month]} {year}
        </Text>
        <TouchableOpacity onPress={goForward} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ChevronRight size={20} color="#e5e5e5" />
        </TouchableOpacity>
      </View>

      {/* Day labels */}
      <View className="flex-row mb-1">
        {DAYS_OF_WEEK.map((d) => (
          <View key={d} className="flex-1 items-center">
            <Text className="text-muted text-xs font-medium">{d}</Text>
          </View>
        ))}
      </View>

      {/* Grid */}
      <View className="flex-row flex-wrap">
        {cells.map((day, i) => {
          if (day === null) {
            return <View key={`empty-${i}`} className="w-[14.28%] aspect-square" />;
          }

          const dayEntries = dayMap[day];
          const hasEntries = dayEntries && dayEntries.length > 0;
          const isToday = isCurrentMonth && day === today;

          const cell = (
            <View
              key={day}
              className="w-[14.28%] aspect-square items-center justify-center"
            >
              <View
                className={`w-9 h-9 rounded-full items-center justify-center ${
                  isToday ? 'border border-accent/50' : ''
                }`}
              >
                <Text
                  className={`text-xs ${
                    hasEntries ? 'text-white font-semibold' : 'text-muted'
                  }`}
                >
                  {day}
                </Text>
                {hasEntries && (
                  <View className="flex-row gap-0.5 mt-0.5">
                    {dayEntries.length <= 2 ? (
                      dayEntries.map((entry, j) => (
                        <View
                          key={j}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: '#e5e5e5' }}
                        />
                      ))
                    ) : (
                      <>
                        <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#e5e5e5' }} />
                        <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#e5e5e5' }} />
                        <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#e5e5e5' }} />
                      </>
                    )}
                  </View>
                )}
              </View>
            </View>
          );

          if (hasEntries) {
            return (
              <TouchableOpacity
                key={day}
                className="w-[14.28%] aspect-square items-center justify-center"
                onPress={() => router.push(`/game/${dayEntries[0].game_id}`)}
                activeOpacity={0.6}
              >
                <View
                  className={`w-9 h-9 rounded-full items-center justify-center ${
                    isToday ? 'border border-accent/50' : ''
                  }`}
                >
                  <Text className="text-white text-xs font-semibold">{day}</Text>
                  <View className="flex-row gap-0.5 mt-0.5">
                    {dayEntries.length <= 2 ? (
                      dayEntries.map((entry, j) => (
                        <View
                          key={j}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: '#e5e5e5' }}
                        />
                      ))
                    ) : (
                      <>
                        <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#e5e5e5' }} />
                        <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#e5e5e5' }} />
                        <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#e5e5e5' }} />
                      </>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }

          return cell;
        })}
      </View>
    </View>
  );
}
