// Own archived image attachments only. No caller URL/key, cookies, redirects,
// application writes, notification reads or execution of remote content.
const https = require('node:https');
const { createDecipheriv, createHash } = require('node:crypto');
const MAX = 8 * 1024 * 1024;
const IMAGE_ACCEPT='image/webp,image/png,image/jpeg,image/gif,*/*;q=0.1';
function mediaUrl(value) {
  try { const u = new URL(value),emoji=/(?:^|\.)douyinstatic\.com$/.test(u.hostname)&&/^\/obj\/ies-douyin-opencn\/emoji\/[a-zA-Z0-9_-]{1,160}\.(?:png|gif|webp|jpe?g)$/.test(u.pathname);if (typeof value === 'string' && value.length <= 4096 && u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.hash && (emoji||/(?:^|\.)(?:byteimg\.com|douyinpic\.com|douyincdn\.com|pstatp\.com|ibytedtos\.com|bytecdn\.cn)$/.test(u.hostname))) return u.href; } catch {}
}
function imageAttachment(raw, type, status = 0) {
  const card = [8, 77, 16, 75, 105].includes(type);
  if ((![1, 1001, 2, 27, 5].includes(type) && !card) || status !== 0 || typeof raw !== 'string' || Buffer.byteLength(raw) > 256 * 1024) throw Error('此消息不是可访问的图片、表情或作品封面');
  let value; try { value = JSON.parse(raw); } catch { throw Error('图片附件结构未识别'); }
  // Match the existing display projection exactly. Never expand a generic
  // link card or guess a cover from its target URL, work ID or attachment key.
  const sticker=[1,1001].includes(type)?require('./douyin-inbox-content.cjs').stickerResource(value):undefined;
  if([1,1001].includes(type)&&!sticker)throw Error('此消息不是可访问的图片、表情或作品封面');
  const resource = sticker??(card ? value?.cover_url ?? value?.cover : type === 5 ? value?.url : value?.resource_url), urls = [];
  const add = candidate => { const u = mediaUrl(candidate); if (u && !urls.includes(u) && urls.length < 4) urls.push(u); };
  if (typeof resource === 'string') add(resource);
  else if (resource && typeof resource === 'object' && !Array.isArray(resource)) {
    for (const field of ['thumb_url_list', 'medium_url_list', 'large_url_list', 'origin_url_list', 'url_list']) if (Array.isArray(resource[field])) for (const candidate of resource[field].slice(0, 10)) add(candidate);
    add(resource.uri);
  }
  if (!urls.length) throw Error('平台未提供可读取的图片地址，原消息保留');
  const key = typeof resource?.skey === 'string' ? resource.skey : undefined;
  // Keep old picture/sticker cache keys, but separate cover interpretation of
  // the same raw JSON so it cannot collide with an archived picture resource.
  return { urls, key, fingerprint: createHash('sha256').update(card ? 'card-cover\0' + raw : raw).digest('hex') };
}
function mime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.subarray(0,6).toString('ascii'))) return 'image/gif';
  if (bytes.length >= 12 && bytes.subarray(0,4).toString('ascii') === 'RIFF' && bytes.subarray(8,12).toString('ascii') === 'WEBP') return 'image/webp';
}
function decodeImage(bytes, key) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX) throw Error('图片附件大小超出预览限制');
  if (mime(bytes)) return bytes;
  if (!/^[a-f0-9]{64}$/i.test(key || '') || bytes.length < 28) throw Error('图片格式未识别或缺少有效解密资料，原消息保留');
  try {
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key,'hex'), bytes.subarray(0,12));
    decipher.setAuthTag(bytes.subarray(-16));
    const plain = Buffer.concat([decipher.update(bytes.subarray(12,-16)), decipher.final()]);
    if (!mime(plain)) throw Error(); return plain;
  } catch { throw Error('图片附件解密或格式校验未通过，原消息保留'); }
}
function download(url, signal) {
  return new Promise((resolve,reject) => {
    const req = https.get(url,{signal,timeout:10000,headers:{Accept:IMAGE_ACCEPT}},res=>{
      if (res.statusCode !== 200) { res.resume(); const e=Error(`图片读取返回 HTTP ${Number.isInteger(res.statusCode)?res.statusCode:'未知'}`); e.status=res.statusCode; reject(e); return; }
      const size=Number(res.headers['content-length']); if (Number.isFinite(size)&&size>MAX) { res.destroy(); reject(Error('图片附件大小超出预览限制')); return; }
      const parts=[];let length=0;
      res.on('data',part=>{length+=part.length;if(length>MAX){res.destroy();reject(Error('图片附件大小超出预览限制'));}else parts.push(part);});
      res.on('error',()=>reject(Error('图片读取中断，请稍后重试')));res.on('end',()=>resolve(Buffer.concat(parts,length)));
    });
    req.on('timeout',()=>req.destroy());req.on('error',()=>reject(Error('图片网络读取失败或超时，请稍后重试')));
  });
}
async function loadImage(descriptor, assertCurrent, network = download) {
  if (!descriptor || !Array.isArray(descriptor.urls) || descriptor.urls.length > 4 || descriptor.urls.some(u=>mediaUrl(u)!==u)) throw Error('图片附件地址不属于允许的平台资源');
  let last;
  for (const u of descriptor.urls) {
    await assertCurrent();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try { const bytes=await network(u,controller.signal);await assertCurrent();const image=decodeImage(bytes,descriptor.key);return {dataUrl:`data:${mime(image)};base64,${image.toString('base64')}`,bytes:image.length}; }
    catch(e){last=e;if([401,403,429].includes(e?.status))break;}
    finally{clearTimeout(timer);controller.abort();}
  }
  throw last || Error('平台未提供可读取的图片');
}
module.exports={imageAttachment,decodeImage,loadImage,mediaUrl,mime,MAX,IMAGE_ACCEPT};
