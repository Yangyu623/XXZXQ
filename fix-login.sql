-- 修复 check_login：明确指定 public.users 表
CREATE OR REPLACE FUNCTION check_login(p_account text, p_password text)
RETURNS TABLE(success boolean, is_admin boolean, status text, error_msg text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE user_row public.users%ROWTYPE;
BEGIN
  SELECT * INTO user_row FROM public.users WHERE account = p_account;
  IF NOT FOUND THEN RETURN QUERY SELECT false, false, '', 'User not found'; RETURN; END IF;
  IF user_row.status = 'pending' THEN RETURN QUERY SELECT false, false, user_row.status, 'account pending'; RETURN; END IF;
  IF user_row.status = 'rejected' THEN RETURN QUERY SELECT false, false, user_row.status, 'account rejected'; RETURN; END IF;
  IF user_row.status = 'disabled' THEN RETURN QUERY SELECT false, false, user_row.status, 'account disabled'; RETURN; END IF;
  IF position(':' in user_row.password_hash) > 0 THEN
    IF user_row.password_hash = split_part(user_row.password_hash, ':', 1) || ':' || encode(digest(split_part(user_row.password_hash, ':', 1) || p_password, 'sha256'), 'hex') THEN
      RETURN QUERY SELECT true, user_row.is_admin, user_row.status, '';
    ELSE RETURN QUERY SELECT false, false, user_row.status, 'wrong password'; END IF;
  ELSE
    IF user_row.password_hash = encode(digest(p_password, 'sha256'), 'hex') THEN
      RETURN QUERY SELECT true, user_row.is_admin, user_row.status, '';
    ELSE RETURN QUERY SELECT false, false, user_row.status, 'wrong password'; END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION check_login TO anon;