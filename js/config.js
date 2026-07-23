// js/config.js — Supabase 配置
// 请在 Supabase 控制台 (https://supabase.com) 创建项目后替换以下值

const SUPABASE_URL = 'https://你的项目ID.supabase.co';
const SUPABASE_ANON_KEY = '你的anon_key';

// 初始化 Supabase 客户端
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);