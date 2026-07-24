// js/admin.js — 管理员面板

let adminTab = 'pending';

function bindAdminEvents() {
  const adminModal = $('#adminModal');
  const userSection = $('#adminUserList');
  const searchInput = document.getElementById('adminSearchInput');
  const bwSection = document.getElementById('bannedWordsSection');
  const btnClear = $('#btnClearRejected');

  function switchAdminTab(tab) {
    adminTab = tab;
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    if (tab === 'bannedWords') {
      document.getElementById('tabBannedWords').classList.add('active');
      if (userSection) userSection.style.display = 'none';
      if (searchInput) searchInput.style.display = 'none';
      if (btnClear) btnClear.style.display = 'none';
      if (bwSection) bwSection.style.display = 'block';
      loadBannedWords();
    } else {
      document.getElementById(tab === 'pending' ? 'tabPending' : 'tabApproved').classList.add('active');
      if (userSection) userSection.style.display = '';
      if (searchInput) searchInput.style.display = '';
      if (btnClear) btnClear.style.display = '';
      if (bwSection) bwSection.style.display = 'none';
      loadAdminUsers();
    }
  }

  $('#btnAdminPanel').addEventListener('click', () => {
    document.getElementById('adminSearchInput').value = '';
    adminModal.classList.add('active');
    switchAdminTab('pending');
  });

  $('#tabPending').addEventListener('click', () => switchAdminTab('pending'));
  $('#tabApproved').addEventListener('click', () => switchAdminTab('approved'));
  
  var tabBw = document.getElementById('tabBannedWords');
  if (tabBw) tabBw.addEventListener('click', () => switchAdminTab('bannedWords'));

  if (searchInput) searchInput.addEventListener('input', () => { loadAdminUsers(); });

  adminModal.addEventListener('click', e => {
    if (e.target === adminModal) adminModal.classList.remove('active');
  });

  document.querySelector('[data-modal="adminModal"]').addEventListener('click', () => {
    adminModal.classList.remove('active');
  });
  if (btnClear) btnClear.addEventListener('click', clearRejectedUsers);
  
  bindBannedWordEvents();
}

async function clearRejectedUsers() {
  if (!confirm('确定要删除所有已拒绝的用户吗？此操作不可恢复。')) return;
  try {
    await db.rpc('clear_rejected', { p_admin_account: currentUser });
    showToast('已清空所有已拒绝用户');
    loadAdminUsers();
  } catch (err) { showToast('操作失败'); }
}

async function loadAdminUsers() {
  const list = $('#adminUserList');
  const keyword = (document.getElementById('adminSearchInput').value || '').trim().toLowerCase();
  list.innerHTML = '<div class="tip">加载中...</div>';
  try {
    const { data } = adminTab === 'pending'
      ? await db.from('users').select('account,nickname,status,is_admin,created_at').eq('status', 'pending').order('created_at').get()
      : await db.from('users').select('account,nickname,status,is_admin,created_at').eq('status', 'approved').order('created_at').get();

    const filtered = keyword ? (data || []).filter(u => (u.nickname || u.account || '').toLowerCase().includes(keyword)) : (data || []);

    if (!filtered || filtered.length === 0) {
      list.innerHTML = '<div class="tip">' + (keyword ? '没有匹配用户' : (adminTab === 'pending' ? '没有待审核用户' : '没有已通过用户')) + '</div>';
      return;
    }

    list.innerHTML = filtered.map(u => '<div class="admin-user-item">' +
      '<div class="admin-user-info">' +
      '<div class="admin-user-avatar">' + getAvatarEmoji(u.nickname) + '</div>' +
      '<div><div class="admin-user-name">' + escapeHtml(u.account) + (u.is_admin ? ' 🛡️' : '') + '</div>' +
      '<div class="admin-user-time">' + formatTime(u.created_at) + '</div></div>' +
      '</div>' +
      (adminTab === 'pending'
        ? '<div class="admin-actions">' +
          '<button class="btn-approve" data-account="' + escapeHtml(u.account) + '">通过</button>' +
          '<button class="btn-reject" data-account="' + escapeHtml(u.account) + '">拒绝</button></div>'
        : '<div class="admin-actions"><span class="badge-status badge-approved">已通过</span>' +
          (u.is_admin ? '' : '<button class="btn-disable" data-account="' + escapeHtml(u.account) + '">禁用</button>') + '</div>'
      ) +
      '</div>').join('');

    list.querySelectorAll('.btn-approve').forEach(b => b.addEventListener('click', () => { approveUser(b.dataset.account); }));
    list.querySelectorAll('.btn-reject').forEach(b => b.addEventListener('click', () => { rejectUser(b.dataset.account); }));
    list.querySelectorAll('.btn-disable').forEach(b => b.addEventListener('click', () => disableUser(b.dataset.account)));
  } catch (err) { list.innerHTML = '<div class="tip">加载失败</div>'; }
}

async function approveUser(account) {
  try {
    await db.rpc('approve_user_rpc', { p_admin_account: currentUser, p_target_account: account, p_action: 'approve' });
    showToast('已通过 ' + account);
    loadAdminUsers();
  } catch (err) { showToast('网络错误: ' + (err.message || '未知')); }
}

async function rejectUser(account) {
  try {
    await db.rpc('approve_user_rpc', { p_admin_account: currentUser, p_target_account: account, p_action: 'reject' });
    showToast('已拒绝 ' + account);
    loadAdminUsers();
  } catch (err) { showToast('网络错误: ' + (err.message || '未知')); }
}

async function disableUser(account) {
  if (!confirm('确定要禁用用户 "' + account + '" 吗？\n该用户的所有帖子、评论、点赞都将被删除。')) return;
  try {
    await db.rpc('approve_user_rpc', { p_admin_account: currentUser, p_target_account: account, p_action: 'disable' });
    showToast('用户 ' + account + ' 已被禁用');
    loadAdminUsers();
    loadPosts();
  } catch (err) { showToast('操作失败'); }
}

// ===== ????? =====
async function loadBannedWords() {
  const list = document.getElementById('bannedWordsList');
  if (!list) return;
  list.innerHTML = '<div class="tip">加载中...</div>';
  try {
    const { data } = await db.from('banned_words').select('word,created_by,created_at').order('created_at').get();
    if (!data || data.length === 0) {
      list.innerHTML = '<div class="tip">暂无违禁词</div>';
      return;
    }
    list.innerHTML = data.map(w => 
      '<div class="bw-item"><span>' + escapeHtml(w.word) + '</span>' +
      '<button class="btn btn-sm btn-danger" onclick="removeBannedWord(\'' + escapeHtml(w.word) + '\')">??</button></div>'
    ).join('');
  } catch (e) { list.innerHTML = '<div class="tip">加载失败</div>'; }
}

async function addBannedWord() {
  const input = document.getElementById('bannedWordInput');
  if (!input) return;
  const word = input.value.trim();
  if (!word) { showToast('请输入违禁词'); return; }
  try {
    await db.rpc('add_banned_word', { p_admin_account: currentUser, p_word: word });
    showToast('已添加: ' + word);
    input.value = '';
    loadBannedWords();
  } catch (err) { showToast('添加失败: ' + (err.message || '未知错误')); }
}

async function removeBannedWord(word) {
  if (!confirm('确定删除违禁词  "' + word + '"?')) return;
  try {
    await db.rpc('remove_banned_word', { p_admin_account: currentUser, p_word: word });
    showToast('已添加: ' + word);
    loadBannedWords();
  } catch (err) { showToast('添加失败: ' + (err.message || '未知错误')); }
}

function bindBannedWordEvents() {
  const addBtn = document.getElementById('btnAddBannedWord');
  const input = document.getElementById('bannedWordInput');
  if (addBtn) addBtn.addEventListener('click', addBannedWord);
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') addBannedWord(); });
}
