-- ============================================
-- ????? - ?????
-- ? Supabase SQL Editor ???
-- ============================================

-- 1. ?????
CREATE TABLE IF NOT EXISTS banned_words (
  word TEXT PRIMARY KEY,
  created_by TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE banned_words ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "banned_words_select" ON banned_words;
CREATE POLICY "banned_words_select" ON banned_words FOR SELECT TO anon USING (true);

-- 2. ?????
INSERT INTO banned_words (word) VALUES
  ('??'),('??'),('??'),('???'),('nmsl'),
  ('???'),('???'),('???'),('??'),('??'),
  ('??'),('??'),('??'),('??'),('??'),('??'),('??'),
  ('??'),('??'),('??'),('??'),('??'),
  ('??'),('??'),('??'),('??'),('??'),('V?')
ON CONFLICT (word) DO NOTHING;

-- 3. ?? create_post_rpc: INSERT ??????
DROP FUNCTION IF EXISTS create_post_rpc(text,text,text,boolean,text);
CREATE OR REPLACE FUNCTION create_post_rpc(
  p_account text, p_nickname text, p_content text,
  p_is_anonymous boolean, p_images text
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_post_id bigint;
  v_hit text;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE account = p_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  IF v_user.status != 'approved' THEN RAISE EXCEPTION 'user not approved'; END IF;

  -- ?????
  SELECT word INTO v_hit FROM banned_words WHERE p_content ILIKE '%' || word || '%' LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'content banned: %', v_hit; END IF;

  INSERT INTO public.posts (nickname, content, is_anonymous, images, account)
  VALUES (p_nickname, p_content, p_is_anonymous, p_images, p_account)
  RETURNING id INTO v_post_id;
  RETURN v_post_id;
END;
$$;

-- 4. ?? add_comment: INSERT ??????
DROP FUNCTION IF EXISTS add_comment(bigint,text,text,bigint);
CREATE OR REPLACE FUNCTION add_comment(p_post_id bigint, p_account text, p_content text, p_parent_id bigint DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_count integer;
  v_hit text;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE account = p_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  IF v_user.status != 'approved' THEN RAISE EXCEPTION 'user not approved'; END IF;

  -- ?????
  SELECT word INTO v_hit FROM banned_words WHERE p_content ILIKE '%' || word || '%' LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'content banned: %', v_hit; END IF;

  INSERT INTO public.comments (post_id, nickname, content, parent_id, account)
  VALUES (p_post_id, v_user.nickname, p_content, p_parent_id, p_account);

  SELECT COUNT(*) INTO v_count FROM public.comments WHERE post_id = p_post_id;
  UPDATE public.posts SET comment_count = v_count WHERE id = p_post_id;
END;
$$;

-- 5. ?? add_banned_word RPC?????
DROP FUNCTION IF EXISTS add_banned_word(text,text);
CREATE OR REPLACE FUNCTION add_banned_word(p_admin_account text, p_word text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM public.users WHERE account = p_admin_account AND is_admin = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'not admin'; END IF;
  INSERT INTO banned_words (word, created_by) VALUES (p_word, p_admin_account)
  ON CONFLICT (word) DO NOTHING;
END;
$$;

-- 6. ?? remove_banned_word RPC?????
DROP FUNCTION IF EXISTS remove_banned_word(text,text);
CREATE OR REPLACE FUNCTION remove_banned_word(p_admin_account text, p_word text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM public.users WHERE account = p_admin_account AND is_admin = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'not admin'; END IF;
  DELETE FROM banned_words WHERE word = p_word;
END;
$$;

SELECT 'Banned words feature installed' AS result;
