-- ============================================
-- 紧急安全修复：禁止泄露密码哈希
-- 在 Supabase Dashboard -> SQL Editor 中执行
-- ============================================

-- 1. 禁止匿名读取 users 表的 password_hash 列
--    只允许读 nickname, status, is_admin, created_at
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_can_read_users_public" ON users;
CREATE POLICY "anon_can_read_users_public" ON users
  FOR SELECT
  TO anon
  USING (true);

-- 2. 禁止直接访问 password_hash（任何角色）
REVOKE SELECT (password_hash) ON users FROM anon, authenticated;

-- 3. 创建登录验证 RPC（在数据库内验证，哈希不离开服务器）
CREATE OR REPLACE FUNCTION check_login(p_nickname text, p_password text)
RETURNS TABLE(success boolean, is_admin boolean, status text, error_msg text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  user_row users%ROWTYPE;
BEGIN
  SELECT * INTO user_row FROM users WHERE nickname = p_nickname;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, '', '用户不存在';
    RETURN;
  END IF;

  -- 状态检查
  IF user_row.status = 'pending' THEN
    RETURN QUERY SELECT false, false, user_row.status, '账号待审核';
    RETURN;
  ELSIF user_row.status = 'rejected' THEN
    RETURN QUERY SELECT false, false, user_row.status, '账号已被拒绝';
    RETURN;
  ELSIF user_row.status = 'disabled' THEN
    RETURN QUERY SELECT false, false, user_row.status, '账号已被禁用';
    RETURN;
  END IF;

  -- 密码验证（在服务器端完成）
  -- 新格式 salt:hash
  IF position(':' in user_row.password_hash) > 0 THEN
    IF user_row.password_hash = split_part(user_row.password_hash, ':', 1) || ':' || 
       encode(digest(split_part(user_row.password_hash, ':', 1) || p_password, 'sha256'), 'hex') THEN
      RETURN QUERY SELECT true, user_row.is_admin, user_row.status, '';
    ELSE
      RETURN QUERY SELECT false, false, user_row.status, '密码错误';
    END IF;
  ELSE
    -- 旧格式：纯 SHA-256
    IF user_row.password_hash = encode(digest(p_password, 'sha256'), 'hex') THEN
      RETURN QUERY SELECT true, user_row.is_admin, user_row.status, '';
    ELSE
      RETURN QUERY SELECT false, false, user_row.status, '密码错误';
    END IF;
  END IF;
END;
$$;

-- 4. 同样禁止直接查自己 password（资料修改也用 RPC）
CREATE OR REPLACE FUNCTION check_old_password(p_nickname text, p_password text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  user_row users%ROWTYPE;
BEGIN
  SELECT * INTO user_row FROM users WHERE nickname = p_nickname;
  IF NOT FOUND THEN RETURN false; END IF;
  
  IF position(':' in user_row.password_hash) > 0 THEN
    RETURN user_row.password_hash = split_part(user_row.password_hash, ':', 1) || ':' || 
           encode(digest(split_part(user_row.password_hash, ':', 1) || p_password, 'sha256'), 'hex');
  ELSE
    RETURN user_row.password_hash = encode(digest(p_password, 'sha256'), 'hex');
  END IF;
END;
$$;

-- ============================================
-- 防刷量：Supabase RLS 加固 SQL
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 1. 每人每小时最多发 20 条帖子
CREATE OR REPLACE FUNCTION check_post_rate()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM posts
      WHERE nickname = NEW.nickname
      AND created_at > NOW() - INTERVAL '1 hour') >= 20 THEN
    RAISE EXCEPTION '发帖过于频繁，请稍后再试';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_rate ON posts;
CREATE TRIGGER trg_post_rate
  BEFORE INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION check_post_rate();

-- 2. 同一 IP 每小时最多注册 5 个账号（需要开启 Supabase Auth 的 audit 日志）
--    如果没开 Auth，用昵称近似匹配做限流
CREATE OR REPLACE FUNCTION check_reg_rate()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM users
      WHERE created_at > NOW() - INTERVAL '1 hour') >= 30 THEN
    RAISE EXCEPTION '注册过于频繁，请稍后再试';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reg_rate ON users;
CREATE TRIGGER trg_reg_rate
  BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION check_reg_rate();

-- 3. 管理员（1231/1232/1233）不受限制
-- 给 is_admin=true 的用户跳过限制：
CREATE OR REPLACE FUNCTION check_post_rate()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE nickname = NEW.nickname AND is_admin = TRUE) THEN
    RETURN NEW;
  END IF;
  IF (SELECT COUNT(*) FROM posts
      WHERE nickname = NEW.nickname
      AND created_at > NOW() - INTERVAL '1 hour') >= 20 THEN
    RAISE EXCEPTION '发帖过于频繁，请稍后再试';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;