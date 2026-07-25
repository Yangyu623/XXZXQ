-- ??????? RPC??? RLS?
DROP FUNCTION IF EXISTS get_users_for_admin(text,text);
CREATE OR REPLACE FUNCTION get_users_for_admin(p_admin_account text, p_status text)
RETURNS TABLE(account text, nickname text, status text, is_admin boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_account text;
  v_nickname text;
  v_status text;
  v_is_admin boolean;
  v_created_at timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE account = p_admin_account AND is_admin = true) THEN
    RAISE EXCEPTION 'not admin';
  END IF;
  FOR v_account, v_nickname, v_status, v_is_admin, v_created_at IN
    SELECT u.account, u.nickname, u.status, u.is_admin, u.created_at
    FROM users u WHERE u.status = p_status ORDER BY u.created_at ASC
  LOOP
    account := v_account;
    nickname := v_nickname;
    status := v_status;
    is_admin := v_is_admin;
    created_at := v_created_at;
    RETURN NEXT;
  END LOOP;
END;
$$;