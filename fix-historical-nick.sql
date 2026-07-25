-- Fix historical nickname for account xx1602 -> xxxly
UPDATE public.posts SET nickname = 'xxxly' WHERE nickname = 'xx1602';
UPDATE public.likes SET user_nickname = 'xxxly' WHERE user_nickname = 'xx1602';
UPDATE public.comments SET nickname = 'xxxly' WHERE nickname = 'xx1602';
UPDATE public.comments SET reply_to_nickname = 'xxxly' WHERE reply_to_nickname = 'xx1602';
