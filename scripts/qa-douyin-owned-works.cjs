// Synthetic rendered profile cards: no official requests or real account data.
const assert = require('node:assert/strict'), vm = require('node:vm');
const { renderedWorks } = require('../desktop/douyin-browser-reader.cjs');
let checks = 0, clock = 1792512000000; const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
const own = '9007199254740993'; let links = [], end = false, ownTab = true, scrolled = 0;
const visible = { isConnected: true, getBoundingClientRect: () => ({ width: 10, height: 10 }) };
function link(id, uid = own) { return { ...visible, href: 'https://www.douyin.com/video/' + id, scrollIntoView() { scrolled++; }, __reactFiber$fixture: { memoizedProps: { awemeInfo: { aweme_id: id, desc: 'QA作品 ' + id, author: { uid } } } } }; }
const context = { URL, Date: { now: () => clock }, location: { origin: 'https://www.douyin.com', pathname: '/user/self' }, window: {}, document: {
  querySelector: () => ownTab ? {} : null,
  querySelectorAll(selector) { if (selector.startsWith('ul[')) return links; if (selector === '[data-e2e="user-post-list"]') return ownTab ? [{ ...visible, children:[{}], querySelectorAll:()=>end?[{...visible,children:[],innerText:'没有更多作品'}]:[] }] : []; return []; },
} };
const run = cursor => JSON.parse(JSON.stringify(vm.runInNewContext('(' + renderedWorks.toString() + ')(' + JSON.stringify({ expectedUid: own, cursor: cursor || '0' }) + ')', context)));
eq(run(), null);
links = [link('9007199254740010001'), link('9007199254740010002'), link('9007199254740010003', '123'), link('9007199254740010001')];
let out = run(); eq(out.aweme_list.length, 2); eq(out.aweme_list[0].author.uid, own); eq(out.max_cursor, '2'); eq(out.has_more, true); eq(scrolled, 1); eq(out.inventory_source, 'rendered-owned-posts');
eq(run('2').waiting, true); eq(scrolled, 2);
links = [link('9007199254740010004')]; out = run('2'); eq(out.aweme_list.length, 1); eq(out.aweme_list[0].aweme_id, '9007199254740010004'); eq(out.max_cursor, '3');
end = true; out = run('3'); eq(out.aweme_list, []); eq(out.has_more, false);
ownTab = false; eq(run('3').waiting, true); // A footer on likes/recommendations is not a proven own-post end.
links = [link('9007199254740010005', Number(own))]; eq(run('3').waiting, true); // Rounded IDs never prove ownership.
clock += 60000; links = [link('9007199254740010006')]; eq(run().waiting, true); out = run(); eq(out.aweme_list.length, 1); eq(out.aweme_list[0].aweme_id, '9007199254740010006'); eq(out.inventory_count, 1);
context.window.__matrixOwnedPostInventory = undefined;
links = [{ ...visible, href: 'https://www.douyin.com/video/9007199254740010007', closest: selector => selector.includes('user-favorite-list')?null:({ querySelector: () => ({ alt: 'QA无React卡片' }) }), scrollIntoView() {} }];
out = run(); eq(out.aweme_list[0].desc, 'QA无React卡片'); eq(out.aweme_list[0].author.uid, own);
context.window.__matrixOwnedPostInventory = undefined;
links = [{ ...link('9007199254740010008', '123'), closest: () => ({}) }]; eq(run(), null);
context.location.pathname = '/user/someone'; eq(run(), null);
context.location.pathname='/user/self';links=[link('9007199254740010002'),link('9007199254740010001')];links[0].__reactFiber$fixture.memoizedProps.awemeInfo.create_time=1792713600;links[1].__reactFiber$fixture.memoizedProps.awemeInfo.is_top=1;
const beforePeek=scrolled,oldInventory=JSON.stringify(context.window.__matrixOwnedPostInventory);out=JSON.parse(JSON.stringify(vm.runInNewContext('('+renderedWorks.toString()+')('+JSON.stringify({expectedUid:own,peek:true})+')',context)));
eq(out.aweme_list.map(item=>item.homepage_rank),[0,1]);eq(out.aweme_list[0].create_time,1792713600);eq(out.aweme_list[1].is_top,1);eq(scrolled,beforePeek);eq(JSON.stringify(context.window.__matrixOwnedPostInventory),oldInventory);
console.log(JSON.stringify({ checks, renderedOwnStableIdProof: true, virtualizedInventoryMergedByExactId: true, unsafeIdsRejected: true, genericEndNotPromotedToAllWorks: true, realNetwork: 0, notificationsRead: 0 }));
