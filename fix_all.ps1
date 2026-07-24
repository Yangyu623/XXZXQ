node -e "
const fs = require('fs');
let code = fs.readFileSync('js/posts.js', 'utf8');

// Replace renderPostCard function with clean version
const oldFn = code.substring(
  code.indexOf('function renderPostCard'),
  code.indexOf('function bindPostEvents')
);

const newFn = `function renderPostCard(p, i, likedSet) {
  const imgs = p.images ? (typeof p.images === 'string' ? JSON.parse(p.images) : p.images) : [];
  const imgHtml = imgs.length ? '<div class=\"post-images\">' + imgs.map(u => '<img src=\"' + escapeHtml(u) + '\" onclick=\"event.stopPropagation();openImageViewer(\\'' + escapeHtml(u).replace(/'/g, \"\\\\'\") + '\\')\" />').join('') + '</div>' : '';
  return '<div class=\"post-card\" style=\"animation-delay:' + (i * 0.03) + 's\">' +
    '<div class=\"post-header\"><div class=\"post-avatar\">' + getAvatarEmoji(p.nickname) + '</div>' +
    '<span class=\"post-nickname\">' + (p.is_anonymous ? '\u533f\u540d\u7528\u6237' : escapeHtml(p.nickname)) + '</span>' +
    '<span class=\"post-time\">' + formatTime(p.created_at) + '</span></div>' +
    '<div class=\"post-body\">' + escapeHtml(p.content) + '</div>' + imgHtml +
    '<div class=\"post-actions\">' +
    '<div class=\"act ' + ((likedSet && likedSet.has(p.id)) ? 'liked' : '') + '\" data-action=\"like\" data-id=\"' + p.id + '\">' +
    '<span class=\"act-icon\">' + ((likedSet && likedSet.has(p.id)) ? '\u2764' : '\u2728') + '</span>' +
    '<span class=\"like-count\">' + (p.like_count || 0) + '</span></div>' +
    '<div class=\"act\" data-action=\"comment\" data-id=\"' + p.id + '\">' +
    '<span class=\"act-icon\">\uD83D\uDCAC</span><span>' + (p.comment_count || 0) + '</span></div>' +
    (window.isAdmin ? '<div class=\"act act-delete\" data-action=\"deletePost\" data-id=\"' + p.id + '\"><span class=\"act-icon\">\uD83D\uDDD1</span>\u5220\u9664</div>' : '') +
    '</div></div>';
}

`;

code = code.replace(oldFn, newFn);
fs.writeFileSync('js/posts.js', code, 'utf8');
console.log('Fixed posts.js');
"@
