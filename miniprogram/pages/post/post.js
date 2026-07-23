// pages/post/post.js
const db = wx.cloud.database();
const app = getApp();

Page({
  data: {
    content: '',
    images: [],
    isAnonymous: false,
    submitting: false
  },

  // 输入内容
  onInput(e) {
    this.setData({ content: e.detail.value });
  },

  // 切换匿名
  toggleAnonymous() {
    this.setData({ isAnonymous: !this.data.isAnonymous });
  },

  // 选择图片
  chooseImage() {
    const remain = 9 - this.data.images.length;
    if (remain <= 0) {
      wx.showToast({ title: '最多上传9张图片', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        this.uploadImages(res.tempFiles);
      }
    });
  },

  // 上传图片到云存储
  uploadImages(files) {
    wx.showLoading({ title: '上传中...' });
    const promises = files.map(file => {
      const cloudPath = 'post-images/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.jpg';
      return wx.cloud.uploadFile({
        cloudPath,
        filePath: file.tempFilePath
      });
    });

    Promise.all(promises).then(results => {
      const urls = results.map(r => r.fileID);
      this.setData({ images: [...this.data.images, ...urls] });
      wx.hideLoading();
    }).catch(err => {
      console.error('上传失败', err);
      wx.hideLoading();
      wx.showToast({ title: '图片上传失败', icon: 'none' });
    });
  },

  // 删除图片
  deleteImage(e) {
    const { index } = e.currentTarget.dataset;
    const images = this.data.images;
    images.splice(index, 1);
    this.setData({ images });
  },

  // 提交帖子
  submit() {
    const { content, images, isAnonymous } = this.data;
    if (!content.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });

    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {};
    const postData = {
      content: content.trim(),
      images,
      isAnonymous,
      nickName: userInfo.nickName || '匿名用户',
      avatarUrl: userInfo.avatarUrl || '',
      likeCount: 0,
      commentCount: 0,
      createTime: db.serverDate()
    };

    db.collection('posts').add({ data: postData })
      .then(() => {
        wx.showToast({ title: '发布成功', icon: 'success' });
        this.setData({ content: '', images: [], isAnonymous: false, submitting: false });
        // 延迟跳转回广场
        setTimeout(() => {
          wx.switchTab({ url: '/pages/square/square' });
        }, 1000);
      })
      .catch(err => {
        console.error('发布失败', err);
        this.setData({ submitting: false });
        wx.showToast({ title: '发布失败，请重试', icon: 'none' });
      });
  }
});
