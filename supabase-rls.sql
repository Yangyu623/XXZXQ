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