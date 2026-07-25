// js/post-form.js — 发帖


// 图片压缩（最大宽1200px，质量0.8）
async function compressImage(file) {
  // Skip if already <= 5MB
  if (file.size <= 5 * 1024 * 1024) return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX_W = 1200;
      let w = img.width, h = img.height;
      if (w > MAX_W) { h = h * MAX_W / w; w = MAX_W; }

      const tryCompress = (quality, maxW) => {
        let cw = w, ch = h;
        if (cw > maxW) { ch = ch * maxW / cw; cw = maxW; }
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);
        canvas.toBlob(blob => {
          if (!blob) { resolve(file); return; }
          if (blob.size <= 5 * 1024 * 1024 || quality <= 0.3) {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          } else {
            tryCompress(quality - 0.15, maxW * 0.7);
          }
        }, 'image/jpeg', quality);
      };

      tryCompress(0.8, MAX_W);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

function renderImageGrid() {
  const imageGrid = $('#imageGrid');
  if (!selectedImages || selectedImages.length === 0) { imageGrid.innerHTML = ''; return; }
  imageGrid.innerHTML = selectedImages.map((f, i) =>
    '<div class="img-preview" style="position:relative;display:inline-block;margin:4px">' +
    '<img src="' + URL.createObjectURL(f) + '" style="width:80px;height:80px;object-fit:cover;border-radius:8px" />' +
    '<span onclick="removeImage(' + i + ')" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;background:#e74c3c;color:#fff;border-radius:50%;text-align:center;line-height:20px;font-size:12px;cursor:pointer">✕</span>' +
    '</div>'
  ).join('');
}

function removeImage(index) {
  selectedImages.splice(index, 1);
  renderImageGrid();
}

function bindPostFormEvents() {
  const btnPickImage = $('#btnPickImage');
  const fileInput = $('#fileInput');
  const postContent = $('#postContent');
  const charCount = $('#charCount');
  const submitPost = $('#submitPost');

  btnPickImage.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files);
    if (files.length + selectedImages.length > 9) { showToast('最多9张图片'); return; }
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    for (const f of files) {
      if (!f.type.startsWith('image/')) { showToast('仅支持图片文件'); continue; }
      if (f.size > MAX_SIZE) { showToast(f.name + ' 超过10MB限制'); continue; }
      selectedImages.push(f);
    }
    renderImageGrid();
    fileInput.value = '';
  });

  postContent.addEventListener('input', () => {
    charCount.textContent = postContent.value.length;
  });

  // ?????30??
  let postCooldown = 0;
  function getPostCooldown() {
    const last = localStorage.getItem('post_last_attempt');
    if (!last) return 0;
    return Math.max(0, 30000 - (Date.now() - parseInt(last)));
  }

  submitPost.addEventListener('click', async () => {
    const cd = getPostCooldown();
    if (cd > 0) { showToast('发帖太快，请 ' + Math.ceil(cd / 1000) + ' 秒后再试'); return; }

    const content = postContent.value.trim();
    if (!content && selectedImages.length === 0) { showToast('请输入内容或选择图片'); return; }
    submitPost.disabled = true;
    submitPost.textContent = '发布中...';
   
    const bannedHits = await checkBannedWords(content);
    if (bannedHits.length > 0) {
      showToast('内容包含违禁词：' + bannedHits.join('、'));
      return;
    }
      const isAnonymous = document.getElementById('anonCheck') ? document.getElementById('anonCheck').checked : false;
      try {
      let imageUrls = [];
      if (selectedImages.length > 0) {
        for (const f of selectedImages) {
          const compressed = await compressImage(f);
          const url = await uploadImage(compressed);
          imageUrls.push(url);
        }
      }
      await db.rpc('create_post_rpc', {
      p_account: currentUser,
      p_nickname: currentUserNickname || currentUser,
      p_content: content,
      p_is_anonymous: isAnonymous,
      p_images: JSON.stringify(imageUrls)
    });
      showToast('????');
      postContent.value = '';
      selectedImages = [];
      renderImageGrid();
    } catch (err) {
      showToast('发布失败: ' + (err.message || '网络错误'));
    }
    submitPost.disabled = false;
    submitPost.textContent = '发布';
  });
}
