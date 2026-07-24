-- 诊断 SQL - 逐一排查问题
-- 1. 检查 account 列是否存在
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'account';

-- 2. 检查有多少用户
SELECT account, nickname, status, is_admin FROM users;

-- 3. 检查 check_login 函数是否存在
SELECT proname FROM pg_proc WHERE proname = 'check_login';