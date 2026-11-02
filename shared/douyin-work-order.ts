import type { DouyinInteractionWork } from './douyin-interactions';

// Explicit homepage ranks win when supplied by the homepage reader. Otherwise
// preserve the observed order of pins and sort ordinary posts by exact time.
// Never derive a date from the title, ID, comments or first cache insertion.
export function orderDouyinWorks<T extends DouyinInteractionWork>(works: readonly T[]): T[] {
  const time = (work: T) => { const value = work.publishedAt ? Date.parse(work.publishedAt) : NaN; return Number.isFinite(value) ? value : -Infinity; };
  const ranked=(work:T)=>Number.isSafeInteger(work.homepageRank)&&work.homepageRank!>=0&&work.homepageRank!<100&&typeof work.homepageOrderAt==='string'&&Number.isFinite(Date.parse(work.homepageOrderAt));
  const latest=Math.max(-Infinity,...works.filter(ranked).map(work=>Date.parse(work.homepageOrderAt!)));
  // A post published after the last observed homepage snapshot cannot be
  // placed behind that stale prefix merely because it has no old rank yet.
  const useRanks=!works.some(work=>time(work)>latest);
  return works.map((work, index) => ({work, index})).sort((a, b) => {
    const aRanked=useRanks&&ranked(a.work)&&Date.parse(a.work.homepageOrderAt!)===latest,bRanked=useRanks&&ranked(b.work)&&Date.parse(b.work.homepageOrderAt!)===latest;
    if(aRanked&&bRanked&&a.work.homepageRank!==b.work.homepageRank)return a.work.homepageRank!-b.work.homepageRank!;
    if(aRanked!==bRanked)return aRanked?-1:1;
    const pin = Number(b.work.pinned === true) - Number(a.work.pinned === true);
    if (pin) return pin;
    if (a.work.pinned && b.work.pinned) {
      const left = a.work.pinnedOrder, right = b.work.pinnedOrder;
      if (Number.isSafeInteger(left) && Number.isSafeInteger(right) && left !== right) return left! - right!;
      return a.index - b.index;
    }
    const left = time(a.work), right = time(b.work);
    return left === right ? a.index - b.index : left > right ? -1 : 1;
  }).map(item => item.work);
}
