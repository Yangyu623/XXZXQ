// pages/detail/detail.js
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    post: {},
    comments: [],
    commentText: '',
    sending: false,
    postId: ''
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ postId: options.id });
      this.loadPost(options.id);
      this.loadComments(options.id);
    }
  },

  // 加载帖子详情
  loadPost(postId) {
    db.collection('posts').doc(postId).get().then(res => {
      const post = res.data;
      // 格式化时间
      if (post.createTime) {
        const date = new Date(post.createTime);
        post.createTimeText = this.formatTime(date);
      }
      this.setData({ post });
      // 检查是否已点赞
      this.checkLiked(postId);
    });
  },

  checkLiked(postId) {
    db.collection('likes').where({
      postId,
      _openid: '{openid}'
    }).get().then(res => {
      if (res.data.length > 0) {
        this.setData({ 'post.isLiked': true });
      }
    });
  },

  // 加载评论
  loadComments(postId) {
    db.collection('comments')
      .where({ postId })
      .orderBy('createTime', 'asc')
      .get()
      .then(res => {
        const comments = res.data.map(c => {
          if (c.createTime) {
            c.createTimeText = this.formatTime(new Date(c.createTime));
          }
          return c;
        });
        this.setData({ comments });
      });
  },

  // 点赞
  toggleLike() {
    const post = this.data.post;
    const isLiked = !post.isLiked;
    const likeCount = (post.likeCount || 0) + (isLiked ? 1 : -1);
    this.setData({
      'post.isLiked': isLiked,
      'post.likeCount': likeCount
    });

    wx.cloud.callFunction({
      name: 'toggleLike',
      data: { postId: post._id, isLiked }
    }).catch(() => {
      this.setData({
        'post.isLiked': !isLiked,
        'post.likeCount': likeCount + (isLiked ? -1 : 1)
      });
    });
  },

  // 评论输入
  onCommentInput(e) {
    this.setData({ commentText: e.detail.value });
  },

  // 发送评论
  sendComment() {
    const text = this.data.commentText.trim();
    if (!text) {
      wx.showToast({ title: '请输入评论', icon: 'none' });
      return;
    }
    if (this.data.sending) return;
    this.setData({ sending: true });

    wx.cloud.callFunction({
      name: 'addComment',
      data: {
        postId: this.data.postId,
        content: text
      }
    }).then(res => {
      this.setData({ commentText: '', sending: false });
      if (res.result && res.result.success) {
        // 增加评论数
        this.setData({ 'post.commentCount': (this.data.post.commentCount || 0) + 1 });
        this.loadComments(this.data.postId);
      }
    }).catch(err => {
      console.error('评论失败', err);
      this.setData({ sending: false });
      wx.showToast({ title: '评论失败', icon: 'none' });
    });
  },

  // 时间格式化
  formatTime(date) {
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return month + '月' + day + '日 ' + date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
  }
});
