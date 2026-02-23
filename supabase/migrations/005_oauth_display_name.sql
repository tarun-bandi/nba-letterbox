-- Update handle_new_user() to support Google OAuth's full_name metadata key
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_profiles (user_id, display_name, handle)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data->>'handle',
      lower(split_part(new.email, '@', 1)) || '_' || substr(gen_random_uuid()::text, 1, 6)
    )
  );
  return new;
end;
$$;
