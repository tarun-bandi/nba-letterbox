-- Game rankings table for Beli-style stack ranking
create table public.game_rankings (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  game_id    uuid    not null references public.games(id) on delete cascade,
  position   integer not null,  -- 1 = best, N = worst
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create index game_rankings_user_position_idx on public.game_rankings (user_id, position);

-- RLS
alter table public.game_rankings enable row level security;

create policy "Users can view anyone's rankings"
  on public.game_rankings for select
  using (true);

create policy "Users can insert their own rankings"
  on public.game_rankings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own rankings"
  on public.game_rankings for update
  using (auth.uid() = user_id);

create policy "Users can delete their own rankings"
  on public.game_rankings for delete
  using (auth.uid() = user_id);

-- RPC: insert a game ranking at a given position, shifting others down
create or replace function public.insert_game_ranking(
  p_user_id uuid,
  p_game_id uuid,
  p_position integer
)
returns void
language plpgsql
security definer
as $$
begin
  -- Shift existing rankings down to make room
  update public.game_rankings
    set position = position + 1,
        updated_at = now()
    where user_id = p_user_id
      and position >= p_position;

  -- Insert the new ranking
  insert into public.game_rankings (user_id, game_id, position)
    values (p_user_id, p_game_id, p_position);
end;
$$;

-- RPC: remove a game ranking and shift others up to fill the gap
create or replace function public.remove_game_ranking(
  p_user_id uuid,
  p_game_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_position integer;
begin
  -- Get current position
  select position into v_position
    from public.game_rankings
    where user_id = p_user_id and game_id = p_game_id;

  if v_position is null then
    return; -- not ranked, nothing to do
  end if;

  -- Delete the ranking
  delete from public.game_rankings
    where user_id = p_user_id and game_id = p_game_id;

  -- Shift remaining rankings up
  update public.game_rankings
    set position = position - 1,
        updated_at = now()
    where user_id = p_user_id
      and position > v_position;
end;
$$;
