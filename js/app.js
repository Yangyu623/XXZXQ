// js/app.js — 校园墙主逻辑

// ========== DOM 引用 ==========
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const loginModal = $('#loginModal');
const nicknameInput = $('#nicknameInput');
const loginBtn = $('#loginBtn');
const headerUser = $('#headerUser');
const postList = $('#postList');
const fabNew = $('#fabNew');
const postModal = $('#postModal');
const postContent = $('#postContent');
const charCount = $('#charCount');
const anonCheck = $('#anonCheck');
const submitPost = $('#submitPost');
const commentModal = $('#commentModal');
const commentListEl = $('#commentList');
const commentInput = $('#commentInput');
const sendCommentBtn = $('#sendComment');
const toastEl = $('#toast');

// ========== 状态 ==========
let currentUser = null;
let currentPostId = null;

// ========== 工具函数 ==========
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 1800);
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function getAvatarEmoji(name) {
  const emojis = ['😊','🌟','🎈','🌸','🍀','🐣','🦊','🐱','🐶','🐼','🐨','🐯','🦁','🐸','🐵','🐮','🐷','🐭','🐹','🐰'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return emojis[Math.abs(hash) % emojis.length];
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ========== Supabase 检查 ==========
function checkSupabase() {
  if (typeof supabase === 'undefined' || !supabase) {
    postList.innerHTML = '<div class="tip">⚠️ 网络连接失败，请检查网络后刷新页面</div>';
    return false;
  }
  return true;
}

// ========== 登录 ==========
function checkLogin() {
  const saved = localStorage.getItem('campus_wall_nickname');
  if (saved) {
    currentUser = saved;
    loginModal.classList.remove('active');
    headerUser.textContent = '👤 ' + currentUser;
    if (checkSupabase()) loadPosts();
  } else {
    loginModal.classList.add('active');
  }
}

loginBtn.addEventListener('click', () => {
  const name = nicknameInput.value.trim();
  if (!name) return showToast('请输入昵称');
  if (name.length > 12) return showToast('昵称最多12个字');
  currentUser = name;
  localStorage.setItem('campus_wall_nickname', name);
  loginModal.classList.remove('active');
  headerUser.textContent = '👤 ' + currentUser;
  if (checkSupabase()) loadPosts();
});

nicknameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});

headerUser.addEventListener('click', () => {
  if (!currentUser) return;
  if (confirm('确定要退出登录吗？')) {
    localStorage.removeItem('campus_wall_nickname');
    currentUser = null;
    headerUser.textContent = '';
    postList.innerHTML = '<div class="tip">请先登录</div>';
    loginModal.classList.add('active');
  }
});

// ========== 帖子列表 ==========
async function loadPosts() {
  if (!checkSupabase()) return;
  postList.innerHTML = '<div class="tip">加载中...</div>';

  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      postList.innerHTML = '<div class="tip">加载失败：' + escapeHtml(error.message) + '</div>';
      console.error(error);
      return;
    }

    if (!data || data.length === 0) {
      postList.innerHTML = '<div class="tip">还没有帖子，快来发第一条吧~</div>';
      return;
    }

    const { data: likes } = await supabase
      .from('likes')
      .select('post_id')
      .eq('user_nickname', currentUser);

    const likedSet = new Set((likes || []).map(l => l.post_id));

    postList.innerHTML = data.map((p, i) => `
      <div class="post-card" style="animation-delay:${i * 0.03}s">
        <div class="post-header">
          <div class="post-avatar">${getAvatarEmoji(p.nickname)}</div>
          <span class="post-nickname">${p.is_anonymous ? '匿名用户' : escapeHtml(p.nickname)}</span>
          <span class="post-time">${formatTime(p.created_at)}</span>
        </div>
        <div class="post-body">${escapeHtml(p.content)}</div>
        <div class="post-actions">
          <div class="act ${likedSet.has(p.id) ? 'liked' : ''}" data-action="like" data-id="${p.id}">
            <span class="act-icon">${likedSet.has(p.id) ? '❤️' : '🤍'}</span>
            <span class="like-count">${p.like_count || 0}</span>
          </div>
          <div class="act" data-action="comment" data-id="${p.id}">
            <span class="act-icon">💬</span>
            <span>${p.comment_count || 0}</span>
          </div>
        </div>
      </div>
    `).join('');

    postList.querySelectorAll('[data-action="like"]').forEach(el => {
      el.addEventListener('click', () => toggleLike(el));
    });
    postList.querySelectorAll('[data-action="comment"]').forEach(el => {
      el.addEventListener('click', () => openComments(el.dataset.id));
    });
  } catch (err) {
    postList.innerHTML = '<div class="tip">⚠️ 网络异常，请刷新重试</div>';
    console.error(err);
  }
}

// ========== 点赞 ==========
async function toggleLike(el) {
  if (!checkSupabase()) return;
  const postId = el.dataset.id;
  const isLiked = el.classList.contains('liked');
  const countEl = el.querySelector('.like-count');

  if (isLiked) {
    el.classList.remove('liked');
    el.querySelector('.act-icon').textContent = '🤍';
    countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
  } else {
    el.classList.add('liked');
    el.querySelector('.act-icon').textContent = '❤️';
    countEl.textContent = parseInt(countEl.textContent) + 1;
  }

  try {
    if (isLiked) {
      await supabase.from('likes').delete().eq('post_id', postId).eq('user_nickname', currentUser);
      await supabase.rpc('decrement_like', { post_id: postId });
    } else {
      await supabase.from('likes').insert({ post_id: postId, user_nickname: currentUser });
      await supabase.rpc('increment_like', { post_id: postId });
    }
  } catch (err) {
    console.error(err);
    // 回滚
    if (isLiked) {
      el.classList.add('liked');
      el.querySelector('.act-icon').textContent = '❤️';
      countEl.textContent = parseInt(countEl.textContent) + 1;
    } else {
      el.classList.remove('liked');
      el.querySelector('.act-icon').textContent = '🤍';
      countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
    }
  }
}

// ========== 发帖 ==========
fabNew.addEventListener('click', () => {
  if (!currentUser) return showToast('请先登录');
  postContent.value = '';
  charCount.textContent = '0';
  anonCheck.checked = false;
  postModal.classList.add('active');
});

postContent.addEventListener('input', () => {
  charCount.textContent = postContent.value.length;
});

submitPost.addEventListener('click', async () => {
  if (!checkSupabase()) {
    showToast('网络异常，请刷新重试');
    return;
  }
  const content = postContent.value.trim();
  if (!content) return showToast('请输入内容');

  submitPost.disabled = true;
  submitPost.textContent = '发布中...';

  try {
    const { error } = await supabase.from('posts').insert({
      nickname: currentUser,
      content,
      is_anonymous: anonCheck.checked,
      like_count: 0,
      comment_count: 0
    });

    if (error) {
      console.error('发帖失败', error);
      showToast('发布失败：' + error.message);
    } else {
      showToast('发布成功！');
      postModal.classList.remove('active');
      loadPosts();
    }
  } catch (err) {
    console.error('发帖异常', err);
    showToast('网络异常，请稍后重试');
  } finally {
    submitPost.disabled = false;
    submitPost.textContent = '发布';
  }
});

// ========== 评论 ==========
async function openComments(postId) {
  currentPostId = postId;
  commentInput.value = '';
  commentListEl.innerHTML = '<div class="tip">加载评论...</div>';
  commentModal.classList.add('active');
  await loadComments(postId);
}

async function loadComments(postId) {
  if (!checkSupabase()) return;
  try {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) { console.error(error); return; }

    if (!data || data.length === 0) {
      commentListEl.innerHTML = '<div class="tip" style="padding:30px">暂无评论，快来抢沙发~</div>';
      return;
    }

    commentListEl.innerHTML = data.map(c => `
      <div class="comment-item">
        <div class="comment-avatar">${getAvatarEmoji(c.nickname)}</div>
        <div class="comment-body">
          <div class="comment-nickname">${escapeHtml(c.nickname)}</div>
          <div class="comment-text">${escapeHtml(c.content)}</div>
          <div class="comment-time">${formatTime(c.created_at)}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
    commentListEl.innerHTML = '<div class="tip">加载失败，请重试</div>';
  }
}

sendCommentBtn.addEventListener('click', async () => {
  const text = commentInput.value.trim();
  if (!text) return showToast('请输入评论');
  if (!checkSupabase()) { showToast('网络异常'); return; }

  sendCommentBtn.disabled = true;

  try {
    const { error } = await supabase.from('comments').insert({
      post_id: currentPostId,
      nickname: currentUser,
      content: text
    });

    if (error) {
      console.error(error);
      showToast('评论失败：' + error.message);
    } else {
      await supabase.rpc('increment_comment', { post_id: currentPostId });
      commentInput.value = '';
      showToast('评论成功');
      loadComments(currentPostId);
      loadPosts();
    }
  } catch (err) {
    console.error(err);
    showToast('网络异常，请稍后重试');
  } finally {
    sendCommentBtn.disabled = false;
  }
});

commentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendCommentBtn.click();
});

// ========== 弹窗关闭 ==========
$$('.modal-close').forEach(el => {
  el.addEventListener('click', () => {
    const modal = $('#' + el.dataset.modal);
    if (modal) modal.classList.remove('active');
  });
});

[postModal, commentModal].forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });
});

// ========== 启动 ==========
checkLogin();