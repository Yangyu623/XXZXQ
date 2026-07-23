// pages/square/square.js
const db = wx.cloud.database();
const _ = db.command;
const app = getApp();

Page({
  data: {
    posts: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    refreshing: false
  },

  onLoad() {
    this.loadPosts();
  },

  onShow() {
    // 从发帖页回来时刷新
    if (this.data.posts.length > 0) {
      this.onRefresh();
    }
  },

  // 加载帖子列表
  loadPosts() {
    if (this.data.loading || !this.data.hasMore) return;
    this.setData({ loading: true });

    db.collection('posts')
      .orderBy('createTime', 'desc')
      .skip((this.data.page - 1) * this.data.pageSize)
      .limit(this.data.pageSize)
      .get()
      .then(res => {
        const posts = this.data.page === 1 ? res.data : [...this.data.posts, ...res.data];
        this.setData({
          posts,
          loading: false,
          refreshing: false,
          hasMore: res.data.length >= this.data.pageSize,
          page: this.data.page + 1
        });
        // 加载每条帖子的点赞状态
        this.loadUserLikes(res.data);
      })
      .catch(err => {
        console.error('加载帖子失败', err);
        this.setData({ loading: false, refreshing: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  // 加载用户点赞状态
  loadUserLikes(posts) {
    const postIds = posts.map(p => p._id);
    db.collection('likes')
      .where({
        postId: _.in(postIds),
        _openid: '{openid}'
      })
      .get()
      .then(res => {
        const likedIds = new Set(res.data.map(l => l.postId));
        const posts = this.data.posts.map(p => ({
          ...p,
          isLiked: likedIds.has(p._id)
        }));
        this.setData({ posts });
      });
  },

  // 下拉刷新
  onRefresh() {
    this.setData({ page: 1, hasMore: true, refreshing: true });
    this.loadPosts();
  },

  // 上拉加载更多
  onReachBottom() {
    this.loadPosts();
  },

  // 点赞/取消点赞
  toggleLike(e) {
    const { id, index } = e.currentTarget.dataset;
    const post = this.data.posts[index];
    if (!post) return;

    const isLiked = !post.isLiked;
    const posts = this.data.posts;
    posts[index].isLiked = isLiked;
    posts[index].likeCount = (posts[index].likeCount || 0) + (isLiked ? 1 : -1);
    this.setData({ posts });

    wx.cloud.callFunction({
      name: 'toggleLike',
      data: { postId: id, isLiked }
    }).catch(err => {
      // 回滚
      posts[index].isLiked = !isLiked;
      posts[index].likeCount = (posts[index].likeCount || 0) + (isLiked ? -1 : 1);
      this.setData({ posts });
    });
  },

  // 跳转详情
  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  }
});
