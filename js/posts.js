// js/posts.js — 刷帖 / 点赞 / 评论

// ????
const POSTS_PER_PAGE = 20;
let postsCache = [];
let postsPage = 0;
let postsHasMore = true;
let postsSortBy = 'newest'; // newest | hottest
let postsSearchKeyword = '';

function filterAndSortPosts(posts) {
  let result = posts;
  // ????
  if (postsSearchKeyword) {
    const kw = postsSearchKeyword.toLowerCase();
    result = result.filter(p => (p.content || '').toLowerCase().includes(kw) || (p.nickname || '').toLowerCase().includes(kw));
  }
  // ??
  if (postsSortBy === 'hottest') {
    result = [...result].sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
  }
  return result;
}

function renderPostList() {
  const postList = $('#postList');
  const filtered = filterAndSortPosts(postsCache);
  if (filtered.length === 0) {
    postList.innerHTML = '<div class="tip">' + (postsSearchKeyword ? '???????' : '?????????????~') + '</div>';
    return;
  }
  postList.innerHTML = filtered.map((p, i) => renderPostCard(p, i, new Set())).join('');
  bindPostEvents();
}

function bindSearchEvents() {
  const searchInput = $('#searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      postsSearchKeyword = searchInput.value.trim();
      renderPostList();
    });
  }
  document.querySelectorAll('.sort-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      postsSortBy = tab.dataset.sort;
      renderPostList();
    });
  });
}


async function loadPosts(reset = true) {
  const postList = $('#postList');
  if (reset) {
    postsPage = 0;
    postsCache = [];
    postsHasMore = true;
    postList.innerHTML = '<div class="tip">???...</div>';
  }
  try {
    const from = postsPage * POSTS_PER_PAGE;
    const to = from + POSTS_PER_PAGE - 1;
    const { data } = await db.from('posts').select().range(from, to).order('created_at', { ascending: false }).get();
    if (!data || data.length === 0) {
      postsHasMore = false;
      if (postsCache.length === 0) postList.innerHTML = '<div class="tip">?????????????~</div>';
      return;
    }
    postsCache = postsCache.concat(data);
    postsHasMore = data.length === POSTS_PER_PAGE;
    postsPage++;

    let likedSet = new Set();
    try {
      const { data: likes } = await db.from('likes').select().eq('user_nickname', currentUser).get();
      likedSet = new Set((likes || []).map(l => l.post_id));
    } catch (e) {}

    renderPostList();
    if (postsHasMore) {
      const btn = document.createElement('button');
      btn.id = 'btnLoadMore';
      btn.className = 'btn btn-outline btn-block';
      btn.textContent = '????';
      btn.addEventListener('click', () => loadPosts(false));
      const wrapper = document.createElement('div');
      wrapper.className = 'load-more';
      wrapper.appendChild(btn);
      $('#postList').appendChild(wrapper);
    }

    const btn = document.getElementById('btnLoadMore');
    if (btn) btn.addEventListener('click', () => loadPosts(false));
  } catch (err) { postList.innerHTML = '<div class="tip">?? ??????????</div>'; }
}

function renderPostCard(p, i, likedSet) {
  const imgs = p.images ? (typeof p.images === 'string' ? JSON.parse(p.images) : p.images) : [];
  const imgHtml = imgs.length ? '<div class="post-images">' + imgs.map(u => '<img src="' + escapeHtml(u) + '" onclick="event.stopPropagation();openImageViewer(\'' + escapeHtml(u).replace(/'/g, "\\'") + '\')" />').join('') + '</div>' : '';
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
    '<span class="act-icon">💬</span><span>' + (p.comment_count || 0) + '</span></div>' +
    (window.isAdmin ? '<div class="act act-delete" data-action="deletePost" data-id="' + p.id + '"><span class="act-icon">🗏️</span>删除</div>' : '') +
    '</div></div>';
}

function bindPostEvents() {
  const postList = $('#postList');
  postList.querySelectorAll('[data-action="like"]').forEach(el => el.addEventListener('click', () => toggleLike(el)));
  postList.querySelectorAll('[data-action="comment"]').forEach(el => el.addEventListener('click', () => openComments(el.dataset.id)));
  postList.querySelectorAll('[data-action="deletePost"]').forEach(el => el.addEventListener('click', () => deletePost(el.dataset.id)));
}

async function deletePost(postId) {
  if (!confirm('确定要删除这条帖子吗？此操作不可恢复。')) return;
  try {
    await db.from('likes').delete().eq('post_id', postId).exec();
    await db.from('comments').delete().eq('post_id', postId).exec();
    await db.from('posts').delete().eq('id', postId).exec();
    showToast('帖子已删除');
    loadPosts();
    refreshMineIfActive();
  } catch (err) { showToast('删除失败'); }
}

async function toggleLike(el) {
  const postId = el.dataset.id;
  const liked = el.classList.contains('liked');
  el.classList.toggle('liked');
  const iconEl = el.querySelector('.act-icon');
  const countEl = el.querySelector('.like-count');
  try {
    if (liked) {
      await db.from('likes').delete().eq('post_id', postId).eq('user_nickname', currentUser).exec();
    } else {
      await db.from('likes').insert({ post_id: postId, user_nickname: currentUser });
    }
    const { data } = await db.from('likes').select('id').eq('post_id', postId).get();
    const newCount = data ? data.length : 0;
    countEl.textContent = newCount;
    iconEl.textContent = liked ? '🤍' : '❤️';
    try {
      await db.from('posts').update({ like_count: newCount }).eq('id', postId);
    } catch (e) {}
  } catch (err) {
    el.classList.toggle('liked');
    showToast('操作失败');
  }
}

// ===== 评论 =====
async function openComments(postId) {
  currentPostId = postId;
  const commentModal = $('#commentModal');
  commentModal.classList.add('active');
  await loadComments(postId);
}

async function loadComments(postId) {
  const commentListEl = $('#commentList');
  commentListEl.innerHTML = '<div class="tip">加载中...</div>';
  try {
    const { data } = await db.from('comments').select().eq('post_id', postId).order('created_at').get();
    if (!data || data.length === 0) {
      commentListEl.innerHTML = '<div class="tip">暂无评论</div>';
    } else {
      const tree = buildCommentTree(data);
      commentListEl.innerHTML = tree.map(c => renderCommentItem(c, false)).join('');
      bindCommentEvents();
    }
  } catch (err) { commentListEl.innerHTML = '<div class="tip">加载失败</div>'; }
}

function buildCommentTree(comments) {
  const map = {};
  const roots = [];
  comments.forEach(c => { c.children = []; map[c.id] = c; });
  comments.forEach(c => {
    if (c.parent_id && map[c.parent_id]) { map[c.parent_id].children.push(c); }
    else { roots.push(c); }
  });
  return roots;
}

function renderCommentItem(c, isChild) {
  return '<div class="comment-item' + (isChild ? ' comment-child' : '') + '" data-comment-id="' + c.id + '">' +
    '<div class="comment-avatar">' + getAvatarEmoji(c.nickname) + '</div>' +
    '<div class="comment-body">' +
    '<div class="comment-header"><span class="comment-nick">' + escapeHtml(c.nickname) + '</span>' +
    '<span class="comment-time">' + formatTime(c.created_at) + '</span></div>' +
    '<div class="comment-text">' + escapeHtml(c.content) + '</div>' +
    '<div class="comment-actions">' +
    '<span class="comment-reply" data-reply-id="' + c.id + '" data-reply-nick="' + escapeHtml(c.nickname) + '">回复</span>' +
    (c.nickname === currentUser ? '<span class="comment-delete" data-delete-id="' + c.id + '">删除</span>' : '') +
    '</div>' +
    (c.children && c.children.length ? c.children.map(ch => renderCommentItem(ch, true)).join('') : '') +
    '</div></div>';
}

function bindCommentEvents() {
  const commentListEl = $('#commentList');
  commentListEl.querySelectorAll('.comment-reply').forEach(el => {
    el.addEventListener('click', () => {
      replyTo = { id: el.dataset.replyId, nickname: el.dataset.replyNick };
      $('#replyHint').style.display = 'block';
      $('#replyHint').textContent = '回复 @' + replyTo.nickname;
      $('#commentInput').focus();
    });
  });
  commentListEl.querySelectorAll('.comment-delete').forEach(el => {
    el.addEventListener('click', () => deleteComment(el.dataset.deleteId, currentPostId));
  });
}

function cancelReply() {
  replyTo = null;
  $('#replyHint').style.display = 'none';
  $('#commentInput').placeholder = '说点什么...';
}

async function deleteComment(commentId, postId) {
  if (!confirm('确定要删除这条评论吗？')) return;
  try {
    await db.from('comments').delete().eq('id', commentId).exec();
    showToast('评论已删除');
    await loadComments(postId);
    const { data } = await db.from('comments').select('id').eq('post_id', postId).get();
    const newCount = data ? data.length : 0;
    await db.from('posts').update({ comment_count: newCount }).eq('id', postId);
    loadPosts();
  } catch (err) { showToast('删除失败'); }
}

// 发送评论
function bindSendComment() {
  const sendCommentBtn = $('#sendComment');
  const commentInput = $('#commentInput');
  // ?????10??
  let commentCooldown = 0;
  function getCommentCooldown() {
    const last = localStorage.getItem('comment_last_attempt');
    if (!last) return 0;
    return Math.max(0, 10000 - (Date.now() - parseInt(last)));
  }

  sendCommentBtn.addEventListener('click', async () => {
    const cd = getCommentCooldown();
    if (cd > 0) { showToast('??? ' + Math.ceil(cd / 1000) + ' ?????'); return; }

    const content = commentInput.value.trim();
    if (!content) { showToast('请输入评论内容'); return; }
    if (!currentPostId) return;
    try {
      const commentData = { post_id: currentPostId, nickname: currentUser, content };
      if (replyTo) { commentData.parent_id = replyTo.id; }
      await db.from('comments').insert(commentData);
      const { data } = await db.from('comments').select('id').eq('post_id', currentPostId).get();
      const newCount = data ? data.length : 0;
      await db.from('posts').update({ comment_count: newCount }).eq('id', currentPostId);
      localStorage.setItem('comment_last_attempt', Date.now().toString());
      cancelReply();
      commentInput.value = '';
      await loadComments(currentPostId);
      loadPosts();
    } catch (err) { showToast('评论失败: ' + (err.message || '网络错误')); }
  });
}

function refreshMineIfActive() {
  const activeTab = document.querySelector('.mine-tab.active');
  if (activeTab) {
    if (activeTab.dataset.tab === 'myPosts') loadMinePosts();
    else if (activeTab.dataset.tab === 'myLikes') loadMineLikes();
    else if (activeTab.dataset.tab === 'myComments') loadMineComments();
  }
}
