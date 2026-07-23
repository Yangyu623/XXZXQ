// js/utils.js — 工具函数

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function showToast(msg) {
  const toastEl = $('#toast');
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 1800);
}

function formatTime(d) {
  if (!d) return '';
  const t = new Date(d), n = new Date();
  const diff = n - t;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return (t.getMonth() + 1) + '月' + t.getDate() + '日 ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
}

function getAvatarEmoji(name) {
  const e = ['😊','🌟','🎈','🌸','🍀','🐣','🦊','🐱','🐶','🐼','🐨','🐯','🦁','🐸','🐵','🐮','🐷','🐭','🐹','🐰'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return e[Math.abs(h) % e.length];
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function openImageViewer(url) {
  document.getElementById('viewerImg').src = url;
  document.getElementById('imageViewer').classList.add('active');
}
