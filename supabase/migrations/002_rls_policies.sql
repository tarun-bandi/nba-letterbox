-- ============================================================
-- Enable RLS on all tables
-- ============================================================
alter table public.user_profiles       enable row level security;
alter table public.follows             enable row level security;
alter table public.teams               enable row level security;
alter table public.players             enable row level security;
alter table public.seasons             enable row level security;
alter table public.games               enable row level security;
alter table public.game_logs           enable row level security;
alter table public.log_tags            enable row level security;
alter table public.game_log_tag_map    enable row level security;
alter table public.likes               enable row level security;
alter table public.lists               enable row level security;
alter table public.list_items          enable row level security;
alter table public.user_favorite_teams   enable row level security;
alter table public.user_favorite_players enable row level security;

-- ============================================================
-- user_profiles
-- ============================================================
create policy "Public profiles are viewable by everyone"
  on public.user_profiles for select using (true);

create policy "Users can insert their own profile"
  on public.user_profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own profile"
  on public.user_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- follows
-- ============================================================
create policy "Follows are viewable by everyone"
  on public.follows for select using (true);

create policy "Authenticated users can follow others"
  on public.follows for insert
  with check (auth.uid() = follower_id);

create policy "Users can unfollow (delete own follows)"
  on public.follows for delete
  using (auth.uid() = follower_id);

-- ============================================================
-- teams (read-only via client; ingestion uses service role)
-- ============================================================
create policy "Teams are viewable by everyone"
  on public.teams for select using (true);

-- ============================================================
-- players (read-only via client)
-- ============================================================
create policy "Players are viewable by everyone"
  on public.players for select using (true);

-- ============================================================
-- seasons (read-only via client)
-- ============================================================
create policy "Seasons are viewable by everyone"
  on public.seasons for select using (true);

-- ============================================================
-- games (read-only via client)
-- ============================================================
create policy "Games are viewable by everyone"
  on public.games for select using (true);

-- ============================================================
-- game_logs
-- ============================================================
create policy "Game logs are viewable by everyone"
  on public.game_logs for select using (true);

create policy "Authenticated users can create their own logs"
  on public.game_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own logs"
  on public.game_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own logs"
  on public.game_logs for delete
  using (auth.uid() = user_id);

-- ============================================================
-- log_tags (read-only via client)
-- ============================================================
create policy "Log tags are viewable by everyone"
  on public.log_tags for select using (true);

-- ============================================================
-- game_log_tag_map
-- ============================================================
create policy "Log tag maps are viewable by everyone"
  on public.game_log_tag_map for select using (true);

create policy "Users can manage tags on their own logs"
  on public.game_log_tag_map for insert
  with check (
    exists (
      select 1 from public.game_logs
      where id = log_id and user_id = auth.uid()
    )
  );

create policy "Users can remove tags from their own logs"
  on public.game_log_tag_map for delete
  using (
    exists (
      select 1 from public.game_logs
      where id = log_id and user_id = auth.uid()
    )
  );

-- ============================================================
-- likes
-- ============================================================
create policy "Likes are viewable by everyone"
  on public.likes for select using (true);

create policy "Authenticated users can like logs"
  on public.likes for insert
  with check (auth.uid() = user_id);

create policy "Users can unlike (delete own likes)"
  on public.likes for delete
  using (auth.uid() = user_id);

-- ============================================================
-- lists
-- ============================================================
-- Public lists are viewable by everyone; private lists only by owner
create policy "Public lists are viewable by everyone"
  on public.lists for select
  using (is_private = false or auth.uid() = user_id);

create policy "Users can create their own lists"
  on public.lists for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own lists"
  on public.lists for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own lists"
  on public.lists for delete
  using (auth.uid() = user_id);

-- ============================================================
-- list_items (visibility inherits from parent list)
-- ============================================================
create policy "List items inherit parent list visibility"
  on public.list_items for select
  using (
    exists (
      select 1 from public.lists
      where id = list_id
        and (is_private = false or user_id = auth.uid())
    )
  );

create policy "Users can add items to their own lists"
  on public.list_items for insert
  with check (
    exists (
      select 1 from public.lists
      where id = list_id and user_id = auth.uid()
    )
  );

create policy "Users can update items in their own lists"
  on public.list_items for update
  using (
    exists (
      select 1 from public.lists
      where id = list_id and user_id = auth.uid()
    )
  );

create policy "Users can remove items from their own lists"
  on public.list_items for delete
  using (
    exists (
      select 1 from public.lists
      where id = list_id and user_id = auth.uid()
    )
  );

-- ============================================================
-- user_favorite_teams
-- ============================================================
create policy "Favorite teams are viewable by everyone"
  on public.user_favorite_teams for select using (true);

create policy "Users can manage their own favorite teams"
  on public.user_favorite_teams for insert
  with check (auth.uid() = user_id);

create policy "Users can remove their own favorite teams"
  on public.user_favorite_teams for delete
  using (auth.uid() = user_id);

-- ============================================================
-- user_favorite_players
-- ============================================================
create policy "Favorite players are viewable by everyone"
  on public.user_favorite_players for select using (true);

create policy "Users can manage their own favorite players"
  on public.user_favorite_players for insert
  with check (auth.uid() = user_id);

create policy "Users can remove their own favorite players"
  on public.user_favorite_players for delete
  using (auth.uid() = user_id);
