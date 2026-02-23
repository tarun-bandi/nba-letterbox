import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Team } from '@/types/database';

async function fetchTeams(): Promise<Team[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .in('conference', ['East', 'West'])
    .order('full_name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Team[];
}

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: fetchTeams,
    staleTime: Infinity,
  });
}
