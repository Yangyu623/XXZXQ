// js/config.js — Supabase 配置

const SUPABASE_URL = 'https://bavpuxqrifyiucpxoazp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5Ih00Go-bkwKmw7avKAHIA_aojZTRal';

// 初始化 Supabase 客户端
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);