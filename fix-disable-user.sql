-- Fix approve_user_rpc: use nickname instead of non-existent account column
DROP FUNCTION IF EXISTS approve_user_rpc(text,text,text);
CREATE OR REPLACE FUNCTION approve_user_rpc(p_admin_account text, p_target_account text, p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_admin public.users%ROWTYPE; v_target_nickname text;
BEGIN
  SELECT * INTO v_admin FROM public.users WHERE account = p_admin_account AND is_admin = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'not admin'; END IF;
  IF p_action = 'approve' THEN
    UPDATE public.users SET status = 'approved' WHERE account = p_target_account;
  ELSIF p_action = 'reject' THEN
    UPDATE public.users SET status = 'rejected' WHERE account = p_target_account;
  ELSIF p_action = 'disable' THEN
    SELECT nickname INTO v_target_nickname FROM public.users WHERE account = p_target_account;
    DELETE FROM public.likes WHERE user_nickname = v_target_nickname;
    DELETE FROM public.comments WHERE nickname = v_target_nickname;
    DELETE FROM public.posts WHERE nickname = v_target_nickname;
    UPDATE public.users SET status = 'disabled' WHERE account = p_target_account;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION approve_user_rpc(text,text,text) TO anon;