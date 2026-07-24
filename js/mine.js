// js/mine.js — "我的" 页面

async function loadMinePage() {
  if (!currentUser) return;
  $('#myNickname').textContent = currentUserNickname || currentUser;
  $('#myAvatar').textContent = getAvatarEmoji(currentUserNickname || currentUser);
  if (window.isAdmin) { $('#adminSection').style.display = 'block'; }
  else { $('#adminSection').style.display = 'none'; }
  document.querySelectorAll('.mine-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.mine-tab[data-tab="myPosts"]').classList.add('active');
  loadMinePosts();
}

async function loadMinePosts() {
  const mc = $('#mineContent');
  mc.innerHTML = '<div class="tip">加载中...</div>';
  try {
    const { data } = await db.from('posts').select().eq('nickname', currentUserNickname || currentUser).order('created_at', { ascending: false }).get();
    if (!data || data.length === 0) { mc.innerHTML = '<div class="tip">还没有发过帖子</div>'; return; }
    mc.innerHTML = data.map(renderCompactPost).join('');
    bindMineDeleteEvents();
  } catch (err) { mc.innerHTML = '<div class="tip">加载失败</div>'; }
}

async function loadMineLikes() {
  const mc = $('#mineContent');
  mc.innerHTML = '<div class="tip">加载中...</div>';
  try {
    const { data: likes } = await db.from('likes').select('post_id').eq('user_nickname', currentUserNickname || currentUser).get();
    if (!likes || likes.length === 0) { mc.innerHTML = '<div class="tip">还没有点赞过帖子</div>'; return; }
    const postIds = likes.map(l => l.post_id);
    const { data } = await db.from('posts').select().in('id', postIds).order('created_at', { ascending: false }).get();
    if (!data || data.length === 0) { mc.innerHTML = '<div class="tip">还没有点赞过帖子</div>'; return; }
    mc.innerHTML = data.map(renderCompactPost).join('');
    bindMineDeleteEvents();
  } catch (err) { mc.innerHTML = '<div class="tip">加载失败</div>'; }
}

async function loadMineComments() {
  const mc = $('#mineContent');
  mc.innerHTML = '<div class="tip">加载中...</div>';
  try {
    const { data: comments } = await db.from('comments').select('post_id').eq('nickname', currentUserNickname || currentUser).get();
    if (!comments || comments.length === 0) { mc.innerHTML = '<div class="tip">还没有评论过帖子</div>'; return; }
    const postIds = [...new Set(comments.map(c => c.post_id))];
    const { data } = await db.from('posts').select().in('id', postIds).order('created_at', { ascending: false }).get();
    if (!data || data.length === 0) { mc.innerHTML = '<div class="tip">还没有评论过帖子</div>'; return; }
    mc.innerHTML = data.map(renderCompactPost).join('');
    bindMineDeleteEvents();
  } catch (err) { mc.innerHTML = '<div class="tip">加载失败</div>'; }
}

function bindMineDeleteEvents() {
  $('#mineContent').querySelectorAll('.btn-delete-post').forEach(b => {
    b.addEventListener('click', () => {
      if (confirm('确定要删除这条帖子吗？此操作不可恢复。')) deleteMinePost(b.dataset.id);
    });
  });
}

async function deleteMinePost(postId) {
  try {
    await db.rpc('delete_post_rpc', { p_post_id: postId, p_account: currentUser });
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

function bindProfileEvents() {
  const profileModal = $('#profileModal');
  $('#btnEditProfile').addEventListener('click', () => { profileModal.classList.add('active'); });

  // 设置账号（只读）
  const accEl = document.createElement('div');
  accEl.className = 'form-group';
  accEl.innerHTML = '<label>账号（不可修改）</label><input type="text" id="profileAccount" disabled style="background:#f5f5f5" />';
  const saveBtn = $('#btnSaveProfile');
  saveBtn.parentNode.insertBefore(accEl, saveBtn);

  profileModal.addEventListener('click', e => {
    if (e.target === profileModal) profileModal.classList.remove('active');
  });
  document.querySelector('[data-modal="profileModal"]').addEventListener('click', () => {
    profileModal.classList.remove('active');
  });

  // 点击编辑时填充
  $('#btnEditProfile').addEventListener('click', () => {
    const accInput = document.getElementById('profileAccount');
    if (accInput) accInput.value = currentUser || '';
    $('#editNickname').value = currentUserNickname || '';
    $('#editOldPwd').value = '';
    $('#editNewPwd').value = '';
  });

  saveBtn.addEventListener('click', async () => {
    const newNick = $('#editNickname').value.trim();
    const oldPwd = $('#editOldPwd').value;
    const newPwd = $('#editNewPwd').value;
    if (!newNick) { showToast('请输入昵称'); return; }
    if (newNick.length > 12) { showToast('昵称最多12个字'); return; }
    if (!oldPwd) { showToast('请输入原密码'); return; }

    try {
      const { data } = await db.rpc('check_old_password', { p_account: currentUser, p_password: oldPwd });
      if (!data || data === false) { showToast('原密码错误'); return; }

      // 检查昵称修改冷却
      if (newNick !== currentUserNickname) {
        const { data: userData } = await db.from('users').select('nickname_updated_at').eq('account', currentUser).get();
        if (userData && userData.length > 0 && userData[0].nickname_updated_at) {
          const lastUpdate = new Date(userData[0].nickname_updated_at).getTime();
          const oneMonth = 30 * 24 * 60 * 60 * 1000;
          if (Date.now() - lastUpdate < oneMonth) {
            const daysLeft = Math.ceil((oneMonth - (Date.now() - lastUpdate)) / (24 * 60 * 60 * 1000));
            showToast('昵称每30天只能修改一次，还需等待 ' + daysLeft + ' 天');
            return;
          }
        }
      }

      const updateData = {};
      if (newNick !== currentUserNickname) {
        updateData.nickname = newNick;
        updateData.nickname_updated_at = new Date().toISOString();
      }
      if (newPwd) {
        const pwdErr = validatePassword(newPwd);
        if (pwdErr) { showToast(pwdErr); return; }
        const newSalt = generateSalt();
        updateData.password_hash = newSalt + ':' + await sha256s(newSalt, newPwd);
      }

      if (Object.keys(updateData).length > 0) {
        await db.from('users').update(updateData).eq('account', currentUser);
      }

      if (newNick !== currentUserNickname) {
        currentUserNickname = newNick;
        // 更新旧帖子/评论中的昵称引用（可选，这里先更新显示）
      }
      $('#headerUser').textContent = '👤 ' + currentUserNickname + (window.isAdmin ? ' 🛡️' : '');
      loadMinePage();
      profileModal.classList.remove('active');
      showToast('资料已更新');
    } catch (err) { showToast('更新失败: ' + (err.message || '')); }
  });
}