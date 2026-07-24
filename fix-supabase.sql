-- ============================================
-- 淇锛歳egister_user + 绠＄悊鍛?+ 鍏ㄩ儴 RPC
-- 澶嶅埗鍒?Supabase SQL Editor 涓€娆℃€ф墽琛?-- ============================================

-- 1. 淇 register_user
DROP FUNCTION IF EXISTS register_user(text,text,text);
CREATE OR REPLACE FUNCTION register_user(p_account text, p_nickname text, p_password_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '1 hour') >= 30 THEN
    RAISE EXCEPTION '娉ㄥ唽杩囦簬棰戠箒';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE account = p_account) THEN
    RAISE EXCEPTION '璐﹀彿宸插瓨鍦?;
  END IF;
  INSERT INTO users (account, nickname, password_hash, status, is_admin)
  VALUES (p_account, p_nickname, p_password_hash, 'pending', false);
END;
$$;

-- 2. 鍒犻櫎鎵€鏈夋棫鏁版嵁
DELETE FROM likes; DELETE FROM comments; DELETE FROM posts; DELETE FROM users;

-- 3. 鍒涘缓涓変釜绠＄悊鍛橈紙瀵嗙爜=璐﹀彿锛?INSERT INTO users (account, nickname, password_hash, status, is_admin, created_at) VALUES
('1231', '绠＄悊鍛?', encode(digest('1231', 'sha256'), 'hex'), 'approved', true, NOW()),
('1232', '绠＄悊鍛?', encode(digest('1232', 'sha256'), 'hex'), 'approved', true, NOW()),
('1233', '绠＄悊鍛?', encode(digest('1233', 'sha256'), 'hex'), 'approved', true, NOW());

-- 4. 淇 approve_user_rpc锛坧_account -> p_target_account锛?DROP FUNCTION IF EXISTS approve_user_rpc(text,text,text);
CREATE OR REPLACE FUNCTION approve_user_rpc(p_admin_account text, p_target_account text, p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_admin users%ROWTYPE; v_target_nickname text;
BEGIN
  SELECT * INTO v_admin FROM users WHERE account = p_admin_account AND is_admin = true;
  IF NOT FOUND THEN RAISE EXCEPTION '鏃犵鐞嗗憳鏉冮檺'; END IF;
  IF p_action = 'approve' THEN UPDATE users SET status = 'approved' WHERE account = p_target_account;
  ELSIF p_action = 'reject' THEN UPDATE users SET status = 'rejected' WHERE account = p_target_account;
  ELSIF p_action = 'disable' THEN
    SELECT nickname INTO v_target_nickname FROM users WHERE account = p_target_account;
    DELETE FROM likes WHERE user_nickname = v_target_nickname;
    DELETE FROM comments WHERE account = p_target_account;
    DELETE FROM posts WHERE account = p_target_account;
    UPDATE users SET status = 'disabled' WHERE account = p_target_account;
  END IF;
END;
$$;

-- 5. 淇 clear_rejected
DROP FUNCTION IF EXISTS clear_rejected(text);
CREATE OR REPLACE FUNCTION clear_rejected(p_admin_account text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_admin users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM users WHERE account = p_admin_account AND is_admin = true;
  IF NOT FOUND THEN RAISE EXCEPTION '鏃犵鐞嗗憳鏉冮檺'; END IF;
  DELETE FROM users WHERE status = 'rejected';
END;
$$;

-- 6. 淇 toggle_like锛堜粠 account 鏌?nickname锛?DROP FUNCTION IF EXISTS toggle_like(bigint,text);
CREATE OR REPLACE FUNCTION toggle_like(p_post_id bigint, p_account text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_like likes%ROWTYPE; v_count integer; v_nickname text;
BEGIN
  SELECT nickname INTO v_nickname FROM users WHERE account = p_account;
  IF v_nickname IS NULL THEN RAISE EXCEPTION '鐢ㄦ埛涓嶅瓨鍦?; END IF;
  SELECT * INTO v_like FROM likes WHERE post_id = p_post_id AND user_nickname = v_nickname;
  IF FOUND THEN DELETE FROM likes WHERE id = v_like.id;
  ELSE INSERT INTO likes (post_id, user_nickname) VALUES (p_post_id, v_nickname); END IF;
  SELECT COUNT(*) INTO v_count FROM likes WHERE post_id = p_post_id;
  UPDATE posts SET like_count = v_count WHERE id = p_post_id;
  RETURN v_count;
END;
$$;

-- 7. 淇 add_comment锛堜粠 account 鏌?nickname锛?DROP FUNCTION IF EXISTS add_comment(bigint,text,text,bigint);
CREATE OR REPLACE FUNCTION add_comment(p_post_id bigint, p_account text, p_content text, p_parent_id bigint DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count integer; v_user users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM users WHERE account = p_account;
  IF NOT FOUND OR v_user.status != 'approved' THEN RAISE EXCEPTION '鐢ㄦ埛鏈€氳繃瀹℃牳'; END IF;
  INSERT INTO comments (post_id, nickname, content, parent_id) VALUES (p_post_id, v_user.nickname, p_content, p_parent_id);
  SELECT COUNT(*) INTO v_count FROM comments WHERE post_id = p_post_id;
  UPDATE posts SET comment_count = v_count WHERE id = p_post_id;
END;
$$;

-- 8. 淇 delete_post_rpc
DROP FUNCTION IF EXISTS delete_post_rpc(bigint,text);
CREATE OR REPLACE FUNCTION delete_post_rpc(p_post_id bigint, p_account text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_post posts%ROWTYPE; v_user users%ROWTYPE;
BEGIN
  SELECT * INTO v_post FROM posts WHERE id = p_post_id;
  IF NOT FOUND THEN RAISE EXCEPTION '甯栧瓙涓嶅瓨鍦?; END IF;
  SELECT * INTO v_user FROM users WHERE account = p_account;
  IF NOT FOUND THEN RAISE EXCEPTION '鐢ㄦ埛涓嶅瓨鍦?; END IF;
  IF v_post.nickname != v_user.nickname AND NOT v_user.is_admin THEN RAISE EXCEPTION '鏃犳潈鍒犻櫎'; END IF;
  DELETE FROM likes WHERE post_id = p_post_id;
  DELETE FROM comments WHERE post_id = p_post_id;
  DELETE FROM posts WHERE id = p_post_id;
END;
$$;

-- 9. 淇 delete_comment_rpc
DROP FUNCTION IF EXISTS delete_comment_rpc(bigint,text);
CREATE OR REPLACE FUNCTION delete_comment_rpc(p_comment_id bigint, p_account text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_comment comments%ROWTYPE; v_user users%ROWTYPE; v_count integer;
BEGIN
  SELECT * INTO v_comment FROM comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RAISE EXCEPTION '璇勮涓嶅瓨鍦?; END IF;
  SELECT * INTO v_user FROM users WHERE account = p_account;
  IF NOT FOUND THEN RAISE EXCEPTION '鐢ㄦ埛涓嶅瓨鍦?; END IF;
  IF v_comment.nickname != v_user.nickname AND NOT v_user.is_admin THEN RAISE EXCEPTION '鏃犳潈鍒犻櫎'; END IF;
  DELETE FROM comments WHERE id = p_comment_id;
  SELECT COUNT(*) INTO v_count FROM comments WHERE post_id = v_comment.post_id;
  UPDATE posts SET comment_count = v_count WHERE id = v_comment.post_id;
END;
$$;

-- 10. 閲嶆柊鎺堟潈
GRANT EXECUTE ON FUNCTION register_user TO anon;
GRANT EXECUTE ON FUNCTION approve_user_rpc TO anon;
GRANT EXECUTE ON FUNCTION clear_rejected TO anon;
GRANT EXECUTE ON FUNCTION toggle_like TO anon;
GRANT EXECUTE ON FUNCTION add_comment TO anon;
GRANT EXECUTE ON FUNCTION delete_post_rpc TO anon;
GRANT EXECUTE ON FUNCTION delete_comment_rpc TO anon;
-- 11. 允许 anon 查询 account 字段（前端需要用它过滤）
GRANT SELECT (account, nickname, status, is_admin, created_at) ON users TO anon;