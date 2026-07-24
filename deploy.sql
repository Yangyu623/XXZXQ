
-- === 第0步：确保 account 有唯一约束 ===
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_account_key') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_account_key UNIQUE (account);
  END IF;
END $$;
-- ============================================
-- 鏈€缁堥儴缃?SQL锛氭潈闄?+ RPC 瀹屾暣淇
-- ============================================

-- === 绗?姝ワ細绉婚櫎鎵€鏈夐樆姝㈢洿鎺ュ啓鎿嶄綔鐨?RESTRICTIVE 绛栫暐 ===
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('posts','comments','likes','users') AND policyname LIKE 'deny_anon%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- === 绗?姝ワ細纭繚 RLS 寮€鍚?===
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- === 绗?姝ワ細鍏佽鎵€鏈変汉璇诲啓锛堢畝鍗曠殑瀹芥澗绛栫暐锛?==
DROP POLICY IF EXISTS "allow_all_posts" ON posts;
CREATE POLICY "allow_all_posts" ON posts FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_comments" ON comments;
CREATE POLICY "allow_all_comments" ON comments FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_likes" ON likes;
CREATE POLICY "allow_all_likes" ON likes FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_users" ON users;
CREATE POLICY "allow_all_users" ON users FOR ALL TO anon USING (true) WITH CHECK (true);

-- === 绗?姝ワ細鍒楃骇淇濇姢 - 闅愯棌 password_hash ===
REVOKE ALL ON users FROM anon;
GRANT SELECT (account, nickname, status, is_admin, created_at, nickname_updated_at) ON public.users TO anon;
GRANT UPDATE (nickname, nickname_updated_at, password_hash) ON public.users TO anon;

-- === 绗?姝ワ細check_login 鐧诲綍楠岃瘉 ===
DROP FUNCTION IF EXISTS check_login(text,text);
CREATE OR REPLACE FUNCTION check_login(p_account text, p_password text)
RETURNS TABLE(success boolean, is_admin boolean, status text, error_msg text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE user_row public.users%ROWTYPE;
BEGIN
  SELECT * INTO user_row FROM public.users WHERE account = p_account;
  IF NOT FOUND THEN RETURN QUERY SELECT false, false, '', 'user not found'; RETURN; END IF;
  IF user_row.status = 'pending' THEN RETURN QUERY SELECT false, false, user_row.status, 'pending'; RETURN; END IF;
  IF user_row.status = 'rejected' THEN RETURN QUERY SELECT false, false, user_row.status, 'rejected'; RETURN; END IF;
  IF user_row.status = 'disabled' THEN RETURN QUERY SELECT false, false, user_row.status, 'disabled'; RETURN; END IF;
  IF position(':' in user_row.password_hash) > 0 THEN
    IF user_row.password_hash = split_part(user_row.password_hash, ':', 1) || ':' || encode(digest(split_part(user_row.password_hash, ':', 1) || p_password, 'sha256'), 'hex') THEN
      RETURN QUERY SELECT true, user_row.is_admin, user_row.status, '';
    ELSE RETURN QUERY SELECT false, false, user_row.status, 'wrong pwd'; END IF;
  ELSE
    IF user_row.password_hash = encode(digest(p_password, 'sha256'), 'hex') THEN
      RETURN QUERY SELECT true, user_row.is_admin, user_row.status, '';
    ELSE RETURN QUERY SELECT false, false, user_row.status, 'wrong pwd'; END IF;
  END IF;
END;
$$;

-- === 绗?姝ワ細register_user 娉ㄥ唽 ===
DROP FUNCTION IF EXISTS register_user(text,text,text);
CREATE OR REPLACE FUNCTION register_user(p_account text, p_nickname text, p_password_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.users WHERE created_at > NOW() - INTERVAL '1 hour') >= 30 THEN
    RAISE EXCEPTION 'rate limit';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE account = p_account) THEN
    RAISE EXCEPTION 'account exists';
  END IF;
  INSERT INTO public.users (account, nickname, password_hash, status, is_admin)
  VALUES (p_account, p_nickname, p_password_hash, 'pending', false);
END;
$$;

-- === 绗?姝ワ細approve_user_rpc 瀹℃牳 ===
DROP FUNCTION IF EXISTS approve_user_rpc(text,text,text);
CREATE OR REPLACE FUNCTION approve_user_rpc(p_admin_account text, p_target_account text, p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_admin public.users%ROWTYPE; v_target_nickname text;
BEGIN
  SELECT * INTO v_admin FROM public.users WHERE account = p_admin_account AND is_admin = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'not admin'; END IF;
  IF p_action = 'approve' THEN UPDATE public.users SET status = 'approved' WHERE account = p_target_account;
  ELSIF p_action = 'reject' THEN UPDATE public.users SET status = 'rejected' WHERE account = p_target_account;
  ELSIF p_action = 'disable' THEN
    SELECT nickname INTO v_target_nickname FROM public.users WHERE account = p_target_account;
    DELETE FROM public.likes WHERE user_nickname = v_target_nickname;
    DELETE FROM public.comments WHERE account = p_target_account;
    DELETE FROM public.posts WHERE account = p_target_account;
    UPDATE public.users SET status = 'disabled' WHERE account = p_target_account;
  END IF;
END;
$$;

-- === 绗?姝ワ細鍏朵綑 RPC ===
DROP FUNCTION IF EXISTS clear_rejected(text);
CREATE OR REPLACE FUNCTION clear_rejected(p_admin_account text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_admin public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM public.users WHERE account = p_admin_account AND is_admin = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'not admin'; END IF;
  DELETE FROM public.users WHERE status = 'rejected';
END;
$$;

DROP FUNCTION IF EXISTS toggle_like(bigint,text);
CREATE OR REPLACE FUNCTION toggle_like(p_post_id bigint, p_account text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_like public.likes%ROWTYPE; v_count integer; v_nickname text;
BEGIN
  SELECT nickname INTO v_nickname FROM public.users WHERE account = p_account;
  IF v_nickname IS NULL THEN RAISE EXCEPTION 'user not found'; END IF;
  SELECT * INTO v_like FROM public.likes WHERE post_id = p_post_id AND user_nickname = v_nickname;
  IF FOUND THEN DELETE FROM public.likes WHERE id = v_like.id;
  ELSE INSERT INTO public.likes (post_id, user_nickname) VALUES (p_post_id, v_nickname); END IF;
  SELECT COUNT(*) INTO v_count FROM public.likes WHERE post_id = p_post_id;
  UPDATE public.posts SET like_count = v_count WHERE id = p_post_id;
  RETURN v_count;
END;
$$;

DROP FUNCTION IF EXISTS add_comment(bigint,text,text,bigint);
CREATE OR REPLACE FUNCTION add_comment(p_post_id bigint, p_account text, p_content text, p_parent_id bigint DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count integer; v_user public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE account = p_account;
  IF NOT FOUND OR v_user.status != 'approved' THEN RAISE EXCEPTION 'not approved'; END IF;
  INSERT INTO public.comments (post_id, nickname, content, parent_id) VALUES (p_post_id, v_user.nickname, p_content, p_parent_id);
  SELECT COUNT(*) INTO v_count FROM public.comments WHERE post_id = p_post_id;
  UPDATE public.posts SET comment_count = v_count WHERE id = p_post_id;
END;
$$;

DROP FUNCTION IF EXISTS delete_post_rpc(bigint,text);
CREATE OR REPLACE FUNCTION delete_post_rpc(p_post_id bigint, p_account text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_post public.posts%ROWTYPE; v_user public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'post not found'; END IF;
  SELECT * INTO v_user FROM public.users WHERE account = p_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  IF v_post.nickname != v_user.nickname AND NOT v_user.is_admin THEN RAISE EXCEPTION 'not owner'; END IF;
  DELETE FROM public.likes WHERE post_id = p_post_id;
  DELETE FROM public.comments WHERE post_id = p_post_id;
  DELETE FROM public.posts WHERE id = p_post_id;
END;
$$;

DROP FUNCTION IF EXISTS delete_comment_rpc(bigint,text);
CREATE OR REPLACE FUNCTION delete_comment_rpc(p_comment_id bigint, p_account text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_comment public.comments%ROWTYPE; v_user public.users%ROWTYPE; v_count integer;
BEGIN
  SELECT * INTO v_comment FROM public.comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'comment not found'; END IF;
  SELECT * INTO v_user FROM public.users WHERE account = p_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  IF v_comment.nickname != v_user.nickname AND NOT v_user.is_admin THEN RAISE EXCEPTION 'not owner'; END IF;
  DELETE FROM public.comments WHERE id = p_comment_id;
  SELECT COUNT(*) INTO v_count FROM public.comments WHERE post_id = v_comment.post_id;
  UPDATE public.posts SET comment_count = v_count WHERE id = v_comment.post_id;
END;
$$;

DROP FUNCTION IF EXISTS check_old_password(text,text);
CREATE OR REPLACE FUNCTION check_old_password(p_account text, p_password text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE user_row public.users%ROWTYPE;
BEGIN
  SELECT * INTO user_row FROM public.users WHERE account = p_account;
  IF NOT FOUND THEN RETURN false; END IF;
  IF position(':' in user_row.password_hash) > 0 THEN
    RETURN user_row.password_hash = split_part(user_row.password_hash, ':', 1) || ':' || encode(digest(split_part(user_row.password_hash, ':', 1) || p_password, 'sha256'), 'hex');
  ELSE
    RETURN user_row.password_hash = encode(digest(p_password, 'sha256'), 'hex');
  END IF;
END;
$$;

-- === 绗?姝ワ細閲嶆柊鎺堟潈 ===
GRANT EXECUTE ON FUNCTION check_login TO anon;
GRANT EXECUTE ON FUNCTION check_old_password TO anon;
GRANT EXECUTE ON FUNCTION register_user TO anon;
GRANT EXECUTE ON FUNCTION approve_user_rpc TO anon;
GRANT EXECUTE ON FUNCTION clear_rejected TO anon;
GRANT EXECUTE ON FUNCTION toggle_like TO anon;
GRANT EXECUTE ON FUNCTION add_comment TO anon;
GRANT EXECUTE ON FUNCTION delete_post_rpc TO anon;
GRANT EXECUTE ON FUNCTION delete_comment_rpc TO anon;

-- === 绗?0姝ワ細纭繚绠＄悊鍛樺瓨鍦?===
INSERT INTO public.users (account, nickname, password_hash, status, is_admin, created_at)
VALUES
('1231', 'admin1', encode(digest('1231', 'sha256'), 'hex'), 'approved', true, NOW()),
('1232', 'admin2', encode(digest('1232', 'sha256'), 'hex'), 'approved', true, NOW()),
('1233', 'admin3', encode(digest('1233', 'sha256'), 'hex'), 'approved', true, NOW())
ON CONFLICT (account) DO UPDATE SET
  status = 'approved', is_admin = true, password_hash = EXCLUDED.password_hash;