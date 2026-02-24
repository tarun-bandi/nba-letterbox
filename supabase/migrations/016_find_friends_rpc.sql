CREATE OR REPLACE FUNCTION public.find_friends_by_email(email_list text[])
RETURNS TABLE(user_id uuid, email text, handle text, display_name text, avatar_url text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT au.id, au.email::text, up.handle, up.display_name, up.avatar_url
  FROM auth.users au
  JOIN public.user_profiles up ON up.id = au.id
  WHERE au.email = ANY(email_list);
END;
$$;
