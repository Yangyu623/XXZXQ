-- Fix: create_post_rpc now fetches nickname from users table (consistent with add_comment)
DROP FUNCTION IF EXISTS create_post_rpc(text,text,text,boolean,text);
CREATE OR REPLACE FUNCTION create_post_rpc(p_account text, p_nickname text, p_content text, p_is_anonymous boolean, p_images text)
RETURNS SETOF public.posts LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user public.users%ROWTYPE; v_post public.posts%ROWTYPE; v_nick text;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE account = p_account;
  IF NOT FOUND OR v_user.status != 'approved' THEN
    RAISE EXCEPTION '用户不存在';
  END IF;
  v_nick := v_user.nickname;
  INSERT INTO public.posts (nickname, content, images, is_anonymous, like_count, comment_count)
  VALUES (v_nick, p_content, p_images, COALESCE(p_is_anonymous, false), 0, 0) RETURNING * INTO v_post;
  RETURN NEXT v_post;
END;
$$;
GRANT EXECUTE ON FUNCTION create_post_rpc(text,text,text,boolean,text) TO anon;