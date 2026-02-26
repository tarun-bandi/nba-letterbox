import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';

interface DiaryEntry {
  logged_at: string;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toLocalMiddayDateStr(year: number, month: number, day: number): string {
  return toLocalDateStr(new Date(year, month, day, 12, 0, 0, 0));
}

async function fetchDiaryMonth(userId: string, year: number, month: number): Promise<DiaryEntry[]> {
  const startDate = new Date(year, month, 1, 0, 0, 0, 0).toISOString();
  const endDate = new Date(year, month + 1, 1, 0, 0, 0, 0).toISOString();

  const { data, error } = await supabase
    .from('game_logs')
    .select('logged_at')
    .eq('user_id', userId)
    .gte('logged_at', startDate)
    .lt('logged_at', endDate)
    .order('logged_at', { ascending: true });

  if (error) throw error;

  return (data ?? []) as DiaryEntry[];
}

interface DiaryCalendarProps {
  userId: string;
  selectedDate?: string;
  onSelectDate?: (dateStr: string) => void;
}

export default function DiaryCalendar({
  userId,
  selectedDate,
  onSelectDate,
}: DiaryCalendarProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const { data: entries } = useQuery({
    queryKey: ['diary-month', userId, year, month],
    queryFn: () => fetchDiaryMonth(userId, year, month),
    enabled: !!userId,
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

  const dayMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const entry of entries ?? []) {
      const day = new Date(entry.logged_at).getDate();
      map[day] = (map[day] ?? 0) + 1;
    }
    return map;
  }, [entries]);

  const selectedDay = useMemo(() => {
    if (!selectedDate) return null;
    const selected = new Date(`${selectedDate}T12:00:00`);
    if (Number.isNaN(selected.getTime())) return null;
    if (selected.getFullYear() !== year || selected.getMonth() !== month) return null;
    return selected.getDate();
  }, [selectedDate, year, month]);

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const renderDots = (count: number) => {
    const dots = Math.min(3, count);
    return (
      <View className="flex-row gap-0.5 mt-0.5">
        {Array.from({ length: dots }).map((_, idx) => (
          <View
            key={idx}
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: '#c9a84c' }}
          />
        ))}
      </View>
    );
  };

  return (
    <View className="bg-surface border border-border rounded-2xl p-4">
      <View className="flex-row items-center justify-between mb-3">
        <TouchableOpacity onPress={goBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ChevronLeft size={20} color="#c9a84c" />
        </TouchableOpacity>
        <Text className="text-white font-semibold text-base">
          {MONTH_NAMES[month]} {year}
        </Text>
        <TouchableOpacity onPress={goForward} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ChevronRight size={20} color="#c9a84c" />
        </TouchableOpacity>
      </View>

      <View className="flex-row mb-1">
        {DAYS_OF_WEEK.map((d) => (
          <View key={d} className="flex-1 items-center">
            <Text className="text-muted text-xs font-medium">{d}</Text>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {cells.map((day, i) => {
          if (day === null) {
            return <View key={`empty-${i}`} className="w-[14.28%] aspect-square" />;
          }

          const entryCount = dayMap[day] ?? 0;
          const hasEntries = entryCount > 0;
          const isToday = isCurrentMonth && day === today;
          const isSelected = selectedDay === day;
          const dayDateStr = toLocalMiddayDateStr(year, month, day);

          const dayBubble = (
            <View
              className={`w-9 h-9 rounded-full items-center justify-center ${
                isSelected
                  ? 'border border-accent bg-accent/20'
                  : isToday
                    ? 'border border-accent/50'
                    : ''
              }`}
            >
              <Text
                className={`text-xs ${
                  hasEntries ? 'text-white font-semibold' : 'text-muted'
                }`}
              >
                {day}
              </Text>
              {hasEntries && renderDots(entryCount)}
            </View>
          );

          if (!hasEntries) {
            return (
              <View key={day} className="w-[14.28%] aspect-square items-center justify-center">
                {dayBubble}
              </View>
            );
          }

          return (
            <TouchableOpacity
              key={day}
              className="w-[14.28%] aspect-square items-center justify-center"
              onPress={() => onSelectDate?.(dayDateStr)}
              activeOpacity={0.6}
            >
              {dayBubble}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
