-- ============================================
-- ?????? - ???
-- ? Supabase SQL Editor ?????
-- ============================================

-- === 1. ?? RLS ?? ===
DROP POLICY IF EXISTS "allow_all_posts" ON posts;
DROP POLICY IF EXISTS "posts_select_anon" ON posts;
CREATE POLICY "posts_select_anon" ON posts FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "allow_all_comments" ON comments;
DROP POLICY IF EXISTS "comments_select_anon" ON comments;
CREATE POLICY "comments_select_anon" ON comments FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "allow_all_likes" ON likes;
DROP POLICY IF EXISTS "likes_select_anon" ON likes;
CREATE POLICY "likes_select_anon" ON likes FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "allow_all_users" ON users;

-- === 2. ?? create_post_rpc????? INSERT? ===
DROP FUNCTION IF EXISTS create_post_rpc(text,text,text,boolean,text);
CREATE OR REPLACE FUNCTION create_post_rpc(
  p_account text, p_nickname text, p_content text,
  p_is_anonymous boolean, p_images text
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_post_id bigint;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE account = p_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  IF v_user.status != 'approved' THEN RAISE EXCEPTION 'user not approved'; END IF;
  
  INSERT INTO public.posts (nickname, content, is_anonymous, images, account)
  VALUES (p_nickname, p_content, p_is_anonymous, p_images, p_account)
  RETURNING id INTO v_post_id;
  
  RETURN v_post_id;
END;
$$;

-- === 3. ?? update_profile_rpc????? UPDATE users? ===
DROP FUNCTION IF EXISTS update_profile_rpc(text,text,text);
CREATE OR REPLACE FUNCTION update_profile_rpc(
  p_account text, p_new_nickname text, p_new_password_hash text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE account = p_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  IF v_user.status != 'approved' THEN RAISE EXCEPTION 'user not approved'; END IF;
  
  IF p_new_nickname IS NOT NULL AND p_new_nickname != '' THEN
    -- ?????????????
    IF v_user.nickname_updated_at IS NOT NULL AND v_user.nickname_updated_at > NOW() - INTERVAL '30 days' THEN
      RAISE EXCEPTION 'nickname can only be changed once per month';
    END IF;
    UPDATE public.users SET nickname = p_new_nickname, nickname_updated_at = NOW() WHERE account = p_account;
  END IF;
  
  IF p_new_password_hash IS NOT NULL AND p_new_password_hash != '' THEN
    UPDATE public.users SET password_hash = p_new_password_hash WHERE account = p_account;
  END IF;
END;
$$;

-- === 4. ?? toggle_like????????? ===
DROP FUNCTION IF EXISTS toggle_like(bigint,text);
CREATE OR REPLACE FUNCTION toggle_like(p_post_id bigint, p_account text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_like public.likes%ROWTYPE;
  v_count integer;
  v_nickname text;
  v_user public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE account = p_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  IF v_user.status != 'approved' THEN RAISE EXCEPTION 'user not approved'; END IF;
  
  v_nickname := v_user.nickname;
  
  SELECT * INTO v_like FROM public.likes WHERE post_id = p_post_id AND user_nickname = v_nickname;
  IF FOUND THEN
    DELETE FROM public.likes WHERE id = v_like.id;
  ELSE
    INSERT INTO public.likes (post_id, user_nickname) VALUES (p_post_id, v_nickname);
  END IF;
  
  SELECT COUNT(*) INTO v_count FROM public.likes WHERE post_id = p_post_id;
  UPDATE public.posts SET like_count = v_count WHERE id = p_post_id;
  RETURN v_count;
END;
$$;

-- === 5. ?? add_comment???????? ===
DROP FUNCTION IF EXISTS add_comment(bigint,text,text,bigint);
CREATE OR REPLACE FUNCTION add_comment(p_post_id bigint, p_account text, p_content text, p_parent_id bigint DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_count integer;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE account = p_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  IF v_user.status != 'approved' THEN RAISE EXCEPTION 'user not approved'; END IF;
  
  INSERT INTO public.comments (post_id, nickname, content, parent_id, account)
  VALUES (p_post_id, v_user.nickname, p_content, p_parent_id, p_account);
  
  SELECT COUNT(*) INTO v_count FROM public.comments WHERE post_id = p_post_id;
  UPDATE public.posts SET comment_count = v_count WHERE id = p_post_id;
END;
$$;

-- === 6. ?? delete_comment_rpc????????? ===
DROP FUNCTION IF EXISTS delete_comment_rpc(bigint,text);
CREATE OR REPLACE FUNCTION delete_comment_rpc(p_comment_id bigint, p_account text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_comment public.comments%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_count integer;
  v_post_id bigint;
BEGIN
  SELECT * INTO v_comment FROM public.comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'comment not found'; END IF;
  
  SELECT * INTO v_user FROM public.users WHERE account = p_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  
  IF v_comment.nickname != v_user.nickname AND NOT v_user.is_admin THEN
    RAISE EXCEPTION 'not owner';
  END IF;
  
  v_post_id := v_comment.post_id;
  DELETE FROM public.comments WHERE id = p_comment_id;
  
  SELECT COUNT(*) INTO v_count FROM public.comments WHERE post_id = v_post_id;
  UPDATE public.posts SET comment_count = v_count WHERE id = v_post_id;
END;
$$;

-- ??
SELECT 'Security fix applied' AS result;
