DROP FUNCTION IF EXISTS register_user(text,text,text);
CREATE OR REPLACE FUNCTION register_user(p_account text, p_nickname text, p_password_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM users WHERE account = p_account;
  IF v_status = 'approved' THEN
    RAISE EXCEPTION '该账号已被注册';
  END IF;
  IF v_status = 'pending' THEN
    RAISE EXCEPTION '该账号正在审核中';
  END IF;
  DELETE FROM users WHERE account = p_account;
  INSERT INTO users (account, nickname, password_hash, status, is_admin)
  VALUES (p_account, p_nickname, p_password_hash, 'pending', false);
END;
$$;