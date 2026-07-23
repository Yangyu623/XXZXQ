// js/mine.js — "我的" 页面

async function loadMinePage() {
  if (!currentUser) return;
  const myNickname = $('#myNickname');
  const myAvatar = $('#myAvatar');
  myNickname.textContent = currentUser;
  myAvatar.textContent = getAvatarEmoji(currentUser);
  if (window.isAdmin) { $('#adminSection').style.display = 'block'; }
  else { $('#adminSection').style.display = 'none'; }

  document.querySelectorAll('.mine-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.mine-tab[data-tab="myPosts"]').classList.add('active');
  loadMinePosts();
}

async function loadMinePosts() {
  const mineContent = $('#mineContent');
  mineContent.innerHTML = '<div class="tip">加载中...</div>';
  try {
    const { data } = await db.from('posts').select().eq('nickname', currentUser).order('created_at', { ascending: false }).get();
    if (!data || data.length === 0) { mineContent.innerHTML = '<div class="tip">还没有发过帖子</div>'; return; }
    mineContent.innerHTML = data.map(renderCompactPost).join('');
    bindMineDeleteEvents();
  } catch (err) { mineContent.innerHTML = '<div class="tip">加载失败</div>'; }
}

async function loadMineLikes() {
  const mineContent = $('#mineContent');
  mineContent.innerHTML = '<div class="tip">加载中...</div>';
  try {
    const { data: likes } = await db.from('likes').select('post_id').eq('user_nickname', currentUser).get();
    if (!likes || likes.length === 0) { mineContent.innerHTML = '<div class="tip">还没有点赞过帖子</div>'; return; }
    const postIds = likes.map(l => l.post_id);
    const { data } = await db.from('posts').select().in('id', postIds).order('created_at', { ascending: false }).get();
    if (!data || data.length === 0) { mineContent.innerHTML = '<div class="tip">还没有点赞过帖子</div>'; return; }
    mineContent.innerHTML = data.map(renderCompactPost).join('');
    bindMineDeleteEvents();
  } catch (err) { mineContent.innerHTML = '<div class="tip">加载失败</div>'; }
}

async function loadMineComments() {
  const mineContent = $('#mineContent');
  mineContent.innerHTML = '<div class="tip">加载中...</div>';
  try {
    const { data: comments } = await db.from('comments').select('post_id').eq('nickname', currentUser).get();
    if (!comments || comments.length === 0) { mineContent.innerHTML = '<div class="tip">还没有评论过帖子</div>'; return; }
    const postIds = [...new Set(comments.map(c => c.post_id))];
    const { data } = await db.from('posts').select().in('id', postIds).order('created_at', { ascending: false }).get();
    if (!data || data.length === 0) { mineContent.innerHTML = '<div class="tip">还没有评论过帖子</div>'; return; }
    mineContent.innerHTML = data.map(renderCompactPost).join('');
    bindMineDeleteEvents();
  } catch (err) { mineContent.innerHTML = '<div class="tip">加载失败</div>'; }
}

function bindMineDeleteEvents() {
  const mineContent = $('#mineContent');
  mineContent.querySelectorAll('.btn-delete-post').forEach(b => {
    b.addEventListener('click', () => {
      if (confirm('确定要删除这条帖子吗？此操作不可恢复。')) {
        deleteMinePost(b.dataset.id);
      }
    });
  });
}

async function deleteMinePost(postId) {
  try {
    await db.from('likes').delete().eq('post_id', postId).exec();
    await db.from('comments').delete().eq('post_id', postId).exec();
    await db.from('posts').delete().eq('id', postId).exec();
    showToast('帖子已删除');
    const activeTab = document.querySelector('.mine-tab.active');
    if (activeTab) {
      if (activeTab.dataset.tab === 'myPosts') loadMinePosts();
      else if (activeTab.dataset.tab === 'myLikes') loadMineLikes();
      else if (activeTab.dataset.tab === 'myComments') loadMineComments();
    }
    loadPosts();
  } catch (err) { showToast('删除失败'); }
}

function renderCompactPost(p) {
  const imgs = p.images ? (typeof p.images === 'string' ? JSON.parse(p.images) : p.images) : [];
  const imgHtml = imgs.length ? '<div class="post-images">' + imgs.map(u => '<img src="' + escapeHtml(u) + '" onclick="event.stopPropagation();openImageViewer(\'' + escapeHtml(u).replace(/'/g, "\\'") + '\')" />').join('') + '</div>' : '';
  return '<div class="post-card">' +
    '<div class="post-header"><div class="post-avatar">' + getAvatarEmoji(p.nickname) + '</div>' +
    '<span class="post-nickname">' + escapeHtml(p.nickname) + '</span>' +
    '<span class="post-time">' + formatTime(p.created_at) + '</span></div>' +
    '<div class="post-body">' + escapeHtml(p.content) + '</div>' + imgHtml +
    '<div class="post-actions-compact">' +
    '<span>❤️ ' + (p.like_count || 0) + '</span><span>💬 ' + (p.comment_count || 0) + '</span>' +
    '<button class="btn-delete-post" data-id="' + p.id + '" style="margin-left:auto;background:#e74c3c;color:#fff;border:none;padding:4px 10px;border-radius:6px;cursor:pointer">删除</button>' +
    '</div></div>';
}

// "我的" 页面 Tab 切换
function bindMineTabs() {
  document.querySelectorAll('.mine-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mine-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (tab.dataset.tab === 'myPosts') loadMinePosts();
      else if (tab.dataset.tab === 'myLikes') loadMineLikes();
      else if (tab.dataset.tab === 'myComments') loadMineComments();
    });
  });
}

// 编辑资料
function bindProfileEvents() {
  const profileModal = $('#profileModal');
  const btnEditProfile = $('#btnEditProfile');
  btnEditProfile.addEventListener('click', () => { profileModal.classList.add('active'); });

  $('#btnSaveProfile').addEventListener('click', async () => {
    const newNick = $('#editNickname').value.trim();
    const oldPwd = $('#editOldPwd').value;
    const newPwd = $('#editNewPwd').value;
    if (!newNick) { showToast('请输入新昵称'); return; }
    if (newNick.length > 12) { showToast('昵称最多12个字'); return; }
    if (!oldPwd) { showToast('请输入原密码'); return; }

    try {
      const { data } = await db.from('users').select('password_hash').eq('nickname', currentUser).get();
      if (!data || data.length === 0) { showToast('用户不存在'); return; }
      const parts = (data[0].password_hash || '').split(':');
      let pwdOk = false;
      if (parts.length === 1) {
        pwdOk = data[0].password_hash === await sha256(oldPwd);
      } else {
        pwdOk = parts[1] === await sha256s(parts[0], oldPwd);
      }
      if (!pwdOk) { showToast('原密码错误'); return; }

      const updateData = { nickname: newNick };
      if (newPwd) {
        const pwdErr = validatePassword(newPwd);
        if (pwdErr) { showToast(pwdErr); return; }
        const newSalt = generateSalt();
        updateData.password_hash = newSalt + ':' + await sha256s(newSalt, newPwd);
      }

      await db.from('users').update(updateData).eq('nickname', currentUser);
      currentUser = newNick;
      localStorage.setItem('campus_wall_nickname', newNick);
      $('#headerUser').textContent = '👤 ' + newNick;
      loadMinePage();
      profileModal.classList.remove('active');
      showToast('资料已更新');
    } catch (err) { showToast('更新失败'); }
  });

  profileModal.addEventListener('click', e => {
    if (e.target === profileModal) profileModal.classList.remove('active');
  });
  document.querySelector('[data-modal="profileModal"]').addEventListener('click', () => {
    profileModal.classList.remove('active');
  });
}
