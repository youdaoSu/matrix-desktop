// The self reader compares the bound public handle with the live self profile.
// UID is evidence, not a replacement for the public handle. No nickname proof.
async function readPublishIdentity(options, acquire) {
  if (!/^[A-Za-z0-9_.-]{2,80}$/.test(options.publicHandle || '') || typeof options.assertCurrent !== 'function') throw Error('发布账号绑定编号无效');
  let client;
  try {
    await options.assertCurrent();
    client = await acquire({ ...options, independent: true });
    await client.check();
    await options.assertCurrent();
    const uid = client.ownUid;
    if (typeof uid !== 'string' || !/^[1-9]\d{0,18}$/.test(uid) || BigInt(uid) > 9223372036854775807n) throw Error('官网本人 UID 结构无效，未放行提交');
    return { key: options.publicHandle, ownUid: uid, source: 'douyin-self-profile' };
  } finally { client?.close(); }
}
module.exports = { readPublishIdentity };
