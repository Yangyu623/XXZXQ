// app.js
App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: '你的云开发环境ID',
        traceUser: true,
      });
    }

    // 获取用户信息
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo) {
      this.getUserInfo();
    }
  },

  getUserInfo: function () {
    wx.getUserProfile({
      desc: '用于展示用户昵称和头像',
      success: (res) => {
        const userInfo = res.userInfo;
        wx.setStorageSync('userInfo', userInfo);
        this.globalData.userInfo = userInfo;
      },
      fail: () => {
        // 用户拒绝授权，使用默认信息
        this.globalData.userInfo = {
          nickName: '匿名用户',
          avatarUrl: '/images/default-avatar.png'
        };
      }
    });
  },

  globalData: {
    userInfo: null
  }
});
