
-- ===== 0. 授权 anon 调用所有 RPC 函数（必须先执行） =====
GRANT EXECUTE ON FUNCTION check_login TO anon;
GRANT EXECUTE ON FUNCTION check_old_password TO anon;
GRANT EXECUTE ON FUNCTION register_user TO anon;
GRANT EXECUTE ON FUNCTION create_post TO anon;
GRANT EXECUTE ON FUNCTION delete_post_rpc TO anon;
GRANT EXECUTE ON FUNCTION toggle_like TO anon;
GRANT EXECUTE ON FUNCTION add_comment TO anon;
GRANT EXECUTE ON FUNCTION delete_comment_rpc TO anon;
GRANT EXECUTE ON FUNCTION approve_user_rpc TO anon;
GRANT EXECUTE ON FUNCTION clear_rejected TO anon;
-- ============================================
-- Supabase RLS 最终版 - 安全 + 防刷
-- 按顺序执行全部
-- ============================================

-- ===== 1. 核爆所有旧策略 =====
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('posts','comments','likes','users'))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ===== 2. RLS 开启 =====
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ===== 3. 只允许匿名读 =====
CREATE POLICY "read_posts" ON posts FOR SELECT TO anon USING (true);
CREATE POLICY "read_comments" ON comments FOR SELECT TO anon USING (true);
CREATE POLICY "read_likes" ON likes FOR SELECT TO anon USING (true);
CREATE POLICY "read_users" ON users FOR SELECT TO anon USING (true);

-- ===== 4. 列级保护：禁止读 password_hash =====
REVOKE ALL ON users FROM anon;
GRANT SELECT (nickname, status, is_admin, created_at) ON users TO anon;

-- ===== 5. 显式拒绝所有写入（RESTRICTIVE 策略优先） =====
CREATE POLICY "deny_anon_insert" ON posts AS RESTRICTIVE FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY "deny_anon_update" ON posts AS RESTRICTIVE FOR UPDATE TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_anon_delete" ON posts AS RESTRICTIVE FOR DELETE TO anon USING (false);

CREATE POLICY "deny_anon_insert_c" ON comments AS RESTRICTIVE FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY "deny_anon_update_c" ON comments AS RESTRICTIVE FOR UPDATE TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_anon_delete_c" ON comments AS RESTRICTIVE FOR DELETE TO anon USING (false);

CREATE POLICY "deny_anon_insert_l" ON likes AS RESTRICTIVE FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY "deny_anon_update_l" ON likes AS RESTRICTIVE FOR UPDATE TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_anon_delete_l" ON likes AS RESTRICTIVE FOR DELETE TO anon USING (false);

CREATE POLICY "deny_anon_insert_u" ON users AS RESTRICTIVE FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY "deny_anon_update_u" ON users AS RESTRICTIVE FOR UPDATE TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_anon_delete_u" ON users AS RESTRICTIVE FOR DELETE TO anon USING (false);

-- ===== 6. RPC：登录验证（密码哈希不离开服务器） =====
CREATE OR REPLACE FUNCTION check_login(p_account text, p_password text)
RETURNS TABLE(success boolean, is_admin boolean, status text, error_msg text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE user_row users%ROWTYPE;
BEGIN
  SELECT * INTO user_row FROM users WHERE account = p_account;
  IF NOT FOUND THEN RETURN QUERY SELECT false, false, '', '用户不存在'; RETURN; END IF;
  IF user_row.status = 'pending' THEN RETURN QUERY SELECT false, false, user_row.status, '账号待审核'; RETURN; END IF;
  IF user_row.status = 'rejected' THEN RETURN QUERY SELECT false, false, user_row.status, '账号已被拒绝'; RETURN; END IF;
  IF user_row.status = 'disabled' THEN RETURN QUERY SELECT false, false, user_row.status, '账号已被禁用'; RETURN; END IF;
  IF position(':' in user_row.password_hash) > 0 THEN
    IF user_row.password_hash = split_part(user_row.password_hash, ':', 1) || ':' || encode(digest(split_part(user_row.password_hash, ':', 1) || p_password, 'sha256'), 'hex') THEN
      RETURN QUERY SELECT true, user_row.is_admin, user_row.status, '';
    ELSE RETURN QUERY SELECT false, false, user_row.status, '密码错误'; END IF;
  ELSE
    IF user_row.password_hash = encode(digest(p_password, 'sha256'), 'hex') THEN
      RETURN QUERY SELECT true, user_row.is_admin, user_row.status, '';
    ELSE RETURN QUERY SELECT false, false, user_row.status, '密码错误'; END IF;
  END IF;
END; $$;

-- ===== 7. RPC：验证旧密码 =====
CREATE OR REPLACE FUNCTION check_old_password(p_account text, p_password text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE user_row users%ROWTYPE;
BEGIN
  SELECT * INTO user_row FROM users WHERE account = p_account;
  IF NOT FOUND THEN RETURN false; END IF;
  IF position(':' in user_row.password_hash) > 0 THEN
    RETURN user_row.password_hash = split_part(user_row.password_hash, ':', 1) || ':' || encode(digest(split_part(user_row.password_hash, ':', 1) || p_password, 'sha256'), 'hex');
  ELSE
    RETURN user_row.password_hash = encode(digest(p_password, 'sha256'), 'hex');
  END IF;
END; $$;

-- ===== 8. RPC：注册 =====
CREATE OR REPLACE FUNCTION register_user(p_account text, p_nickname text, p_password_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '1 hour') >= 30 THEN
    RAISE EXCEPTION '注册过于频繁';
  END IF;
  INSERT INTO users (nickname, password_hash) VALUES (p_nickname, p_password_hash);
END; $$;

-- ===== 9. RPC：发帖 =====
CREATE OR REPLACE FUNCTION create_post(p_nickname text, p_content text, p_images text, p_is_anonymous boolean)
RETURNS SETOF posts LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user users%ROWTYPE; v_post posts%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM users WHERE account = p_account;
  IF NOT FOUND OR v_user.status != 'approved' THEN RAISE EXCEPTION '用户未通过审核'; END IF;
  IF (SELECT COUNT(*) FROM posts WHERE account = p_account AND created_at > NOW() - INTERVAL '1 hour') >= 20 THEN
    RAISE EXCEPTION '发帖过于频繁';
  END IF;
  INSERT INTO posts (nickname, content, images, is_anonymous, like_count, comment_count)
  VALUES (p_nickname, p_content, p_images, COALESCE(p_is_anonymous, false), 0, 0) RETURNING * INTO v_post;
  RETURN NEXT v_post;
END; $$;

-- ===== 10. RPC：删帖 =====
CREATE OR REPLACE FUNCTION delete_post_rpc(p_post_id bigint, p_nickname text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_post posts%ROWTYPE; v_user users%ROWTYPE;
BEGIN
  SELECT * INTO v_post FROM posts WHERE id = p_post_id;
  IF NOT FOUND THEN RAISE EXCEPTION '帖子不存在'; END IF;
  SELECT * INTO v_user FROM users WHERE account = p_account;
  IF NOT FOUND THEN RAISE EXCEPTION '用户不存在'; END IF;
  IF v_post.nickname != p_nickname AND NOT v_user.is_admin THEN RAISE EXCEPTION '无权删除'; END IF;
  DELETE FROM likes WHERE post_id = p_post_id;
  DELETE FROM comments WHERE post_id = p_post_id;
  DELETE FROM posts WHERE id = p_post_id;
END; $$;

-- ===== 11. RPC：点赞 =====
CREATE OR REPLACE FUNCTION toggle_like(p_post_id bigint, p_nickname text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_like likes%ROWTYPE; v_count integer;
BEGIN
  SELECT * INTO v_like FROM likes WHERE post_id = p_post_id AND user_nickname = p_nickname;
  IF FOUND THEN DELETE FROM likes WHERE id = v_like.id;
  ELSE INSERT INTO likes (post_id, user_nickname) VALUES (p_post_id, p_nickname); END IF;
  SELECT COUNT(*) INTO v_count FROM likes WHERE post_id = p_post_id;
  UPDATE posts SET like_count = v_count WHERE id = p_post_id;
  RETURN v_count;
END; $$;

-- ===== 12. RPC：发评论 =====
CREATE OR REPLACE FUNCTION add_comment(p_post_id bigint, p_nickname text, p_content text, p_parent_id bigint DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count integer; v_user users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM users WHERE account = p_account;
  IF NOT FOUND OR v_user.status != 'approved' THEN RAISE EXCEPTION '用户未通过审核'; END IF;
  INSERT INTO comments (post_id, nickname, content, parent_id) VALUES (p_post_id, p_nickname, p_content, p_parent_id);
  SELECT COUNT(*) INTO v_count FROM comments WHERE post_id = p_post_id;
  UPDATE posts SET comment_count = v_count WHERE id = p_post_id;
END; $$;

-- ===== 13. RPC：删评论 =====
CREATE OR REPLACE FUNCTION delete_comment_rpc(p_comment_id bigint, p_nickname text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_comment comments%ROWTYPE; v_user users%ROWTYPE; v_count integer;
BEGIN
  SELECT * INTO v_comment FROM comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RAISE EXCEPTION '评论不存在'; END IF;
  SELECT * INTO v_user FROM users WHERE account = p_account;
  IF NOT FOUND THEN RAISE EXCEPTION '用户不存在'; END IF;
  IF v_comment.nickname != p_nickname AND NOT v_user.is_admin THEN RAISE EXCEPTION '无权删除'; END IF;
  DELETE FROM comments WHERE id = p_comment_id;
  SELECT COUNT(*) INTO v_count FROM comments WHERE post_id = v_comment.post_id;
  UPDATE posts SET comment_count = v_count WHERE id = v_comment.post_id;
END; $$;

-- ===== 14. RPC：审核/禁用用户 =====
CREATE OR REPLACE FUNCTION approve_user_rpc(p_admin_account text, p_target_account text, p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_admin users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM users WHERE account = p_admin_account AND is_admin = true;
  IF NOT FOUND OR NOT v_admin.is_admin THEN RAISE EXCEPTION '无管理员权限'; END IF;
  IF p_action = 'approve' THEN UPDATE users SET status = 'approved' WHERE account = p_account;
  ELSIF p_action = 'reject' THEN UPDATE users SET status = 'rejected' WHERE account = p_account;
  ELSIF p_action = 'disable' THEN
    DELETE FROM likes WHERE user_nickname = p_nickname;
    DELETE FROM comments WHERE account = p_account;
    DELETE FROM posts WHERE account = p_account;
    UPDATE users SET status = 'disabled' WHERE account = p_account;
  END IF;
END; $$;

-- ===== 15. RPC：清空已拒绝用户 =====
CREATE OR REPLACE FUNCTION clear_rejected(p_admin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_admin users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM users WHERE account = p_admin_account AND is_admin = true;
  IF NOT FOUND OR NOT v_admin.is_admin THEN RAISE EXCEPTION '无管理员权限'; END IF;
  DELETE FROM users WHERE status = 'rejected';
END; $$;

-- ===== 16. 发帖频率限制触发器 =====
DROP TRIGGER IF EXISTS trg_post_rate ON posts;
CREATE OR REPLACE FUNCTION check_post_rate() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE nickname = NEW.nickname AND is_admin = TRUE) THEN RETURN NEW; END IF;
  IF (SELECT COUNT(*) FROM posts WHERE nickname = NEW.nickname AND created_at > NOW() - INTERVAL '1 hour') >= 20 THEN
    RAISE EXCEPTION '发帖过于频繁';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_post_rate BEFORE INSERT ON posts FOR EACH ROW EXECUTE FUNCTION check_post_rate();