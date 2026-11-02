// Bounded projection of supplied display resources, never an arbitrary fetch API.
const { image } = require('./douyin-inbox-codec.cjs');
const { projectCommentMedia } = require('./douyin-creator-preload.cjs');
function urls(value) {
  const raw = typeof value === 'string' ? [value] : Array.isArray(value) ? value : value?.url_list ?? value?.urlList;
  const candidates=typeof raw==='string'?[raw]:Array.isArray(raw)?raw:typeof value?.url==='string'?[value.url]:typeof value?.src==='string'?[value.src]:[];
  return [...new Set(candidates.slice(0, 8).map(image).filter(Boolean))].slice(0, 4);
}
function avatars(user) {
  return [...new Set(['avatar_thumb','avatarThumb','avatar_medium','avatarMedium','avatar_larger','avatarLarger','avatar_url','avatarUrl','avatar','avatar_168x168','avatar_300x300','avatar_100x100'].flatMap(key => urls(user?.[key])))].slice(0, 4);
}
function commentImages(row) {
  return (projectCommentMedia(Array.isArray(row)?{image_list:row}:row).image_list||[]).map(item=>({urls:urls(item)})).filter(item=>item.urls.length);
}
module.exports = { avatars, commentImages };
