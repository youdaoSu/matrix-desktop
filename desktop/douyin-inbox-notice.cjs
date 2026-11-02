// Display-only rules verified against public DouyinChat 1.1.33 module 49812.
// No HTML evaluation, action dispatch, profile fetch, or archive mutation.
const record = v => v && typeof v === 'object' && !Array.isArray(v);
const clean = v => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, 24000) : '';
const uid = v => typeof v === 'string' && /^[1-9]\d{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n ? v : Number.isSafeInteger(v) && v > 0 ? String(v) : undefined;
const aweType = value => Number.isSafeInteger(value) ? value : typeof value === 'string' && /^\d{1,9}$/.test(value) ? Number(value) : undefined;
function participants(value, context = {}) {
  const own = uid(context.ownUid), list = Array.isArray(value) ? value.slice(0, 100) : [];
  return list.filter(record).map(person => {
    const id = uid(person.uid), nickname = clean(person.nickname ?? person.nick_name ?? person.display_name ?? person.displayName).trim().slice(0, 200);
    // The engine supplies only already verified account-local profile names.
    const resolved = id && typeof context.resolveName === 'function' ? clean(context.resolveName(id)).trim().slice(0, 200) : '';
    return { own: !!own && id === own, name: resolved || nickname || '（姓名未提供）' };
  });
}
const join = people => people.map(p => p.name).join('、');
function groups(value, context) {
  return { active: participants(value.active_users ?? value.activeUsers, context), passive: participants(value.passive_users ?? value.passiveUsers, context) };
}
function localizedGroupNotice(value, context = {}) {
  if (!record(value) || !Array.isArray(value.locale_resources) || value.locale_resources.length > 32) return;
  const resource = value.locale_resources.find(r => record(r) && r.lang === 'zh-Hans');
  if (typeof resource?.text !== 'string' || !resource.text.trim() || resource.text.length > 24000) return;
  const { active, passive } = groups(value, context), awe = aweType(value.aweType ?? value.awe_type);
  const activeSelf = [100106, 100111, 100112, 100113, 100114].includes(awe) && active.some(p => p.own);
  const names = [activeSelf ? '你' : join(active), join(passive)];
  let missing = false, replacements = 0;
  // Single pass: braces in nicknames are literal, never another template.
  const rendered = clean(resource.text).replace(/(?<!\{)\{(\d{1,3})\}(?!\})/g, (_token, number) => {
    if (++replacements > 200 || !names[Number(number)]) { missing = true; return '（信息未提供）'; }
    return names[Number(number)];
  }).slice(0, 24000);
  return { text: rendered, ...(missing ? { contentNote: '平台未提供提示中的部分名称信息，未猜测为某个用户' } : {}) };
}
function contextualGroupNotice(value, context = {}) {
  if (!record(value) || !uid(context.ownUid)) return;
  const { active, passive } = groups(value, context), a = join(active), p = join(passive);
  const isActive = active.some(person => person.own), isPassive = passive.some(person => person.own);
  switch (aweType(value.aweType ?? value.awe_type)) {
    case 100100:
      if (!a || !p) return;
      return { text: isActive ? `你邀请了${p}加入群聊` : isPassive ? `${a}邀请你${passive.some(person => !person.own) ? '、' + join(passive.filter(person => !person.own)) : ''}加入群聊` : `${a}邀请了${p}加入群聊` };
    case 100101:
      if (!a || !p) return;
      return { text: isActive ? `${p}通过你分享的口令加入群聊` : isPassive ? `你通过${a}分享的口令加入群聊` : `${p}通过${a}分享的口令加入群聊` };
    case 100104:
      if (isActive && p) return { text: value.remove_user_type === 1 ? `系统将超过7天未续费成员${join(passive.filter(person => !person.own))}移出了群聊` : `你将${join(passive.filter(person => !person.own))}移出了群聊` };
      if (isPassive) return { text: value.remove_user_type === 1 ? '由于你超过7天未续费，已被自动移出群聊，续费后可重新申请进群' : '你已被移出群聊' };
      return;
    case 100110:
      if (p) return { text: isPassive ? '你已被群主设为管理员' : `${p}已被群主设为管理员` };
      return;
    case 100115:
      if (a) return { text: isActive ? '你修改了群头像' : `${a}修改了群头像` };
      return;
    default: return;
  }
}
function noticeLink(value) {
  try {
    if (typeof value !== 'string' || value.length > 4096) return;
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.hostname !== 'www.douyin.com' || u.username || u.password || u.port || u.search || u.hash) return;
    if (!/^\/user\/MS4w[A-Za-z0-9_-]{1,256}$/.test(u.pathname) && !/^\/video\/[1-9]\d{0,18}$/.test(u.pathname)) return;
    return u.href;
  } catch {}
}
function decorateGroupNotice(result, value, context = {}) {
  if (!result || !record(value)) return result;
  const spans = [], body = result.text;
  const add = (label, linkUrl) => {
    if (!label || label.length > 2000) return;
    let at = -1;
    for (let count = 0; count < 100 && (at = body.indexOf(label, at + 1)) >= 0; count++) {
      const end = at + label.length;
      if (spans.length >= 100 || spans.some(s => at < s.start + s.length && s.start < end)) continue;
      spans.push({ start: at, length: label.length, ...(linkUrl ? { linkUrl } : {}) });
    }
  };
  // Group template keys are literal highlighted substrings, not {{key}} IDs.
  if (Array.isArray(value.template) && value.template.length <= 100) for (const item of value.template) {
    if (!record(item) || !record(item.extra) || ![1, '1'].includes(item.extra.is_full_text_match)) continue;
    add(clean(item.key), noticeLink(item.link));
  }
  const { active, passive } = groups(value, context);
  for (const person of [...active, ...passive]) if (person.name !== '（姓名未提供）') add(person.name);
  return { ...result, ...(spans.length ? { mentions: spans.sort((a, b) => a.start - b.start) } : {}) };
}
module.exports = { localizedGroupNotice, contextualGroupNotice, decorateGroupNotice, noticeLink };
