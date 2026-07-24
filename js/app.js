// js/app.js — 主入口 / 导航 / 初始化

// ========== 全局状态 ==========
let currentUser = null;
let currentUserNickname = '';
let currentPostId = null;
let isRegisterMode = true;
let selectedImages = [];
let replyTo = null;

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
    if (el.dataset.panel === 'panelPost') {
      $('#postContent').value = '';
      $('#charCount').textContent = '0';
      $('#anonCheck').checked = false;
      selectedImages = [];
      renderImageGrid();
    }
    if (el.dataset.panel === 'panelMine') loadMinePage();
  });
});

function switchTab(panelId) {
  $$('#bottomNav .nav-item').forEach(e => e.classList.remove('active'));
  $$('.panel').forEach(p => p.classList.remove('active'));
  $('#bottomNav .nav-item[data-panel="' + panelId + '"]').classList.add('active');
  $('#' + panelId).classList.add('active');
}

// ========== 评论弹窗关闭 ==========
$('#commentModal').addEventListener('click', e => {
  if (e.target === $('#commentModal')) $('#commentModal').classList.remove('active');
});
document.querySelector('[data-modal="commentModal"]').addEventListener('click', () => {
  $('#commentModal').classList.remove('active');
});

// ========== 密码规则实时检测 ==========
setTimeout(function () {
  var pr = document.getElementById("pwdRules");
  var pi = document.getElementById("passwordInput");
  if (!pr || !pi) return;
  var spans = pr.querySelectorAll(".rule");
  pi.addEventListener("input", function () {
    var p = pi.value;
    var ok = [p.length >= 8, /[A-Z]/.test(p), /[0-9]/.test(p), !p || /^[a-zA-Z0-9]+$/.test(p)];
    for (var i = 0; i < spans.length; i++) {
      if (ok[i]) { spans[i].className = "rule ok"; spans[i].innerHTML = spans[i].innerHTML.replace("✘", "✔"); }
      else { spans[i].className = "rule"; spans[i].innerHTML = spans[i].innerHTML.replace("✔", "✘"); }
    }
  });
}, 200);

// ========== 启动 ==========
generateCaptcha();
bindAuthEvents();
bindLogoutEvent();
bindPostFormEvents();
bindSendComment();
bindMineTabs();
bindProfileEvents();
bindAdminEvents();
bindSearchEvents();
checkLogin();
