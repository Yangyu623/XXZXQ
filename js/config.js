// js/config.js 鈥?Supabase REST API 灏佽 + 鍥剧墖涓婁紶

const SUPABASE_URL = 'https://bavpuxqrifyiucpxoazp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5Ih00Go-bkwKmw7avKAHIA_aojZTRal';
const REST_URL = SUPABASE_URL + '/rest/v1';
const STORAGE_URL = SUPABASE_URL + '/storage/v1/object/post-images/';

async function api(method, path, body) {
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Prefer': 'return=representation'
  };
  if (body) { headers['Content-Type'] = 'application/json'; }
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

// 鍥剧墖涓婁紶
async function uploadImage(file) {
  const fileName = Date.now() + '-' + Math.random().toString(36).slice(2) + '.jpg';
  const formData = new FormData();
  formData.append('file', file, fileName);
  const headers = new Headers();
  headers.append('Authorization', 'Bearer ' + SUPABASE_KEY);
  headers.append('apikey', SUPABASE_KEY);
  const res = await fetch(STORAGE_URL + fileName, {
    method: 'POST',
    headers: headers,
    body: formData
  });
  if (!res.ok) { const errText = await res.text(); throw new Error('涓婁紶澶辫触: ' + (errText || res.statusText)); }
  const data = await res.json();
  return SUPABASE_URL + '/storage/v1/object/public/post-images/' + fileName;
}


// ?????
async function checkBannedWords(text) {
  try {
    const { data } = await db.from('banned_words').select('word').get();
    if (!data || !data.length) return [];
    const hits = [];
    for (const row of data) {
      if (text.toLowerCase().includes(row.word.toLowerCase())) {
        hits.push(row.word);
      }
    }
    return hits;
  } catch (e) { return []; }
}

const db = {
  from: (table) => ({
    select: (columns) => ({
      order: (col, opts) => ({
        async get() {
          const q = '?select=' + (columns || '*');
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
        order: (ocol) => ({
          async get() {
            const q = '?select=' + (columns || '*') + '&' + col + '=eq.' + encodeURIComponent(val);
            const ord = '&order=' + ocol + '.asc';
            return { data: await api('GET', '/' + table + q + ord), error: null };
          }
        }),
        async get() {
          const q = '?select=' + (columns || '*') + '&' + col + '=eq.' + encodeURIComponent(val);
          return { data: await api('GET', '/' + table + q), error: null };
        }
      }),
      in: (col, vals) => ({
        order: (ocol, opts) => ({
          async get() {
            const q = '?select=' + (columns || '*') + '&' + col + '=in.(' + vals.join(',') + ')';
            const ord = '&order=' + ocol + '.' + (opts?.ascending === false ? 'desc' : 'asc');
            return { data: await api('GET', '/' + table + q + ord), error: null };
          }
        }),
        async get() {
          const q = '?select=' + (columns || '*') + '&' + col + '=in.(' + vals.join(',') + ')';
          return { data: await api('GET', '/' + table + q), error: null };
        }
      }),
      async get() {
        const q = '?select=' + (columns || '*');
        return { data: await api('GET', '/' + table + q), error: null };
      },
      range: (from, to) => ({
        order: (col, opts) => ({
          async get() {
            const q = '?select=' + (columns || '*') + '&order=' + col + '.' + (opts?.ascending === false ? 'desc' : 'asc');
            const r = '&limit=' + (to - from + 1) + '&offset=' + from;
            return { data: await api('GET', '/' + table + q + r), error: null };
          }
        }),
        async get() {
          const q = '?select=' + (columns || '*') + '&limit=' + (to - from + 1) + '&offset=' + from;
          return { data: await api('GET', '/' + table + q), error: null };
        }
      })
    }),
    insert: async (data) => {
      const result = await api('POST', '/' + table, data);
      return { data: result, error: null };
    },
    update: (data) => ({
      eq: async (col, val) => {
        const result = await api('PATCH', '/' + table + '?' + col + '=eq.' + encodeURIComponent(val), data);
        return { data: result, error: null };
      },
      in: async (col, vals) => {
        const q = '?' + col + '=in.(' + vals.join(',') + ')';
        await api('PATCH', '/' + table + q, data);
        return { error: null };
      }
    }),
    delete: () => ({
      eq: (col, val) => ({
        eq: (col2, val2) => ({
          async exec() {
            const q = '?' + col + '=eq.' + encodeURIComponent(val) + '&' + col2 + '=eq.' + encodeURIComponent(val2);
            await api('DELETE', '/' + table + q);
            return { error: null };
          }
        }),
        async exec() {
          const q = '?' + col + '=eq.' + encodeURIComponent(val);
          await api('DELETE', '/' + table + q);
          return { error: null };
        }
      }),
      in: (col, vals) => ({
        async exec() {
          const q = '?' + col + '=in.(' + vals.map(encodeURIComponent).join(',') + ')';
          await api('DELETE', '/' + table + q);
          return { error: null };
        }
      })
    })
  }),
  rpc: async (fn, params) => { const result = await api('POST', '/rpc/' + fn, params); return { data: result, error: null };
  }
};
