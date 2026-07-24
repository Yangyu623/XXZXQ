-- ============================================
-- RLS 安全加固 v2 - 彻底修复
-- 先执行这段 DROP 清理旧策略，再执行下面的 CREATE
-- ============================================

-- ===== 清理旧策略 =====
DROP POLICY IF EXISTS "anon_can_read_users_public" ON users;

-- ===== users 表：只读公开字段，禁止读 password_hash =====
-- 方案：通过 revoke 列权限 + 新策略共同限制
REVOKE ALL ON users FROM anon;
GRANT SELECT (nickname, status, is_admin, created_at) ON users TO anon;

-- 管理员需要能 update users（审核/禁用）
-- 用 RPC 代替直接 update，保证权限安全

-- ===== posts 表：只允许读，禁止匿名写/删 =====
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_posts" ON posts;
DROP POLICY IF EXISTS "anon_insert_posts" ON posts;
DROP POLICY IF EXISTS "anon_delete_posts" ON posts;

-- 允许所有人读帖子
CREATE POLICY "anon_read_posts" ON posts FOR SELECT TO anon USING (true);

-- 禁止匿名 insert/update/delete（之后用 RPC 代替）
-- 默认没有权限即拒绝

-- ===== comments 表：只允许读 =====
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_comments" ON comments;
CREATE POLICY "anon_read_comments" ON comments FOR SELECT TO anon USING (true);

-- ===== likes 表：只允许读 =====
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_likes" ON likes;
CREATE POLICY "anon_read_likes" ON likes FOR SELECT TO anon USING (true);

-- ===== 所有写操作都通过 RPC =====

-- 1. 创建帖子
CREATE OR REPLACE FUNCTION create_post(
  p_nickname text, p_content text, p_images text,
  p_is_anonymous boolean
)
RETURNS SETOF posts
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_post posts%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM users WHERE nickname = p_nickname;
  IF NOT FOUND OR v_user.status != 'approved' THEN
    RAISE EXCEPTION '用户未通过审核';
  END IF;
  
  IF (SELECT COUNT(*) FROM posts WHERE nickname = p_nickname AND created_at > NOW() - INTERVAL '1 hour') >= 20 THEN
    RAISE EXCEPTION '发帖过于频繁';
  END IF;

  INSERT INTO posts (nickname, content, images, is_anonymous, like_count, comment_count)
  VALUES (p_nickname, p_content, p_images, COALESCE(p_is_anonymous, false), 0, 0)
  RETURNING * INTO v_post;
  
  RETURN NEXT v_post;
END;
$$;

-- 2. 删除帖子（作者或管理员）
CREATE OR REPLACE FUNCTION delete_post_rpc(p_post_id bigint, p_nickname text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_post posts%ROWTYPE;
  v_user users%ROWTYPE;
BEGIN
  SELECT * INTO v_post FROM posts WHERE id = p_post_id;
  IF NOT FOUND THEN RAISE EXCEPTION '帖子不存在'; END IF;
  
  SELECT * INTO v_user FROM users WHERE nickname = p_nickname;
  IF NOT FOUND THEN RAISE EXCEPTION '用户不存在'; END IF;
  
  -- 作者本人 或 管理员 可删除
  IF v_post.nickname != p_nickname AND NOT v_user.is_admin THEN
    RAISE EXCEPTION '无权删除';
  END IF;
  
  DELETE FROM likes WHERE post_id = p_post_id;
  DELETE FROM comments WHERE post_id = p_post_id;
  DELETE FROM posts WHERE id = p_post_id;
END;
$$;

-- 3. 点赞/取消点赞
CREATE OR REPLACE FUNCTION toggle_like(p_post_id bigint, p_nickname text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_like likes%ROWTYPE;
  v_count integer;
BEGIN
  SELECT * INTO v_like FROM likes WHERE post_id = p_post_id AND user_nickname = p_nickname;
  IF FOUND THEN
    DELETE FROM likes WHERE id = v_like.id;
  ELSE
    INSERT INTO likes (post_id, user_nickname) VALUES (p_post_id, p_nickname);
  END IF;
  
  SELECT COUNT(*) INTO v_count FROM likes WHERE post_id = p_post_id;
  UPDATE posts SET like_count = v_count WHERE id = p_post_id;
  RETURN v_count;
END;
$$;

-- 4. 发评论
CREATE OR REPLACE FUNCTION add_comment(
  p_post_id bigint, p_nickname text, p_content text, p_parent_id bigint DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
  v_user users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM users WHERE nickname = p_nickname;
  IF NOT FOUND OR v_user.status != 'approved' THEN
    RAISE EXCEPTION '用户未通过审核';
  END IF;
  
  INSERT INTO comments (post_id, nickname, content, parent_id)
  VALUES (p_post_id, p_nickname, p_content, p_parent_id);
  
  SELECT COUNT(*) INTO v_count FROM comments WHERE post_id = p_post_id;
  UPDATE posts SET comment_count = v_count WHERE id = p_post_id;
END;
$$;

-- 5. 删除评论（作者或管理员）
CREATE OR REPLACE FUNCTION delete_comment_rpc(p_comment_id bigint, p_nickname text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_comment comments%ROWTYPE;
  v_user users%ROWTYPE;
  v_count integer;
BEGIN
  SELECT * INTO v_comment FROM comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RAISE EXCEPTION '评论不存在'; END IF;
  
  SELECT * INTO v_user FROM users WHERE nickname = p_nickname;
  IF NOT FOUND THEN RAISE EXCEPTION '用户不存在'; END IF;
  
  IF v_comment.nickname != p_nickname AND NOT v_user.is_admin THEN
    RAISE EXCEPTION '无权删除';
  END IF;
  
  DELETE FROM comments WHERE id = p_comment_id;
  
  SELECT COUNT(*) INTO v_count FROM comments WHERE post_id = v_comment.post_id;
  UPDATE posts SET comment_count = v_count WHERE id = v_comment.post_id;
END;
$$;

-- 6. 审核用户（管理员专用）
CREATE OR REPLACE FUNCTION approve_user_rpc(p_admin text, p_nickname text, p_action text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_admin users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM users WHERE nickname = p_admin;
  IF NOT FOUND OR NOT v_admin.is_admin THEN
    RAISE EXCEPTION '无管理员权限';
  END IF;
  
  IF p_action = 'approve' THEN
    UPDATE users SET status = 'approved' WHERE nickname = p_nickname;
  ELSIF p_action = 'reject' THEN
    UPDATE users SET status = 'rejected' WHERE nickname = p_nickname;
  ELSIF p_action = 'disable' THEN
    DELETE FROM likes WHERE user_nickname = p_nickname;
    DELETE FROM comments WHERE nickname = p_nickname;
    DELETE FROM posts WHERE nickname = p_nickname;
    UPDATE users SET status = 'disabled' WHERE nickname = p_nickname;
  END IF;
END;
$$;

-- 7. 注册用户
CREATE OR REPLACE FUNCTION register_user(
  p_nickname text, p_password_hash text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '1 hour') >= 30 THEN
    RAISE EXCEPTION '注册过于频繁';
  END IF;
  INSERT INTO users (nickname, password_hash) VALUES (p_nickname, p_password_hash);
END;
$$;

-- 8. 清空已拒绝用户（管理员专用）
CREATE OR REPLACE FUNCTION clear_rejected(p_admin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_admin users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM users WHERE nickname = p_admin;
  IF NOT FOUND OR NOT v_admin.is_admin THEN
    RAISE EXCEPTION '无管理员权限';
  END IF;
  DELETE FROM users WHERE status = 'rejected';
END;
$$;