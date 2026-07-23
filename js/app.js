// js/app.js — 校园墙 v2

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ========== DOM ==========
const loginModal = $('#loginModal');
const nicknameInput = $('#nicknameInput');
const passwordInput = $('#passwordInput');
const confirmInput = $('#confirmInput');
const confirmGroup = $('#confirmGroup');
const loginBtn = $('#loginBtn');
const loginSub = $('#loginSub');
const switchText = $('#switchText');
const switchLink = $('#switchLink');
const headerUser = $('#headerUser');
const postList = $('#postList');
const postContent = $('#postContent');
const charCount = $('#charCount');
const imageGrid = $('#imageGrid');
const anonCheck = $('#anonCheck');
const submitPost = $('#submitPost');
const btnPickImage = $('#btnPickImage');
const fileInput = $('#fileInput');
const commentModal = $('#commentModal');
const commentListEl = $('#commentList');
const commentInput = $('#commentInput');
const sendCommentBtn = $('#sendComment');
const replyHint = $('#replyHint');
const toastEl = $('#toast');
const mineContent = $('#mineContent');
const myNickname = $('#myNickname');
const myAvatar = $('#myAvatar');
const profileModal = $('#profileModal');
const btnLogout = $('#btnLogout');

let currentUser = null;
let currentPostId = null;
let isRegisterMode = true;
let selectedImages = []; // File 对象数组
let replyTo = null; // { id, nickname } 回复目标

// ========== 工具函数 ==========
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 1800);
}
function formatTime(d) { if (!d) return ''; const t = new Date(d), n = new Date(); const diff = n - t; if (diff < 60000) return '刚刚'; if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'; if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'; return (t.getMonth() + 1) + '月' + t.getDate() + '日 ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'); }
function getAvatarEmoji(name) { const e = ['😊','🌟','🎈','🌸','🍀','🐣','🦊','🐱','🐶','🐼','🐨','🐯','🦁','🐸','🐵','🐮','🐷','🐭','🐹','🐰']; let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h); return e[Math.abs(h) % e.length]; }
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
async function sha256(t) { const d = new TextEncoder().encode(t); const h = await crypto.subtle.digest('SHA-256', d); return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''); }

// ========== 底部导航 ==========
$$('#bottomNav .nav-item').forEach(el => {
  el.addEventListener('click', () => {
    if (!currentUser) { showToast('请先登录'); return; }
    $$('#bottomNav .nav-item').forEach(e => e.classList.remove('active'));
    el.classList.add('active');
    $$('.panel').forEach(p => p.classList.remove('active'));
    const panel = $('#' + el.dataset.panel);
    if (panel) panel.classList.add('active');

    if (el.dataset.panel === 'panelSquare') loadPosts();
    if (el.dataset.panel === 'panelPost') { postContent.value = ''; charCount.textContent = '0'; anonCheck.checked = false; selectedImages = []; renderImageGrid(); }
    if (el.dataset.panel === 'panelMine') loadMinePage();
  });
});

// ========== 登录/注册 ==========



function validatePassword(pwd) {
  if (pwd.length < 8) return '密码长度不小于8位';
  if (!/[A-Z]/.test(pwd)) return '必须含有一个大写字母';
  if (!/[0-9]/.test(pwd)) return '必须含有一个数字';
  if (!/^[a-zA-Z0-9]+$/.test(pwd)) return '只含有数字和字母';
  return null;
}

async function doRegister(nickname, password, confirm) {
  if (password !== confirm) { showToast('两次密码不一致'); return; }
  const err = validatePassword(password);
  if (err) { showToast(err); return; }
  const hash = await sha256(password);
  try {
    const { error } = await db.from('users').insert({ nickname, password_hash: hash });
    if (error) throw error;
    showToast('注册成功，等待管理员审核');loginBtn.disabled = false;loginBtn.textContent = '注 册';
  } catch (err) {
    showToast(err.message && err.message.includes('duplicate') ? '昵称已被占用' : '注册失败');
  }
}

async function doLogin(nickname, password) {
  const hash = await sha256(password);
  try {
    const { data } = await db.from('users').select('nickname,password_hash,status,is_admin').eq('nickname', nickname).get();
    if (!data || data.length === 0) { showToast('账号不存在'); return; }
    if (data[0].password_hash !== hash) { showToast('密码错误'); return; }
    if (data[0].status === 'pending') { showToast('账号待审核中，请等待管理员通过'); return; }
    if (data[0].status === 'rejected') { showToast('账号已被拒绝'); return; }
    if (data[0].status === 'disabled') { showToast('账号已被禁用'); return; }
    doLoginSuccess(nickname, data[0].is_admin);
  } catch (err) { showToast('登录失败'); }
}

function doLoginSuccess(nickname, isAdmin) {
  currentUser = nickname;
  window.isAdmin = isAdmin || false;
  localStorage.setItem('campus_wall_nickname', nickname);
  localStorage.setItem('campus_wall_is_admin', isAdmin ? '1' : '0');
  loginModal.classList.remove('active');
  headerUser.textContent = '👤 ' + currentUser + (isAdmin ? ' 🛡️' : '');
  loadPosts();
}

loginBtn.addEventListener('click', async () => {
  const name = nicknameInput.value.trim();
  const pwd = passwordInput.value;
  if (!name) { showToast('请输入昵称'); return; }
  if (name.length > 12) { showToast('昵称最多12个字'); return; }
  if (!pwd) { showToast('请输入密码'); return; }

  if (isRegisterMode) {
    // 注册冷却检查
    const cd = getRegCooldown();
    if (cd > 0) { showToast('请等待 ' + Math.ceil(cd/1000) + ' 秒后再注册'); return; }
    // 验证码检查
    const userAnswer = parseInt(document.getElementById('captchaInput').value);
    if (userAnswer !== captchaAnswer) {
      showToast('验证码错误，请重新计算');
      generateCaptcha();
      document.getElementById('captchaInput').value = '';
      return;
    }
  }

  loginBtn.disabled = true;
  loginBtn.textContent = isRegisterMode ? '注册中...' : '登录中...';
  if (isRegisterMode) {
    localStorage.setItem('reg_last_attempt', Date.now().toString());
    await doRegister(name, pwd, confirmInput.value);
  }
  else await doLogin(name, pwd);
  loginBtn.disabled = false;
  loginBtn.textContent = isRegisterMode ? '注 册' : '登 录';
});

[nicknameInput, passwordInput, confirmInput].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); }));
// 登录/注册切换
switchLink.addEventListener('click', (e) => {
  e.preventDefault();
  isRegisterMode = !isRegisterMode;
  if (isRegisterMode) {
    loginSub.textContent = '注册账号，加入你的校园';
    loginBtn.textContent = '注 册';
    switchText.textContent = '已有账号？';
    switchLink.textContent = '去登录';
    confirmGroup.style.display = 'block';
    confirmGroup.style.display = 'block';
    document.getElementById('pwdRules').style.display = 'block';
    document.getElementById('captchaGroup').style.display = 'block';
    generateCaptcha();
  } else {
    loginSub.textContent = '登录账号，回到校园';
    loginBtn.textContent = '登 录';
    switchText.textContent = '没有账号？';
    switchLink.textContent = '去注册';
    confirmGroup.style.display = 'none';
    document.getElementById('pwdRules').style.display = 'none';
    document.getElementById('captchaGroup').style.display = 'none';
  }
  if (confirm('确定要退出登录吗？')) {
    localStorage.removeItem('campus_wall_nickname');
    currentUser = null; headerUser.textContent = '';
    postList.innerHTML = '<div class="tip">请先登录</div>';
    loginModal.classList.add('active');
  }
});

// ========== 帖子列表 ==========
async function loadPosts() {
  postList.innerHTML = '<div class="tip">加载中...</div>';
  try {
    const { data } = await db.from('posts').select().order('created_at', { ascending: false }).get();
    if (!data || data.length === 0) { postList.innerHTML = '<div class="tip">还没有帖子，快来发第一条吧~</div>'; return; }
    let likedSet = new Set();
    try {
      const { data: likes } = await db.from('likes').select().eq('user_nickname', currentUser).get();
      likedSet = new Set((likes || []).map(l => l.post_id));
    } catch (e) {}
    postList.innerHTML = data.map((p, i) => renderPostCard(p, i, likedSet)).join('');
    bindPostEvents();
  } catch (err) { postList.innerHTML = '<div class="tip">⚠️ 加载失败，请刷新重试</div>'; }
}

function renderPostCard(p, i, likedSet) {
  const imgs = p.images ? (typeof p.images === 'string' ? JSON.parse(p.images) : p.images) : [];
  const imgHtml = imgs.length ? '<div class="post-images">' + imgs.map(u => '<img src="' + escapeHtml(u) + '" />').join('') + '</div>' : '';
  return '<div class="post-card" style="animation-delay:' + (i * 0.03) + 's">' +
    '<div class="post-header"><div class="post-avatar">' + getAvatarEmoji(p.nickname) + '</div>' +
    '<span class="post-nickname">' + (p.is_anonymous ? '匿名用户' : escapeHtml(p.nickname)) + '</span>' +
    '<span class="post-time">' + formatTime(p.created_at) + '</span></div>' +
    '<div class="post-body">' + escapeHtml(p.content) + '</div>' + imgHtml +
    '<div class="post-actions">' +
    '<div class="act ' + (likedSet.has(p.id) ? 'liked' : '') + '" data-action="like" data-id="' + p.id + '">' +
    '<span class="act-icon">' + (likedSet.has(p.id) ? '❤️' : '🤍') + '</span>' +
    '<span class="like-count">' + (p.like_count || 0) + '</span></div>' +
    '<div class="act" data-action="comment" data-id="' + p.id + '">' +
    "<span class=\"act-icon\">💬</span><span>" + (p.comment_count || 0) + "</span></div>" + (window.isAdmin ? "<div class=\"act act-delete\" data-action=\"deletePost\" data-id=\"" + p.id + "\"><span class=\"act-icon\">🗑️</span>删除</div>" : "") + "</div></div>";
}

function bindPostEvents() {
  postList.querySelectorAll('[data-action="like"]').forEach(el => el.addEventListener('click', () => toggleLike(el)));
  postList.querySelectorAll('[data-action="comment"]').forEach(el => el.addEventListener('click', () => openComments(el.dataset.id)));
  postList.querySelectorAll('[data-action="deletePost"]').forEach(el => el.addEventListener('click', () => deletePost(el.dataset.id)));
}

// 删除帖子（管理员或作者本人）
async function deletePost(postId) {
  if (!confirm('确定要删除这条帖子吗？此操作不可恢复。')) return;
  try {
    await db.from('likes').delete().eq('post_id', postId).exec();
    await db.from('comments').delete().eq('post_id', postId).exec();
    await db.from('posts').delete().eq('id', postId).exec();
    showToast('帖子已删除');
    loadPosts();
    const activeTab = document.querySelector('.mine-tab.active');
    if (activeTab) {
      if (activeTab.dataset.tab === 'myPosts') loadMinePosts();
      else if (activeTab.dataset.tab === 'myLikes') loadMineLikes();
      else if (activeTab.dataset.tab === 'myComments') loadMineComments();
    }
  } catch (err) { showToast('删除失败'); }
}
// ========== 点赞 ==========
async function toggleLike(el) {
  const postId = el.dataset.id;
  const isLiked = el.classList.contains('liked');
  const countEl = el.querySelector('.like-count');
  if (isLiked) { el.classList.remove('liked'); el.querySelector('.act-icon').textContent = '🤍'; countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1); }
  else { el.classList.add('liked'); el.querySelector('.act-icon').textContent = '❤️'; countEl.textContent = parseInt(countEl.textContent) + 1; }
  try {
    if (isLiked) { await db.from('likes').delete().eq('post_id', postId).eq('user_nickname', currentUser).exec(); await db.rpc('decrement_like', { post_id: postId }); }
    else { await db.from('likes').insert({ post_id: postId, user_nickname: currentUser }); await db.rpc('increment_like', { post_id: postId }); }
  } catch (err) {
    if (isLiked) { el.classList.add('liked'); el.querySelector('.act-icon').textContent = '❤️'; countEl.textContent = parseInt(countEl.textContent) + 1; }
    else { el.classList.remove('liked'); el.querySelector('.act-icon').textContent = '🤍'; countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1); }
  }
}

// ========== 图片上传 ==========
btnPickImage.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  const remain = 9 - selectedImages.length;
  if (files.length > remain) { showToast('最多上传9张图片'); }
  selectedImages = [...selectedImages, ...files.slice(0, remain)];
  renderImageGrid();
  fileInput.value = '';
});

function renderImageGrid() {
  imageGrid.innerHTML = selectedImages.map((f, i) => {
    const url = URL.createObjectURL(f);
    return '<div class="img-item"><img src="' + url + '" /><span class="del-img" data-idx="' + i + '">×</span></div>';
  }).join('');
  imageGrid.querySelectorAll('.del-img').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(el.dataset.idx);
      URL.revokeObjectURL(imageGrid.querySelectorAll('img')[idx].src);
      selectedImages.splice(idx, 1);
      renderImageGrid();
    });
  });
}

postContent.addEventListener('input', () => { charCount.textContent = postContent.value.length; });

// ========== 发帖 ==========
submitPost.addEventListener('click', async () => {
  const content = postContent.value.trim();
  if (!content && selectedImages.length === 0) { showToast('请输入内容或添加图片'); return; }
  submitPost.disabled = true; submitPost.textContent = '发布中...';

  try {
    // 上传图片
    let imageUrls = [];
    if (selectedImages.length > 0) {
      showToast('正在上传图片...');
      for (const f of selectedImages) {
        const url = await uploadImage(f);
        imageUrls.push(url);
      }
    }

    const postData = {
      nickname: currentUser, content,
      is_anonymous: anonCheck.checked,
      like_count: 0, comment_count: 0
    };
    if (imageUrls.length) postData.images = JSON.stringify(imageUrls);
    const { error } = await db.from('posts').insert(postData);
    if (error) { showToast('发布失败'); } else {
      showToast('发布成功！');
      postContent.value = ''; charCount.textContent = '0'; anonCheck.checked = false;
      selectedImages = []; renderImageGrid();
      switchTab('panelSquare');
      loadPosts();
    }
  } catch (err) { showToast('发布失败: ' + (err.message || '网络异常')); console.error(err); }
  finally { submitPost.disabled = false; submitPost.textContent = '发布'; }
});

// ========== 评论（含回复） ==========
async function openComments(postId) {
  currentPostId = postId;
  replyTo = null;
  replyHint.style.display = 'none';
  commentInput.value = '';
  commentListEl.innerHTML = '<div class="tip">加载评论...</div>';
  commentModal.classList.add('active');
  await loadComments(postId);
}

async function loadComments(postId) {
  try {
    const { data } = await db.from('comments').select().eq('post_id', postId).order('created_at').get();
    if (!data || data.length === 0) { commentListEl.innerHTML = '<div class="tip" style="padding:30px">暂无评论，快来抢沙发~</div>'; return; }
    commentListEl.innerHTML = buildCommentTree(data);
    bindCommentEvents();
  } catch (err) { commentListEl.innerHTML = '<div class="tip">加载失败</div>'; }
}

function buildCommentTree(comments) {
  const roots = comments.filter(c => !c.parent_id);
  const children = comments.filter(c => c.parent_id);
  let html = '';
  roots.forEach(r => {
    html += renderCommentItem(r, false);
    const subs = children.filter(c => c.parent_id === r.id);
    subs.forEach(s => { html += renderCommentItem(s, true); });
  });
  return html;
}

function renderCommentItem(c, isChild) {
  return '<div class="comment-item' + (isChild ? ' child' : '') + '">' +
    '<div class="comment-avatar">' + getAvatarEmoji(c.nickname) + '</div>' +
    '<div class="comment-body"><div class="comment-nickname">' + escapeHtml(c.nickname) + '</div>' +
    '<div class="comment-text">' + (c.reply_to_nickname ? '<span style="color:#4A90D9">@' + escapeHtml(c.reply_to_nickname) + '</span> ' : '') + escapeHtml(c.content) + '</div>' +
    "<div class=\"comment-time\">" + formatTime(c.created_at) + "<span class=\"comment-reply-btn\" data-reply-id=\"" + c.id + "\" data-reply-nick=\"" + escapeHtml(c.nickname) + "\">回复</span>" + (window.isAdmin || c.nickname === currentUser ? "<span class=\"comment-del-btn\" data-del-id=\"" + c.id + "\"> 🗑️</span>" : "") + "</div></div></div>";
}

function bindCommentEvents() {
  commentListEl.querySelectorAll('.comment-reply-btn').forEach(el => {
    el.addEventListener('click', () => {
      replyTo = { id: el.dataset.replyId, nickname: el.dataset.replyNick };
      replyHint.innerHTML = '回复 @' + escapeHtml(replyTo.nickname) + '<span class="cancel-reply">×</span></span>';
      replyHint.style.display = 'flex';
      commentInput.placeholder = '回复 @' + replyTo.nickname + '...';
      commentInput.focus();
      replyHint.querySelector('.cancel-reply').addEventListener('click', cancelReply);
    });
  });
  commentListEl.querySelectorAll('.comment-del-btn').forEach(el => { el.addEventListener('click', () => deleteComment(el.dataset.delId, currentPostId)); });
}
function cancelReply() { replyTo = null; replyHint.style.display = 'none'; commentInput.placeholder = '说点什么...'; }

// 删除评论（管理员或作者本人）
async function deleteComment(commentId, postId) {
  if (!confirm('确定要删除这条评论吗？')) return;
  try {
    await db.from('comments').delete().eq('id', commentId).exec();
    await db.rpc('decrement_comment', { post_id: postId });
    showToast('评论已删除');
    loadComments(postId);
    loadPosts();
  } catch (err) { showToast('删除失败'); }
}

sendCommentBtn.addEventListener('click', async () => {
  const text = commentInput.value.trim();
  if (!text) { showToast('请输入评论'); return; }
  sendCommentBtn.disabled = true;
  try {
    const body = { post_id: currentPostId, nickname: currentUser, content: text };
    if (replyTo) { body.parent_id = replyTo.id; body.reply_to_nickname = replyTo.nickname; }
    const { error } = await db.from('comments').insert(body);
    if (error) { showToast('评论失败'); } else {
      await db.rpc('increment_comment', { post_id: currentPostId });
      commentInput.value = ''; cancelReply();
      loadComments(currentPostId); loadPosts();
    }
  } catch (err) { showToast('评论失败: ' + (err.message || '未知')); }
  finally { sendCommentBtn.disabled = false; }
});

commentInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendCommentBtn.click(); });

// ========== 我的页面 ==========
async function loadMinePage() {
  myNickname.textContent = currentUser;
  myAvatar.textContent = getAvatarEmoji(currentUser);
  mineContent.innerHTML = '<div class="tip">加载中...</div>';
  $('#adminSection').style.display = window.isAdmin ? 'block' : 'none';
  loadMinePosts();
}

$$('.mine-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.mine-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    if (tab.dataset.tab === 'myPosts') loadMinePosts();
    else if (tab.dataset.tab === 'myLikes') loadMineLikes();
    else if (tab.dataset.tab === 'myComments') loadMineComments();
  });
});

async function loadMinePosts() {
  mineContent.innerHTML = '<div class="tip">加载中...</div>';
  try {
    const { data } = await db.from('posts').select().eq('nickname', currentUser).order('created_at', { ascending: false }).get();
    if (!data || data.length === 0) { mineContent.innerHTML = '<div class="tip">还没有发过帖子</div>'; return; }
    mineContent.innerHTML = data.map(p => renderCompactPost(p)).join(''); bindMineDeleteEvents();
  } catch (err) { mineContent.innerHTML = '<div class="tip">加载失败</div>'; }
}

async function loadMineLikes() {
  mineContent.innerHTML = '<div class="tip">加载中...</div>';
  try {
    const { data: likes } = await db.from('likes').select().eq('user_nickname', currentUser).order('created_at', { ascending: false }).get();
    if (!likes || likes.length === 0) { mineContent.innerHTML = '<div class="tip">还没有点赞过帖子</div>'; return; }
    const postIds = likes.map(l => l.post_id);
    const { data: posts } = await db.from('posts').select().in('id', postIds).get();
    mineContent.innerHTML = (posts || []).map(p => renderCompactPost(p)).join(''); bindMineDeleteEvents();
  } catch (err) { mineContent.innerHTML = '<div class="tip">加载失败</div>'; }
}

async function loadMineComments() {
  mineContent.innerHTML = '<div class="tip">加载中...</div>';
  try {
    const { data: comments } = await db.from('comments').select().eq('nickname', currentUser).order('created_at', { ascending: false }).get();
    if (!comments || comments.length === 0) { mineContent.innerHTML = '<div class="tip">还没有评论过帖子</div>'; return; }
    const postIds = [...new Set(comments.map(c => c.post_id))];
    const { data: posts } = await db.from('posts').select().in('id', postIds).get();
    const postMap = {}; (posts || []).forEach(p => { postMap[p.id] = p; });
    mineContent.innerHTML = comments.map(c => {
      const p = postMap[c.post_id];
      if (!p) return '';
      return renderCompactPost(p) + '<div class="mine-comment-note">💬 你的评论：' + escapeHtml(c.content) + '</div>';
    }).join(''); bindMineDeleteEvents();
  } catch (err) { mineContent.innerHTML = '<div class="tip">加载失败</div>'; }
}

function bindMineDeleteEvents() {
  mineContent.querySelectorAll('[data-action="deleteMinePost"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePost(el.dataset.id);
    });
  });
}

function renderCompactPost(p) {
  const imgs = p.images ? (typeof p.images === 'string' ? JSON.parse(p.images) : p.images) : [];
  const imgHtml = imgs.length ? '<img src="' + escapeHtml(imgs[0]) + '" style="width:100%;border-radius:8px;margin-top:8px;max-height:200px;object-fit:cover;" />' : '';
  return '<div class="post-card">' +
    '<div class="post-body">' + escapeHtml(p.content) + '</div>' +
    imgHtml +
    '<div style="display:flex;gap:20px;margin-top:8px;font-size:12px;color:#999;">' +
    '<span>❤️ ' + (p.like_count || 0) + '</span><span>💬 ' + (p.comment_count || 0) + '</span>' +
    '<span style="margin-left:auto">' + formatTime(p.created_at) + '</span>' + '<span class="act-delete" data-action="deleteMinePost" data-id="' + p.id + '" style="cursor:pointer;color:#FF6B6B;margin-left:8px;">🗑️ 删除</span></div></div>';
}

// ========== 编辑资料 ==========
$('#btnEditProfile').addEventListener('click', () => {
  $('#editNickname').value = currentUser;
  $('#editOldPwd').value = '';
  $('#editNewPwd').value = '';
  profileModal.classList.add('active');
});

$('#btnSaveProfile').addEventListener('click', async () => {
  const newNick = $('#editNickname').value.trim();
  const oldPwd = $('#editOldPwd').value;
  const newPwd = $('#editNewPwd').value;
  if (!newNick) { showToast('请输入昵称'); return; }
  if (!oldPwd) { showToast('请输入原密码'); return; }

  const oldHash = await sha256(oldPwd);
  try {
    const { data } = await db.from('users').select().eq('nickname', currentUser).get();
    if (!data || data.length === 0 || data[0].password_hash !== oldHash) { showToast('原密码错误'); return; }

    const updateData = { nickname: newNick };
    if (newPwd) {
      const pwdErr = validatePassword(newPwd);
      if (pwdErr) { showToast(pwdErr); return; }
      updateData.password_hash = await sha256(newPwd);
    }

    await db.from('users').update(updateData).eq('nickname', currentUser);
    currentUser = newNick;
    localStorage.setItem('campus_wall_nickname', newNick);
    headerUser.textContent = '👤 ' + newNick;
    loadMinePage();
    profileModal.classList.remove('active');
    showToast('资料已更新');
  } catch (err) { showToast('修改失败，昵称可能已被占用'); }
});

// ========== 退出登录 ==========
btnLogout.addEventListener('click', () => {
  if (confirm('确定要退出登录吗？')) {
    localStorage.removeItem('campus_wall_nickname');
    currentUser = null; headerUser.textContent = '';
    postList.innerHTML = '<div class="tip">请先登录</div>';
    loginModal.classList.add('active');
    $$('.panel').forEach(p => p.classList.remove('active'));
    $('#panelSquare').classList.add('active');
    $$('#bottomNav .nav-item').forEach(e => e.classList.remove('active'));
    $('#bottomNav .nav-item[data-panel="panelSquare"]').classList.add('active');
  }
});

// ========== 弹窗关闭 ==========
$$('.modal-close').forEach(el => el.addEventListener('click', () => {
  const modal = $('#' + el.dataset.modal);
  if (modal) modal.classList.remove('active');
}));
[commentModal, profileModal].forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('active'); }));

// ========== 导航辅助 ==========
function switchTab(panelId) {
  $$('#bottomNav .nav-item').forEach(e => e.classList.remove('active'));
  $$('.panel').forEach(p => p.classList.remove('active'));
  $('#bottomNav .nav-item[data-panel="' + panelId + '"]').classList.add('active');
  $('#' + panelId).classList.add('active');
}


// ========== 管理员面板 ==========
let adminTab = 'pending'; document.getElementById('adminSearchInput').value = ''; // pending / approved

$('#btnAdminPanel').addEventListener('click', () => {
  adminTab = 'pending'; document.getElementById('adminSearchInput').value = '';
  $('#tabPending').classList.add('active');
  $('#tabApproved').classList.remove('active');
  $('#adminModal').classList.add('active');
  loadAdminUsers();
});

$('#tabPending').addEventListener('click', () => {
  adminTab = 'pending'; document.getElementById('adminSearchInput').value = '';
  $('#tabPending').classList.add('active');
  $('#tabApproved').classList.remove('active');
  loadAdminUsers();
});

$('#tabApproved').addEventListener('click', () => {
  adminTab = 'approved'; document.getElementById('adminSearchInput').value = '';
  $('#tabApproved').classList.add('active');
  $('#tabPending').classList.remove('active');
  loadAdminUsers();
});

async function loadAdminUsers() {
  const list = $('#adminUserList');
  list.innerHTML = '<div class="tip">加载中...</div>';
  try {
    const { data } = await db.from('users').select().eq('status', adminTab).order('created_at', { ascending: false }).get();
    if (!data || data.length === 0) {
      list.innerHTML = '<div class="tip">' + (adminTab === 'pending' ? '没有待审核用户' : '没有已通过用户') + '</div>';
      return;
    }

    list.innerHTML = data.map(u => '<div class="admin-user-item">' +
      '<div class="admin-user-info">' +
      '<div class="admin-user-avatar">' + getAvatarEmoji(u.nickname) + '</div>' +
      '<div><div class="admin-user-name">' + escapeHtml(u.nickname) + (u.is_admin ? ' 🛡️' : '') + '</div>' +
      '<div class="admin-user-time">' + formatTime(u.created_at) + '</div></div>' +
      '</div>' +
      (adminTab === 'pending' ?
        '<div class="admin-actions">' +
        '<button class="btn-approve" data-nick="' + escapeHtml(u.nickname) + '">通过</button>' +
        '<button class="btn-reject" data-nick="' + escapeHtml(u.nickname) + '">拒绝</button></div>' :
        '<div class="admin-actions"><span class="badge-status badge-approved">已通过</span>' + (u.is_admin ? '' : '<button class="btn-disable" data-nick="' + escapeHtml(u.nickname) + '">禁用</button>') + '</div>'
      ) +
    '</div>').join('');

    list.querySelectorAll('.btn-approve').forEach(b => b.addEventListener('click', () => { approveUser(b.dataset.nick); }));
    list.querySelectorAll('.btn-reject').forEach(b => b.addEventListener('click', () => { rejectUser(b.dataset.nick); }));
    list.querySelectorAll('.btn-disable').forEach(b => b.addEventListener('click', () => disableUser(b.dataset.nick)));
  } catch (err) { list.innerHTML = '<div class="tip">加载失败</div>'; }
}

async function approveUser(nickname) {
  try {
    const { data } = await db.from('users').update({ status: 'approved' }).eq('nickname', nickname);
    if (data && data.length > 0) {
      showToast('已通过 ' + nickname);
      loadAdminUsers();
    } else {
      showToast('审核失败：未找到该用户或权限不足（可能需要修改Supabase RLS策略）');
    }
  } catch (err) { showToast('网络错误: ' + (err.message || '未知')); }
}

async function rejectUser(nickname) {
  try {
    const { data } = await db.from('users').update({ status: 'rejected' }).eq('nickname', nickname);
    if (data && data.length > 0) {
      showToast('已拒绝 ' + nickname);
      loadAdminUsers();
    } else {
      showToast('审核失败：未找到该用户或权限不足（可能需要修改Supabase RLS策略）');
    }
  } catch (err) { showToast('网络错误: ' + (err.message || '未知')); }
}
// 禁用用户（管理员）
async function disableUser(nickname) {
  if (!confirm('确定要禁用用户 "' + nickname + '" 吗？\n该用户的所有帖子、评论、点赞都将被删除。')) return;
  try {
    await db.from('likes').delete().eq('user_nickname', nickname).exec();
    await db.from('comments').delete().eq('nickname', nickname).exec();
    await db.from('posts').delete().eq('nickname', nickname).exec();
    await db.from('users').update({ status: 'disabled' }).eq('nickname', nickname);
    showToast('用户 ' + nickname + ' 已被禁用');
    loadAdminUsers();
    loadPosts();
  } catch (err) { showToast('操作失败'); }
}
// 搜索过滤
document.getElementById('adminSearchInput').addEventListener('input', () => { loadAdminUsers(); });

// adminModal 关闭
$('#adminModal').addEventListener('click', e => { if (e.target === $('#adminModal')) $('#adminModal').classList.remove('active'); });

// ========== 启动 ==========

// 密码规则实时检测
setTimeout(function(){
  var pr=document.getElementById("pwdRules");
  var pi=document.getElementById("passwordInput");
  if(!pr||!pi)return;
  var spans=pr.querySelectorAll(".rule");
  pi.addEventListener("input",function(){
    var p=pi.value;
    var ok=[p.length>=8,/[A-Z]/.test(p),/[0-9]/.test(p),!p||/^[a-zA-Z0-9]+$/.test(p)];
    for(var i=0;i<spans.length;i++){
      if(ok[i]){spans[i].className="rule ok";spans[i].innerHTML=spans[i].innerHTML.replace("❌","✅");}
      else{spans[i].className="rule";spans[i].innerHTML=spans[i].innerHTML.replace("✅","❌");}
    }
  });
},200);
generateCaptcha();
function checkLogin() {
  const saved = localStorage.getItem('campus_wall_nickname');
  if (saved) {
    currentUser = saved;
    window.isAdmin = localStorage.getItem('campus_wall_is_admin') === '1';
    loginModal.classList.remove('active');
    headerUser.textContent = '👤 ' + currentUser + (window.isAdmin ? ' 🛡️' : '');
    loadPosts();
  } else {
    loginModal.classList.add('active');
  }
}
checkLogin();
