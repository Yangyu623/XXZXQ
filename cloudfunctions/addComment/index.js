// cloudfunctions/addComment/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { postId, content } = event;

  if (!content || !content.trim()) {
    return { success: false, error: '评论内容不能为空' };
  }

  try {
    // 从 users 集合获取用户信息
    const userRes = await db.collection('users').where({ _openid: openid }).get();
    let nickName = '匿名用户';
    let avatarUrl = '';
    if (userRes.data.length > 0) {
      nickName = userRes.data[0].nickName || nickName;
      avatarUrl = userRes.data[0].avatarUrl || '';
    }

    // 添加评论
    await db.collection('comments').add({
      data: {
        postId,
        _openid: openid,
        content: content.trim(),
        nickName,
        avatarUrl,
        createTime: db.serverDate()
      }
    });

    // 更新帖子的评论数
    await db.collection('posts').doc(postId).update({
      data: { commentCount: _.inc(1) }
    });

    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
};
