// js/config.js — Supabase REST API 封装（零依赖）

const SUPABASE_URL = 'https://bavpuxqrifyiucpxoazp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5Ih00Go-bkwKmw7avKAHIA_aojZTRal';
const REST_URL = SUPABASE_URL + '/rest/v1';

// 通用请求封装
async function api(method, path, body) {
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(REST_URL + path, opts);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// 暴露简洁 API
const db = {
  from: (table) => ({
    select: (columns) => ({
      order: (col, opts) => ({
        async get() {
          const q = columns ? '?select=' + columns : '?select=*';
          const ord = '&order=' + col + '.' + (opts?.ascending === false ? 'desc' : 'asc');
          return { data: await api('GET', '/' + table + q + ord), error: null };
        },
        limit(n) {
          return {
            async get() {
              const q = '?select=' + (columns || '*') + '&limit=' + n;
              const ord = '&order=' + col + '.' + (opts?.ascending === false ? 'desc' : 'asc');
              return { data: await api('GET', '/' + table + q + ord), error: null };
            }
          };
        }
      }),
      eq: (col, val) => ({
        async get() {
          const q = '?select=' + (columns || '*') + '&' + col + '=eq.' + encodeURIComponent(val);
          return { data: await api('GET', '/' + table + q), error: null };
        }
      }),
      async get() {
        const q = columns ? '?select=' + columns : '?select=*';
        return { data: await api('GET', '/' + table + q), error: null };
      }
    }),
    insert: async (data) => {
      const result = await api('POST', '/' + table, data);
      return { data: result, error: null };
    },
    delete: () => ({
      eq: (col, val) => ({
        eq: (col2, val2) => ({
          async exec() {
            const q = '?' + col + '=eq.' + encodeURIComponent(val) + '&' + col2 + '=eq.' + encodeURIComponent(val2);
            await api('DELETE', '/' + table + q);
            return { error: null };
          }
        })
      })
    })
  }),
  rpc: async (fn, params) => {
    const qs = Object.entries(params).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
    await api('POST', '/rpc/' + fn + '?' + qs);
    return { error: null };
  }
};