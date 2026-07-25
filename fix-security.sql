-- ??????? RPC??? RLS?
DROP FUNCTION IF EXISTS get_users_for_admin(text,text);
CREATE OR REPLACE FUNCTION get_users_for_admin(p_admin_account text, p_status text)
RETURNS TABLE(account text, nickname text, status text, is_admin boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE account = p_admin_account AND is_admin = true) THEN
    RAISE EXCEPTION 'not admin';
  END IF;
  RETURN QUERY SELECT u.account, u.nickname, u.status, u.is_admin, u.created_at
  FROM users u
  WHERE u.status = p_status
  ORDER BY u.created_at ASC;
END;
$$;

SELECT 'Admin user query RPC created' AS result;
