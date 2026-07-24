// js/admin.js — 管理员面板

let adminTab = 'pending';

function bindAdminEvents() {
  const adminModal = $('#adminModal');

  $('#btnAdminPanel').addEventListener('click', () => {
    adminTab = 'pending';
    document.getElementById('adminSearchInput').value = '';
    $('#tabPending').classList.add('active');
    $('#tabApproved').classList.remove('active');
    adminModal.classList.add('active');
    loadAdminUsers();
  });

  $('#tabPending').addEventListener('click', () => {
    adminTab = 'pending';
    $('#tabPending').classList.add('active');
    $('#tabApproved').classList.remove('active');
    loadAdminUsers();
  });

  $('#tabApproved').addEventListener('click', () => {
    adminTab = 'approved';
    $('#tabApproved').classList.add('active');
    $('#tabPending').classList.remove('active');
    loadAdminUsers();
  });

  document.getElementById('adminSearchInput').addEventListener('input', () => { loadAdminUsers(); });

  adminModal.addEventListener('click', e => {
    if (e.target === adminModal) adminModal.classList.remove('active');
  });

  document.querySelector('[data-modal="adminModal"]').addEventListener('click', () => {
    adminModal.classList.remove('active');
  });
  const btnClear = $('#btnClearRejected');
  if (btnClear) btnClear.addEventListener('click', clearRejectedUsers);
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
