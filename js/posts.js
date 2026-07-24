// js/posts.js 闁?闁告帒鍢茬粭?/ 闁绘劗顢婄粋?/ 閻犲洤瀚?

// ????
const POSTS_PER_PAGE = 20;
let postsCache = [];
let postsPage = 0;
let postsHasMore = true;
let postsSortBy = 'newest'; // newest | hottest
let postsSearchKeyword = '';
let likedSet = new Set();

function filterAndSortPosts(posts) {
  let result = posts;
  if (postsSearchKeyword) {
    const kw = postsSearchKeyword.toLowerCase();
    result = result.filter(p => (p.content || '').toLowerCase().includes(kw) || (p.nickname || '').toLowerCase().includes(kw));
  }
  if (postsSortBy === 'hottest') {
    const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    result = result.filter(p => new Date(p.created_at).getTime() > oneMonthAgo);
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
  postList.innerHTML = filtered.map((p, i) => renderPostCard(p, i, likedSet)).join('');
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

    try {
      const { data: likes } = await db.from('likes').select().eq('user_nickname', currentUserNickname || currentUser).get();
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


  } catch (err) { postList.innerHTML = '<div class="tip">?? ??????????</div>'; }
}

function renderPostCard(p, i, likedSet) {
  const imgs = p.images ? (typeof p.images === 'string' ? JSON.parse(p.images) : p.images) : [];
  const imgHtml = imgs.length ? '<div class="post-images">' + imgs.map(u => '<img src="' + escapeHtml(u) + '" onclick="event.stopPropagation();openImageViewer(\'' + escapeHtml(u).replace(/'/g, "\\'") + '\')" />').join('') + '</div>' : '';
  return '<div class="post-card" style="animation-delay:' + (i * 0.03) + 's">' +
    '<div class="post-header"><div class="post-avatar">' + getAvatarEmoji(p.nickname) + '</div>' +
    '<span class="post-nickname">' + (p.is_anonymous ? '闁告牕鐏濋幃鏇㈡偨閵婏箑鐓? : escapeHtml(p.nickname)) + '</span>' +
    '<span class="post-time">' + formatTime(p.created_at) + '</span></div>' +
    '<div class="post-body">' + escapeHtml(p.content) + '</div>' + imgHtml +
    '<div class="post-actions">' +
    '<div class="act ' + ((likedSet && likedSet.has(p.id)) ? 'liked' : '') + '" data-action="like" data-id="' + p.id + '">' +
    '<span class="act-icon">' + ((likedSet && likedSet.has(p.id)) ? '闁村倶鍊х粭? : '妫ｅ喚妲?) + '</span>' +
    '<span class="like-count">' + (p.like_count || 0) + '</span></div>' +
    '<div class="act" data-action="comment" data-id="' + p.id + '">' +
    '<span class="act-icon">妫ｅ啯灏?/span><span>' + (p.comment_count || 0) + '</span></div>' +
    (window.isAdmin ? '<div class="act act-delete" data-action="deletePost" data-id="' + p.id + '"><span class="act-icon">妫ｅ啯顥戦柨?/span>闁告帞濞€濞?/div>' : '') +
    '</div></div>';
}

function bindPostEvents() {
  const postList = $('#postList');
  postList.querySelectorAll('[data-action="like"]').forEach(el => el.addEventListener('click', () => toggleLike(el)));
  postList.querySelectorAll('[data-action="comment"]').forEach(el => el.addEventListener('click', () => openComments(el.dataset.id)));
  postList.querySelectorAll('[data-action="deletePost"]').forEach(el => el.addEventListener('click', () => deletePost(el.dataset.id)));
}

async function deletePost(postId) {
  if (!confirm('缁绢収鍠栭悾鍓ф啺娴ｇ鐏╅梻鍕╁€涚换鏍级閳ュ磭鐟悗娑欏姇閹囨晬閻斿壊鍔冮柟鍨С缂嶆梹绋夊鍛闁诡厹鍨归ˇ鏌ュΥ?)) return;
  try {
    await db.rpc('delete_post_rpc', { p_post_id: postId, p_account: currentUser });
    showToast('閻㈩垱鐗曢悺娆忣啅閹绘帒鐏╅梻?);
    loadPosts();
    
  } catch (err) { showToast('闁告帞濞€濞呭孩寰勬潏顐バ?); }
}

async function toggleLike(el) {
  const postId = el.dataset.id;
  const liked = el.classList.contains('liked');
  el.classList.toggle('liked');
  const iconEl = el.querySelector('.act-icon');
  const countEl = el.querySelector('.like-count');
  try {
    const { data } = await db.rpc('toggle_like', { p_post_id: postId, p_account: currentUser });
    const newCount = data || 0;
    countEl.textContent = newCount;
    iconEl.textContent = liked ? '妫ｅ喚妲? : '闁村倶鍊х粭?;
  } catch (err) {
    el.classList.toggle('liked');
    showToast('闁瑰灝绉崇紞鏃€寰勬潏顐バ?);
  }
}

// ===== 閻犲洤瀚?=====
async function openComments(postId) {
  currentPostId = postId;
  const commentModal = $('#commentModal');
  commentModal.classList.add('active');
  await loadComments(postId);
}

async function loadComments(postId) {
  const commentListEl = $('#commentList');
  commentListEl.innerHTML = '<div class="tip">闁告梻濮惧ù鍥ㄧ▔?..</div>';
  try {
    const { data } = await db.from('comments').select().eq('post_id', postId).order('created_at').get();
    if (!data || data.length === 0) {
      commentListEl.innerHTML = '<div class="tip">闁哄棗鍊瑰Λ銈囨嫚閸曨噮鍟?/div>';
    } else {
      const tree = buildCommentTree(data);
      commentListEl.innerHTML = tree.map(c => renderCommentItem(c, false)).join('');
      bindCommentEvents();
    }
  } catch (err) { commentListEl.innerHTML = '<div class="tip">闁告梻濮惧ù鍥ㄥ緞鏉堫偉袝</div>'; }
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
    '<span class="comment-reply" data-reply-id="' + c.id + '" data-reply-nick="' + escapeHtml(c.nickname) + '">闁搞儳鍋涢ˇ?/span>' +
    (c.nickname === currentUser ? '<span class="comment-delete" data-delete-id="' + c.id + '">闁告帞濞€濞?/span>' : '') +
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
      $('#replyHint').textContent = '闁搞儳鍋涢ˇ?@' + replyTo.nickname;
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
  $('#commentInput').placeholder = '閻犲洤顕崑锝嗙閳ь剚绋?..';
}

async function deleteComment(commentId, postId) {
  if (!confirm('缁绢収鍠栭悾鍓ф啺娴ｇ鐏╅梻鍕╁€涚换鏍级闄囬惁搴ｆ媼閸濆嫭鍋嬮柨?)) return;
  try {
    await db.rpc('delete_comment_rpc', { p_comment_id: commentId, p_account: currentUser });
    showToast('閻犲洤瀚鎴濐啅閹绘帒鐏╅梻?);
    await loadComments(postId);
    const { data } = await db.from('comments').select('id').eq('post_id', postId).get();
    const newCount = data ? data.length : 0;
    await db.from('posts').update({ comment_count: newCount }).eq('id', postId);
    loadPosts();
  } catch (err) { showToast('闁告帞濞€濞呭孩寰勬潏顐バ?); }
}

// 闁告瑦鍨块埀顑挎祰閻﹀海鎷?
function bindSendComment() {
  const sendCommentBtn = $('#sendComment');
  const commentInput = $('#commentInput');
  sendCommentBtn.addEventListener('click', async () => {
    const content = commentInput.value.trim();
    if (!content) { showToast('閻犲洨鏌夌欢顓㈠礂閵夈劎妲戦悹浣告惈閸炲鈧?); return; }
    if (!currentPostId) return;
    try {
      await db.rpc('add_comment', {
        p_post_id: currentPostId,
        p_account: currentUser,
        p_content: content,
        p_parent_id: replyTo ? replyTo.id : null
      });
      cancelReply();
      commentInput.value = '';
      await loadComments(currentPostId);
      loadPosts();
    } catch (err) { showToast('閻犲洤瀚鎴炲緞鏉堫偉袝: ' + (err.message || '缂傚啯鍨圭划鍫曟煥濞嗘帩鍤?)); }
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
