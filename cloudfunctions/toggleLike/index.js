// cloudfunctions/toggleLike/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { postId, isLiked } = event;

  try {
    if (isLiked) {
      // 点赞
      await db.collection('likes').add({
        data: {
          postId,
          _openid: openid,
          createTime: db.serverDate()
        }
      });
      await db.collection('posts').doc(postId).update({
        data: { likeCount: _.inc(1) }
      });
    } else {
      // 取消点赞
      await db.collection('likes').where({
        postId,
        _openid: openid
      }).remove();
      await db.collection('posts').doc(postId).update({
        data: { likeCount: _.inc(-1) }
      });
    }
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
};
