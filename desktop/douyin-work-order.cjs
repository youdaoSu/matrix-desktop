// Bounded display metadata from normal owned-work records only.
function workOrder(row, index) {
  const raw=row?.create_time, n=(typeof raw==='number'||typeof raw==='string'&&/^\d{1,13}$/.test(raw))?Number(raw):NaN;
  const ms=Number.isSafeInteger(n)&&n>0?(n<4102444800?n*1000:n):NaN;
  const publishedAt=ms>=946684800000&&ms<4102444800000?new Date(ms).toISOString():undefined;
  const top=row?.is_top, pinned=[true,1,'1'].includes(top)?true:[false,0,'0'].includes(top)?false:undefined;
  const rank=row?.homepage_rank,at=row?.homepage_order_at;
  const homepage=Number.isSafeInteger(rank)&&rank>=0&&rank<100&&typeof at==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(at)&&Number.isFinite(Date.parse(at));
  return {...(publishedAt?{publishedAt}:{}),...(pinned!==undefined?{pinned}:{}),...(pinned&&Number.isSafeInteger(index)&&index>=0?{pinnedOrder:index}:{}),...(homepage?{homepageRank:rank,homepageOrderAt:at}:{})};
}
module.exports={workOrder};
