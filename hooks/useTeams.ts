import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getProvider } from '@/lib/providers';
import type { Team, Sport } from '@/types/database';

async function fetchTeams(sport: Sport): Promise<Team[]> {
  const conferences = getProvider(sport).getConferences();
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('sport', sport)
    .in('conference', conferences)
    .order('full_name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Team[];
}

export function useTeams(sport: Sport = 'nba') {
  return useQuery({
    queryKey: ['teams', sport],
    queryFn: () => fetchTeams(sport),
    staleTime: Infinity,
  });
}
