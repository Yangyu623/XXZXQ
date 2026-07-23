# 🏫 校园墙 - H5 网页版

给高中同学用的校园匿名交流平台，浏览器打开即用，无需审核。

## 功能

- 🎭 昵称登录（无需注册，输入昵称即用）
- 📝 发帖（支持匿名）
- ❤️ 点赞
- 💬 评论（所有人可见）
- 📱 移动端优先，仿原生 App 体验
- ⚡ 3 分钟部署到线上

## 技术栈

- 纯 HTML + CSS + JS（零框架依赖）
- [Supabase](https://supabase.com) 后端（免费 PostgreSQL 数据库 + REST API）
- 可部署到 GitHub Pages / Vercel / 任意静态托管

## 快速部署（3 步）

### 第 1 步：创建 Supabase 项目

1. 打开 [supabase.com](https://supabase.com)，用 GitHub 账号注册登录
2. 点击 **New project**，填写项目名（如 `campus-wall`），设置数据库密码
3. 等待项目初始化完成（约 1 分钟）

### 第 2 步：创建数据库表

进入 Supabase 项目的 **SQL Editor**，粘贴执行以下 SQL：

```sql
-- 帖子表
CREATE TABLE posts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nickname TEXT NOT NULL,
  content TEXT NOT NULL,
  is_anonymous BOOLEAN DEFAULT FALSE,
  like_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 评论表
CREATE TABLE comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id BIGINT REFERENCES posts(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 点赞表
CREATE TABLE likes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id BIGINT REFERENCES posts(id) ON DELETE CASCADE,
  user_nickname TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_nickname)
);

-- 点赞 +1 函数
CREATE FUNCTION increment_like(post_id BIGINT) RETURNS VOID AS $$
  UPDATE posts SET like_count = like_count + 1 WHERE id = post_id;
$$ LANGUAGE SQL;

-- 点赞 -1 函数
CREATE FUNCTION decrement_like(post_id BIGINT) RETURNS VOID AS $$
  UPDATE posts SET like_count = like_count - 1 WHERE id = post_id;
$$ LANGUAGE SQL;

-- 评论 +1 函数
CREATE FUNCTION increment_comment(post_id BIGINT) RETURNS VOID AS $$
  UPDATE posts SET comment_count = comment_count + 1 WHERE id = post_id;
$$ LANGUAGE SQL;

-- 允许公开访问
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "允许所有人读帖子" ON posts FOR SELECT USING (true);
CREATE POLICY "允许所有人发帖" ON posts FOR INSERT WITH CHECK (true);
CREATE POLICY "允许发帖人删帖" ON posts FOR DELETE USING (nickname = current_setting('request.jwt.claims', true)::json->>'nickname');

CREATE POLICY "允许所有人读评论" ON comments FOR SELECT USING (true);
CREATE POLICY "允许所有人发评论" ON comments FOR INSERT WITH CHECK (true);

CREATE POLICY "允许所有人读点赞" ON likes FOR SELECT USING (true);
CREATE POLICY "允许所有人点赞" ON likes FOR INSERT WITH CHECK (true);
CREATE POLICY "允许取消点赞" ON likes FOR DELETE USING (user_nickname = current_setting('request.jwt.claims', true)::json->>'nickname');
```

### 第 3 步：配置前端

1. 在 Supabase 项目设置 → **API** 中找到：
   - `Project URL` → 替换 `js/config.js` 中的 `SUPABASE_URL`
   - `anon public key` → 替换 `js/config.js` 中的 `SUPABASE_ANON_KEY`

2. 把整个文件夹部署到任意静态托管：

| 平台 | 操作 |
|---|---|
| **GitHub Pages** | 上传到仓库，Settings → Pages → 选择分支即可 |
| **Vercel** | `vercel` 一键部署 |
| **Netlify** | 拖拽文件夹到 [app.netlify.com](https://app.netlify.com) |

## 本地运行

```bash
# 任意 HTTP 服务器即可
npx serve .
# 或
python -m http.server 8000
```

浏览器打开 `http://localhost:8000` 即可。

## 项目结构

```
├── index.html      # 主页面
├── css/
│   └── style.css   # 样式
├── js/
│   ├── config.js   # Supabase 配置
│   └── app.js      # 核心逻辑
└── README.md
```