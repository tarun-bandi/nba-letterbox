-- Comments on game logs
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_id uuid not null references public.game_logs(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index idx_comments_log_id on public.comments(log_id);
create index idx_comments_user_id on public.comments(user_id);

-- RLS
alter table public.comments enable row level security;

-- Anyone can read comments
create policy "comments_select" on public.comments
  for select using (true);

-- Authenticated users can insert their own comments
create policy "comments_insert" on public.comments
  for insert with check (auth.uid() = user_id);

-- Users can delete their own comments
create policy "comments_delete" on public.comments
  for delete using (auth.uid() = user_id);
