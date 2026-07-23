// pages/mine/mine.js
const db = wx.cloud.database();
const app = getApp();

Page({
  data: {
    userInfo: {},
    myPosts: [],
    isLogin: false
  },

  onShow() {
    this.loadUser();
  },

  loadUser() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ userInfo, isLogin: true });
      this.loadMyPosts();
    }
  },

  // 微信登录
  onLogin() {
    wx.getUserProfile({
      desc: '用于展示用户昵称和头像',
      success: (res) => {
        const userInfo = res.userInfo;
        wx.setStorageSync('userInfo', userInfo);
        app.globalData.userInfo = userInfo;
        this.setData({ userInfo, isLogin: true });
        this.loadMyPosts();
      }
    });
  },

  // 加载我的帖子
  loadMyPosts() {
    db.collection('posts')
      .orderBy('createTime', 'desc')
      .get()
      .then(res => {
        this.setData({ myPosts: res.data });
      });
  },

  // 跳转详情
  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  // 删除帖子
  deletePost(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定吗？',
      success: (res) => {
        if (res.confirm) {
          db.collection('posts').doc(id).remove().then(() => {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadMyPosts();
          });
        }
      }
    });
  },

  // 切换账号
  switchAccount() {
    wx.showModal({
      title: '切换账号',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('userInfo');
          app.globalData.userInfo = null;
          this.setData({ userInfo: {}, isLogin: false, myPosts: [] });
        }
      }
    });
  }
});
