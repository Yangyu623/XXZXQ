// js/post-form.js — 发帖

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

  submitPost.addEventListener('click', async () => {
    const content = postContent.value.trim();
    if (!content && selectedImages.length === 0) { showToast('请输入内容或选择图片'); return; }
    submitPost.disabled = true;
    submitPost.textContent = '发布中...';
    try {
      let imageUrls = [];
      if (selectedImages.length > 0) {
        for (const f of selectedImages) {
          const url = await uploadImage(f);
          imageUrls.push(url);
        }
      }
      await db.from('posts').insert({
        nickname: currentUser,
        content: content || '',
        images: imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
        is_anonymous: $('#anonCheck').checked,
        like_count: 0,
        comment_count: 0
      });
      showToast('发布成功！');
      postContent.value = '';
      charCount.textContent = '0';
      selectedImages = [];
      renderImageGrid();
      loadPosts();
    } catch (err) {
      showToast('发布失败: ' + (err.message || '网络错误'));
    }
    submitPost.disabled = false;
    submitPost.textContent = '发布';
  });
}
