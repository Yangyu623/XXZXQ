// js/auth.js — 登录 / 注册 / 退出

// DOM 引用（auth 专用）
const auth_loginModal = () => $('#loginModal');
const auth_nicknameInput = () => $('#nicknameInput');
const auth_passwordInput = () => $('#passwordInput');
const auth_confirmInput = () => $('#confirmInput');
const auth_confirmGroup = () => $('#confirmGroup');
const auth_loginBtn = () => $('#loginBtn');
const auth_loginSub = () => $('#loginSub');
const auth_switchText = () => $('#switchText');
const auth_switchLink = () => $('#switchLink');
const auth_headerUser = () => $('#headerUser');

// 验证码
let captchaAnswer = 0;
function generateCaptcha() {
  const a = Math.floor(Math.random() * 20) + 1;
  const b = Math.floor(Math.random() * 20) + 1;
  captchaAnswer = a + b;
  const el = document.getElementById("captchaQuestion");
  if (el) el.textContent = a + " + " + b + " = ?";
}


// 登录失败限流：5次失败后锁定5分钟
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;

function getLoginLockInfo() {
  const raw = localStorage.getItem("login_lock");
  if (!raw) return { attempts: 0, lockUntil: 0 };
  try { return JSON.parse(raw); } catch (e) { return { attempts: 0, lockUntil: 0 }; }
}

function setLoginLockInfo(info) {
  localStorage.setItem("login_lock", JSON.stringify(info));
}

function isLoginLocked() {
  const info = getLoginLockInfo();
  if (info.lockUntil && Date.now() < info.lockUntil) return true;
  if (info.lockUntil && Date.now() >= info.lockUntil) {
    setLoginLockInfo({ attempts: 0, lockUntil: 0 });
  }
  return false;
}

function recordLoginFailure() {
  const info = getLoginLockInfo();
  info.attempts = (info.attempts || 0) + 1;
  if (info.attempts >= LOGIN_MAX_ATTEMPTS) {
    info.lockUntil = Date.now() + LOGIN_LOCKOUT_MS;
  }
  setLoginLockInfo(info);
}

function resetLoginLock() {
  setLoginLockInfo({ attempts: 0, lockUntil: 0 });
}

function getLockRemaining() {
  const info = getLoginLockInfo();
  if (!info.lockUntil) return 0;
  return Math.max(0, info.lockUntil - Date.now());
}
function getRegCooldown() {
  const last = localStorage.getItem("reg_last_attempt");
  if (!last) return 0;
  return Math.max(0, 5000 - (Date.now() - parseInt(last)));
}

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
  const salt = generateSalt();
  const hash = await sha256s(salt, password);
  try {
    const { error } = await db.from('users').insert({ nickname, password_hash: salt + ':' + hash });
    if (error) throw error;
    showToast('注册成功，等待管理员审核');
    auth_loginBtn().disabled = false;
    auth_loginBtn().textContent = '注 册';
  } catch (err) {
    showToast(err.message && err.message.includes('duplicate') ? '昵称已被占用' : '注册失败');
  }
}

async function doLogin(nickname, password) {
  if (isLoginLocked()) {
    const sec = Math.ceil(getLockRemaining() / 1000);
    showToast("登录已锁定，请 " + sec + " 秒后再试");
    return;
  }
  try {
    const { data } = await db.rpc('check_login', { p_nickname: nickname, p_password: password });
    if (!data || !Array.isArray(data) || data.length === 0) {
      recordLoginFailure();
      showToast('用户不存在');
      return;
    }
    const result = data[0];
    if (!result.success) {
      recordLoginFailure();
      showToast(result.error_msg || '登录失败');
      return;
    }
    doLoginSuccess(nickname, result.is_admin);
  } catch (err) {
    console.error('登录错误:', err);
    showToast('登录失败: ' + (err.message || err.toString()));
  }
}

function doLoginSuccess(nickname, isAdmin) {
  resetLoginLock();
  currentUser = nickname;
  window.isAdmin = isAdmin || false;
  localStorage.setItem('campus_wall_nickname', nickname);
  localStorage.setItem('campus_wall_is_admin', isAdmin ? '1' : '0');
  auth_loginModal().classList.remove('active');
  auth_headerUser().textContent = '👤 ' + currentUser + (isAdmin ? ' 🛡️' : '');
  loadPosts();
}

// 绑定登录/注册事件
function bindAuthEvents() {
  auth_loginBtn().addEventListener('click', async () => {
    const name = auth_nicknameInput().value.trim();
    const pwd = auth_passwordInput().value;
    if (!name) { showToast('请输入昵称'); return; }
    if (name.length > 12) { showToast('昵称最多12个字'); return; }
    if (!pwd) { showToast('请输入密码'); return; }

    if (isRegisterMode) {
      const cd = getRegCooldown();
      if (cd > 0) { showToast('请等待 ' + Math.ceil(cd / 1000) + ' 秒后再注册'); return; }
      const userAnswer = parseInt(document.getElementById('captchaInput').value);
      if (userAnswer !== captchaAnswer) {
        showToast('验证码错误，请重新计算');
        generateCaptcha();
        document.getElementById('captchaInput').value = '';
        return;
      }
    }

    auth_loginBtn().disabled = true;
    auth_loginBtn().textContent = isRegisterMode ? '注册中...' : '登录中...';
    if (isRegisterMode) {
      localStorage.setItem('reg_last_attempt', Date.now().toString());
      await doRegister(name, pwd, auth_confirmInput().value);
    } else {
      await doLogin(name, pwd);
    }
    auth_loginBtn().disabled = false;
    auth_loginBtn().textContent = isRegisterMode ? '注 册' : '登 录';
  });

  [auth_nicknameInput(), auth_passwordInput(), auth_confirmInput()].forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') auth_loginBtn().click(); });
  });

  // 登录/注册切换
  auth_switchLink().addEventListener('click', (e) => {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    if (isRegisterMode) {
      auth_loginSub().textContent = '注册账号，加入你的校园';
      auth_loginBtn().textContent = '注 册';
      auth_switchText().textContent = '已有账号？';
      auth_switchLink().textContent = '去登录';
      auth_confirmGroup().style.display = 'block';
      document.getElementById('pwdRules').style.display = 'block';
      document.getElementById('captchaGroup').style.display = 'block';
      generateCaptcha();
    } else {
      auth_loginSub().textContent = '登录账号，回到校园';
      auth_loginBtn().textContent = '登 录';
      auth_switchText().textContent = '没有账号？';
      auth_switchLink().textContent = '去注册';
      auth_confirmGroup().style.display = 'none';
      document.getElementById('pwdRules').style.display = 'none';
      document.getElementById('captchaGroup').style.display = 'none';
    }
  });
}

// 退出登录
function bindLogoutEvent() {
  const btnLogout = $('#btnLogout');
  btnLogout.addEventListener('click', () => {
    if (confirm('确定要退出登录吗？')) {
      localStorage.removeItem('campus_wall_nickname');
      currentUser = null;
      auth_headerUser().textContent = '';
      $('#postList').innerHTML = '<div class="tip">请先登录</div>';
      auth_loginModal().classList.add('active');
      $$('.panel').forEach(p => p.classList.remove('active'));
      $('#panelSquare').classList.add('active');
      $$('#bottomNav .nav-item').forEach(e => e.classList.remove('active'));
      $('#bottomNav .nav-item[data-panel="panelSquare"]').classList.add('active');
    }
  });
}

function checkLogin() {
  const saved = localStorage.getItem('campus_wall_nickname');
  if (saved) {
    currentUser = saved;
    window.isAdmin = localStorage.getItem('campus_wall_is_admin') === '1';
    auth_loginModal().classList.remove('active');
    auth_headerUser().textContent = '👤 ' + currentUser + (window.isAdmin ? ' 🛡️' : '');
    loadPosts();
  } else {
    auth_loginModal().classList.add('active');
  }
}
