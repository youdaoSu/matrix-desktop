// Read-only own-follower UI. Production leaves public transports unchanged;
// the optional clone observer remains available for compatibility regressions.
// No SDK/export lookup, generated API calls, credentials, notification entry,
// arbitrary transport URLs, or Node/IPC capability is exposed to the website.
function projectFollowerUser(raw) {
  const exact=v=>typeof v==='string'&&/^[1-9]\d{0,18}$/.test(v)?v:Number.isSafeInteger(v)&&v>0?String(v):'';
  const identity=user=>user?.uid??user?.userId??user?.user_id??user?.uid_str??user?.uidStr??user?.user_id_str;
  let user=raw;
  if(!exact(identity(user))){const nested=raw?.user??raw?.user_info??raw?.userInfo;if(nested&&typeof nested==='object')user=nested;}
  const uid=exact(identity(user));if(!uid||new Set(['uid','userId','user_id','uid_str','uidStr','user_id_str'].map(key=>exact(user?.[key])).filter(Boolean)).size>1)throw Object.assign(Error('官网粉丝编号结构未识别'),{shapeStage:typeof identity(user)==='number'&&!Number.isSafeInteger(identity(user))?'FOLLOWER_UID_PRECISION':'FOLLOWER_UID_SHAPE'});
  const text=(value,max=1000)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').slice(0,max):'';
  const resource=(value,depth=0)=>{
    if(depth>3)return [];
    if(typeof value==='string'){try{const u=new URL(value.startsWith('//')?'https:'+value:value);return u.protocol==='https:'&&!u.username&&!u.password&&u.href.length<=4096?[u.href]:[];}catch{return [];}}
    if(Array.isArray(value))return value.slice(0,8).flatMap(v=>resource(v,depth+1));
    if(!value||typeof value!=='object')return [];
    return ['url_list','urlList','urls','url','src'].flatMap(key=>resource(value[key],depth+1)).slice(0,16);
  };
  const fields=['avatar_thumb','avatarThumb','avatar_medium','avatarMedium','avatar_larger','avatarLarger','avatar_url','avatarUrl','avatar_uri','avatarUri','avatar','avatar_168x168','avatar_300x300','avatar_100x100'];
  const urls=[...new Set(fields.flatMap(key=>resource(user[key])))].slice(0,4);
  const biography=typeof user.signature==='string'?user.signature:typeof user.desc==='string'?user.desc:undefined;
  const followSource=[raw,user].flatMap(value=>['follow_time','followTime'].filter(key=>value&&Object.hasOwn(value,key)).map(key=>value[key]));
  const followed=followSource[0],followNumber=typeof followed==='string'&&/^\d{1,13}$/.test(followed)?Number(followed):followed;
  const validTime=Number.isSafeInteger(followNumber)&&(followNumber>=946684800&&followNumber<4102444800||followNumber>=946684800000&&followNumber<4102444800000);
  const followerDetailState={signature:biography!==undefined?(text(biography)?'provided':'empty'):Object.hasOwn(user,'signature')||Object.hasOwn(user,'desc')?'invalid':'missing',followTime:validTime?'provided':!followSource.length?'missing':[0,'0','',null].includes(followed)?'empty':'invalid'};
  const shape=fields.filter(key=>user[key]!=null).map(key=>key+'='+(Array.isArray(user[key])?'array':typeof user[key])).join(',')||'无';
  return {uid,nickname:text(user.nickname??user.nickName??user.screen_name,200),remark_name:text(user.remark_name??user.remarkName,200),sec_uid:text(user.sec_uid??user.secUid,256),signature:text(biography),followerDetailState,avatar_thumb:{url_list:urls},...(!urls.length?{avatarReadHint:'头像资源尚无可用地址；字段结构：'+shape}:{}),...(validTime?{follow_time:followNumber}:{})};
}
function findRenderedFollowerRoot(state) {
  const visible=e=>e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
  const text=e=>(e.innerText||e.textContent||'').trim().replace(/\s+/g,' ');
  const label=/^(?:全部)?粉丝(?:列表|指数|数)?(?:\s*[（(]?\s*[\d,.万亿]+\s*[）)]?)?$/;
  const ownEntry=state.openRequested&&state.followerControl?.isConnected&&/^(?:(?:粉丝(?:指数|数)?)\s*[\d,.万亿]*|[\d,.万亿]+\s*粉丝(?:指数|数)?)$/.test(text(state.followerControl));
  // Prefer the explicit official panel before any whole-homepage scan. Its
  // rendered props still require exact own UID + isSelf + activeTab=1 and
  // our normal own-fans click. No identity check is weakened by this order.
  const panels=[...document.querySelectorAll('[data-e2e="user-fans-container"]')].filter(visible),proved=[];state.domPanelCount=panels.length;state.domPanelOwnProof=0;state.domPanelTabMask=0;state.domPanelPropsMask=0;state.domPanelUserListCount=0;state.domRootFastPath=0;
  if(panels.length>1)return {error:'CONTROL',detail:'官网本人粉丝面板不唯一'};
  for(const panel of panels){let fiber=panel[Object.keys(panel).find(key=>key.startsWith('__reactFiber$'))],ownerMismatch=false,tabs=new Set();
    for(let n=0;fiber&&n<6;fiber=fiber.return,n++)for(const props of [fiber.memoizedProps,fiber.memoizedProps?.children?.props]){
      if(props?.isSelf!==true||![0,1].includes(props.activeTab))continue;
      const raw=props.currentUserInfo?.uid,uid=typeof raw==='string'&&/^[1-9]\d{0,18}$/.test(raw)?raw:Number.isSafeInteger(raw)&&raw>0?String(raw):'';if(!uid)continue;
      if(uid!==state.ownerUid)ownerMismatch=true;else tabs.add(props.activeTab);
      if(uid===state.ownerUid&&props.activeTab===1){
        state.domPanelPropsMask|=1;
        if(Array.isArray(props.userList)){state.domPanelPropsMask|=2;state.domPanelUserListCount=Math.max(state.domPanelUserListCount,Math.min(props.userList.length,50000));}
        if(typeof props.searchVal==='string'&&props.searchVal.length)state.domPanelPropsMask|=4;
        if(props.refContainer?.current===panel)state.domPanelPropsMask|=8;
      }
    }
    if(ownerMismatch)return {error:'OWNER',detail:'官网粉丝面板本人编号不一致，未采用其他名单'};
    if(tabs.has(0))return {error:'OWNER',detail:'官网当前为关注列表，未当作本人粉丝'};
    if(tabs.has(1)&&ownEntry){state.domPanelTabMask|=2;proved.push(panel);}
  }
  if(proved.length>1)return {error:'CONTROL',detail:'官网本人粉丝面板不唯一'};
  if(proved.length===1){state.domPanelOwnProof=1;state.domRootCount=1;state.domRootFastPath=1;return {root:proved[0]};}
  const rowControls=box=>{const items=[...box.querySelectorAll('button,[role="button"],span,div,p,a')].filter(e=>{const raw=e.textContent||'';return raw.length<=256&&/移除|回关|互相关注|相互关注|已关注/.test(raw)&&visible(e)&&/^(?:移除|回关|互相关注|相互关注|已关注)$/.test(text(e));});const selected=new Set(items);return items.filter(e=>![...e.querySelectorAll('button,[role="button"],span,div,p,a')].some(child=>selected.has(child)));};
  // A verified live layout renders its follower tab label as undefined(N).
  // Never treat that text as a follower heading. Instead corroborate the
  // exact own-fans click with follower-only row controls (or an explicit
  // zero-fan footer), anchored at the neighboring Following tab.
  const followerRows=box=>rowControls(box).filter(e=>text(e)==='移除').some(remove=>{
    for(let row=remove.parentElement,depth=0;row&&depth<4&&row!==box;row=row.parentElement,depth++){
      const controls=rowControls(row);
      if(controls.filter(e=>text(e)==='移除').length===1&&controls.filter(e=>/^(?:回关|互相关注|相互关注|已关注)$/.test(text(e))).length===1)return true;
    }return false;
  });
  const emptyFans=box=>[...box.querySelectorAll('div,p,span')].some(e=>visible(e)&&!e.children.length&&/^(?:暂无粉丝|暂时没有粉丝|还没有粉丝|你还没有粉丝)$/.test(text(e)));
  const shortHeading=e=>{if((e.children?.length||0)>8)return false;const raw=e.textContent??e.innerText??'';return raw.length<=256&&/粉丝|关注/.test(raw);};
  const headings=[...document.querySelectorAll('h1,h2,h3,h4,[role="tab"],span,div,p')].filter(e=>shortHeading(e)&&visible(e)&&(label.test(text(e))||ownEntry&&/^关注\s*[（(]\s*[\d,.万亿]+\s*[）)]$/.test(text(e)))&&!e.closest('a[href*="/user/"]')&&e!==state.followerControl&&!e.contains(state.followerControl));
  state.domFollowingHeadings=headings.filter(e=>/^关注\s*[（(]/.test(text(e))).length;
  const controls=rowControls(document);state.domRemoveControls=controls.filter(e=>text(e)==='移除').length;state.domBackFollowControls=controls.filter(e=>text(e)==='回关').length;
  state.domMutualControls=[...document.querySelectorAll('button,[role="button"],span,div,p')].filter(e=>!e.children.length&&/互相关注|相互关注|已关注/.test(e.textContent||'')&&visible(e)&&/^(?:互相关注|相互关注|已关注)$/.test(text(e))).length;
  state.domAllUserLinks=[...document.querySelectorAll('a[href*="/user/"]')].filter(visible).length;
  const avatar=image=>{const r=image.getBoundingClientRect();return visible(image)&&r.width>=28&&r.height>=28&&r.width<=192&&r.height<=192&&Math.abs(r.width-r.height)<3;};
  state.domHeadingCount=headings.length;state.domImageCount=[...document.querySelectorAll('img')].filter(avatar).length;state.domFrameCount=document.querySelectorAll('iframe').length;
  const roots=[];
  for(const heading of headings.slice(0,100))for(let box=heading,depth=0;box&&depth<10&&box!==document.body&&box!==document.documentElement;box=box.parentElement,depth++){
    if(box.contains(state.followerControl)||box.querySelector('[data-e2e="user-post-list"],[data-e2e="user-post-item"],a[href*="/video/"],a[href*="/note/"]'))break;
    const links=[...box.querySelectorAll('a[href*="/user/"]')].filter(visible);
    const empty=emptyFans(box),normalLabel=label.test(text(heading));
    if(!normalLabel&&(!ownEntry||!followerRows(box)&&!(empty&&state.ownerFollowerCount===0)))continue;
    if(!links.length&&![...box.querySelectorAll('img')].some(avatar)&&!empty&&!followerRows(box))continue;
    roots.push(box);break;
  }
  const unique=[...new Set(roots)],leaves=unique.filter(box=>!unique.some(other=>other!==box&&box.contains(other)));
  state.domRootCount=leaves.length;
  if(leaves.length!==1)return leaves.length>1?{error:'CONTROL',detail:'官网粉丝面板不唯一，未合并其他列表'}:{waiting:true,detail:'等待可核验的官网粉丝面板'};
  const root=leaves[0],selected=[...root.querySelectorAll('[role="tab"][aria-selected="true"],[role="tab"][data-state="active"]')].filter(visible);
  if(selected.some(e=>/^(?:全部)?关注(?:中)?(?:\s*[（(]?\s*[\d,.万亿]*\s*[）)]?)?$/.test(text(e))))return {error:'OWNER',detail:'官网当前为关注列表，未当作本人粉丝'};
  return {root};
}
function readRenderedFollowers(input,projectUser,state) {
  if(!state.openRequested)return;
  const found=state.findRenderedRoot();if(!found?.root)return found;
  const root=found.root,frame=input.viewportOnly&&input.viewportRoot?.getBoundingClientRect(),visibility=new WeakMap();
  const shown=(e,clip)=>{if(!e?.isConnected)return false;let value=visibility.get(e);if(!value){value={rect:e.getBoundingClientRect()};visibility.set(e,value);}const r=value.rect;if(r.width<=0||r.height<=0||clip&&frame&&(r.bottom<=frame.top||r.top>=frame.bottom))return false;if(value.displayed===undefined){const style=getComputedStyle(e);value.displayed=style.display!=='none'&&style.visibility!=='hidden';}return value.displayed;};
  const visible=e=>shown(e,true),rendered=e=>shown(e,false),text=e=>(e.innerText||e.textContent||'').trim().replace(/\s+/g,' ');
  // Only the official list footer, not arbitrary page text or member cards.
  // Presence proves the list child rendered; fixed bits distinguish an empty
  // loading footer from a visible refusal without retaining its text.
  const footers=[...root.querySelectorAll('[data-e2e="user-fans-footer"]')].filter(e=>e.isConnected&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden').slice(0,4);
  state.domFooterCount=footers.length;state.domFooterStateMask=0;state.domPanelChildCount=Math.min(root.children.length,100);
  for(const footer of footers){const value=text(footer);if(!value)state.domFooterStateMask|=1;if(footer.children.length)state.domFooterStateMask|=64;
    if(value.length>240||value&&!visible(footer))continue;
    if(/^(?:暂无粉丝|暂时没有粉丝|还没有粉丝|你还没有粉丝)$/.test(value))state.domFooterStateMask|=2;
    if(/^(?:网络异常|网络错误|加载失败|请求失败|服务异常|暂时无法加载)(?:[，,。！!：:].{0,180})?$/.test(value))state.domFooterStateMask|=4;
    if(/^(?:请先登录|登录后查看粉丝列表|登录后查看粉丝|请登录后重试)$/.test(value))state.domFooterStateMask|=8;
    if(/^(?:请完成安全验证|请完成验证后重试|需要完成安全验证|请先完成安全验证)$/.test(value))state.domFooterStateMask|=16;
    if(/^(?:暂时没有更多了|没有更多了)$/.test(value))state.domFooterStateMask|=32;
  }
  if(state.domFooterStateMask&16)return {error:'VERIFY',detail:'官网粉丝列表要求本人完成安全验证，已有名单保留'};
  if(state.domFooterStateMask&8)return {error:'LOGIN',detail:'官网粉丝列表提示请先登录，请到账号管理恢复登录，已有名单保留'};
  const index=Number(input.offset||'0'),cache=state.domFollowerPages||(state.domFollowerPages={pages:[],seen:new Map(),requested:new Set()});
  if(!Number.isSafeInteger(index)||index<0||index>5000||index>cache.pages.length)return {error:'OWNER',detail:'官网粉丝面板分页索引无效'};
  if(index&&cache.pages[index-1]?.min_time!==input.cursor)return {error:'OWNER',detail:'官网粉丝面板分页与上一页不一致'};
  if(cache.pages[index])return {data:cache.pages[index]};
  const explicitEmpty=[...root.querySelectorAll('div,p,span')].some(e=>visible(e)&&!e.children.length&&/^(?:暂无粉丝|暂时没有粉丝|还没有粉丝|你还没有粉丝)$/.test(text(e)));
  if(input.ownerFollowerCount===0&&explicitEmpty){
    if(cache.seen.size)return {waiting:true,detail:'官网空列表说明与已读成员尚未一致，原名单保留'};
    // Empty follower panels may contain recommended profiles. Neither their
    // links nor their attached UID make them followers of this account.
    const data={status_code:0,followers:[],has_more:false,min_time:'0',offset:String(index+1),myself_user_id:input.uid,total:0};cache.pages.push(data);return {data};
  }
  // The website appends rows without removing old DOM. A prefix cap freezes
  // at roughly 500 people when each card has two profile anchors. Read the
  // bounded trailing window instead; exact seen IDs retain earlier pages.
  const links=[...root.querySelectorAll('a[href*="/user/"]')].filter(visible).slice(-1000),byLink=new Map(),linkHandles=new WeakMap();
  for(const link of links){let url;try{url=new URL(link.href,location.href);}catch{continue;}const handle=/^\/user\/(MS4w[A-Za-z0-9_-]{1,256}|[1-9]\d{0,18})\/?$/.exec(url.pathname)?.[1];if(url.origin!==location.origin||!handle||handle===input.uid||handle===input.secUid||url.username||url.password)continue;if(!byLink.has(handle))byLink.set(handle,[]);byLink.get(handle).push(link);linkHandles.set(link,handle);}
  state.domProfileLinks=byLink.size;const projected=[];
  // Some current cards use DIV click handlers, not profile anchors. Their
  // exact UID must still be attached to the rendered row, and the rendered
  // nickname must corroborate that same user. Never infer an ID from a photo.
  const avatarNodes=[...root.querySelectorAll('img')].filter(image=>{const r=image.getBoundingClientRect();return visible(image)&&r.width>=28&&r.height>=28&&r.width<=192&&r.height<=192&&Math.abs(r.width-r.height)<3;}).slice(-1000);
  const actionRows=[];
  const rowControls=(box,clip=false)=>{const items=[...box.querySelectorAll('button,[role="button"],span,div,p,a')].filter(e=>{const raw=e.textContent||'';return raw.length<=256&&/移除|回关|互相关注|相互关注|已关注/.test(raw)&&(clip?visible(e):rendered(e))&&/^(?:移除|回关|互相关注|相互关注|已关注)$/.test(text(e));});const selected=new Set(items);return items.filter(e=>![...e.querySelectorAll('button,[role="button"],span,div,p,a')].some(child=>selected.has(child)));};
  const linkedContainers=new WeakMap();
  const containerShape=box=>{if(linkedContainers.has(box))return linkedContainers.get(box);const controls=rowControls(box),value={removes:controls.filter(e=>text(e)==='移除').length,backs:controls.filter(e=>/^(?:回关|互相关注|相互关注|已关注)$/.test(text(e))).length,linked:[...box.querySelectorAll('a[href*="/user/"]')].some(link=>{if(!visible(link))return false;try{const url=new URL(link.href,location.href);return url.origin===location.origin&&!url.username&&!url.password&&/^\/user\/(?:MS4w[A-Za-z0-9_-]{1,256}|[1-9]\d{0,18})\/?$/.test(url.pathname);}catch{return false;}})};linkedContainers.set(box,value);return value;};
  for(const remove of rowControls(root,true).filter(e=>text(e)==='移除').slice(-1000)){
    for(let row=remove.parentElement,depth=0;row&&depth<4&&row!==root;row=row.parentElement,depth++){
      const controls=rowControls(row);
      if(controls.filter(e=>text(e)==='移除').length===1&&(controls.filter(e=>/^(?:回关|互相关注|相互关注|已关注)$/.test(text(e))).length===1||state.panelMemberIds?.size&&controls.filter(e=>/^(?:回关|互相关注|相互关注|已关注)$/.test(text(e))).length===0)){
        // A nested operations box is not the user card. Continue to the
        // enclosing identity text before deciding if its existing link/image
        // already supplies the same row; never add a duplicate control box.
        if(!text(row).replace(/回关|移除|互相关注|相互关注|已关注/g,'').trim())continue;
        let represented=false;
        // Profile links may be siblings of a name+operations branch, not its
        // descendants. Prove a one-person enclosing card before adding an
        // anchorless candidate. Cached ancestor shapes keep this linear as
        // the website appends thousands of rows.
        for(let card=row,n=0;card&&n<5&&card!==root;card=card.parentElement,n++){const shape=containerShape(card);if(shape.removes>1)break;if(shape.removes===1&&shape.backs===1&&shape.linked){represented=true;break;}}
        if(!represented&&!row.querySelector('img,a[href*="/user/"]'))actionRows.push(row);break;
      }
    }
  }
  // A photo can be a sibling of the exact profile anchor, not its child.
  // Reuse that canonical handle only within one remove/relation-proven card.
  // This is the same link proof used above, not identity inferred from an
  // image or a normalized nickname. Conflicting attached users still fail.
  const imageFacts=new WeakMap();
  const avatarEntries=avatarNodes.filter(image=>!image.closest('a[href*="/user/"]')).map(image=>{
    let facts=state.panelMemberIds?.size?32:0;
    for(let card=image.parentElement,n=0;card&&n<8&&card!==root;card=card.parentElement,n++){
      const shape=containerShape(card);if(shape.removes===1)facts|=1;if(shape.backs===1)facts|=2;if(shape.backs===0)facts|=4;imageFacts.set(image,facts);if(shape.removes>1||shape.backs>1)break;
      if(shape.removes!==1||shape.backs!==1&&!(shape.backs===0&&state.panelMemberIds?.size))continue;
      const handles=[...new Set([...card.querySelectorAll('a[href*="/user/"]')].map(link=>linkHandles.get(link)).filter(Boolean))];
      if(handles.length===1){imageFacts.set(image,facts|8);return [handles[0],[image,...card.querySelectorAll('a[href*="/user/"]')].filter(node=>node===image||linkHandles.get(node)===handles[0]),shape.backs===0];}
      if(handles.length>1)break;
    }
    return [undefined,[image]];
  });
  const entries=[...byLink,...avatarEntries,...[...new Set(actionRows)].map(row=>[undefined,[row]])],projectedUsers=new WeakMap(),projectionFailures=new WeakMap();state.domCandidateCards=entries.length;state.domProjectedRows=0;
  for(const [handle,anchors,requiresMemberProof] of entries){
    const people=new Map();let identityFailureMask=0;
    for(const link of anchors)for(let element=link,depth=0;element&&depth<5&&root.contains(element);element=element.parentElement,depth++){
      let fiber=element[Object.keys(element).find(key=>key.startsWith('__reactFiber$'))];
      for(let n=0;fiber&&n<8;fiber=fiber.return,n++)for(const value of [fiber.memoizedProps?.user,fiber.memoizedProps?.userInfo,fiber.memoizedProps?.user_info,fiber.memoizedProps?.data,fiber.memoizedProps?.item,fiber.memoizedProps?.follower,fiber.memoizedProps]){
        if(!value||typeof value!=='object'||Array.isArray(value))continue;
        for(const [bit,key]of ['uid','userId','user_id','uid_str','uidStr','user_id_str'].entries())if(Object.hasOwn(value,key))state.domUidFields=(state.domUidFields||0)|(1<<bit);
        // A rendered user object is shared by multiple card ancestors and
        // profile links. Project it once in this synchronous snapshot only;
        // never cache identity/avatar values across pages or DOM updates.
        if(!projectedUsers.has(value)){let projected;try{projected=projectUser(value);}catch(error){projectionFailures.set(value,error?.shapeStage==='FOLLOWER_UID_PRECISION'?1:2);}projectedUsers.set(value,projected);}
        const person=projectedUsers.get(value);if(!person){identityFailureMask|=projectionFailures.get(value)||0;continue;}
        if(person.uid===input.uid){identityFailureMask|=4;continue;}
        if(handle?!(person.sec_uid===handle||person.uid===handle):![person.nickname,person.remark_name].some(name=>name&&text(element).includes(name))){identityFailureMask|=handle?8:16;continue;}
        people.set(person.uid,person);
      }
    }
    if(people.size!==1)return {waiting:true,waitReason:people.size?'identity-conflict':'identity-missing',identityCandidateKind:anchors[0]?.tagName==='IMG'?2:handle?1:3,identityFailureMask,identityImageFacts:imageFacts.get(anchors[0])||0,detail:people.size?'官网粉丝卡片身份不唯一，未猜测匹配':'等待官网粉丝卡片提供精确身份'};
    const person=[...people.values()][0];
    const memberProven=state.panelMemberIds?.has(person.uid)===true;
    // Missing relation controls are not enough on their own: the exact UID
    // must also occur in this unfiltered SELF panel's own member collection.
    if(requiresMemberProof&&!memberProven)continue;
    if(handle&&anchors[0]?.tagName==='IMG')state.domLinkedAvatarProofRows=(state.domLinkedAvatarProofRows||0)+1;
    {
      const sources=new Set(anchors);
      // On some layouts the photo is a sibling of the name/operations, not a
      // descendant of its profile anchor. Use only a one-person follower card,
      // corroborated by its remove/back-follow controls and exact profile link.
      for(const anchor of anchors)for(let card=anchor.parentElement,n=0;card&&n<5&&card!==root;card=card.parentElement,n++){
        const shape=containerShape(card);if(shape.removes>1||shape.backs>1)break;
        if(shape.removes!==1||shape.backs!==1&&!memberProven)continue;
        const nameMatches=[person.nickname,person.remark_name].some(name=>name&&text(card).includes(name));
        // Exact profile-link identity already matched this one UID above.
        // Rich nickname rendering (emoji images, NBSP or collapsed spaces)
        // must not defeat that stronger proof. Anchorless cards still need
        // their existing displayed-name corroboration; never guess by photo.
        if(!nameMatches&&!handle)continue;
        const handles=[...card.querySelectorAll('a[href*="/user/"]')].filter(visible).map(link=>{try{return /^\/user\/([^/]+)\/?$/.exec(new URL(link.href,location.href).pathname)?.[1];}catch{return;}});
        if(handles.length&&handles.every(value=>value===person.uid||value===person.sec_uid)){sources.add(card);if(!nameMatches&&handle)state.domAnchoredNameProofRows=(state.domAnchoredNameProofRows||0)+1;break;}
      }
      const boxes=[...sources];
      if(input.requireFollowerControls&&!boxes.some(box=>{const shape=containerShape(box);return shape.removes===1&&(shape.backs===1||memberProven&&shape.backs===0);})){state.domMissingControlRows=(state.domMissingControlRows||0)+1;continue;}
      if(memberProven&&boxes.some(box=>{const shape=containerShape(box);return shape.removes===1&&shape.backs===0;}))state.domMemberProofRows=(state.domMemberProofRows||0)+1;
      if(input.measureCoverage){
        const bounds=boxes.filter(box=>{const shape=containerShape(box);return shape.removes===1&&shape.backs===1;}).map(box=>box.getBoundingClientRect()).filter(rect=>rect.height>0&&rect.width>0);
        if(bounds.length){state.domCoverageSpans||=[];state.domCoverageSpans.push({top:Math.min(...bounds.map(rect=>rect.top)),bottom:Math.max(...bounds.map(rect=>rect.bottom))});}
      }
      // The official avatar component receives a fully resolved src even
      // while its DOM shows a CSS placeholder (or an image load failed).
      // Read only that supplied display prop on an exact, owner-proven card;
      // never construct a CDN URL from avatarUri or inspect hooks/closures.
      const componentUrls=new Set(),avatarElements=[...new Set(boxes.flatMap(box=>[...(box.matches?.('[data-e2e="live-avatar"]')?[box]:[]),...box.querySelectorAll('[data-e2e="live-avatar"]')]))].filter(visible).slice(0,8);
      for(const element of avatarElements){
        let fiber=element[Object.keys(element).find(key=>key.startsWith('__reactFiber$'))];
        for(let n=0;fiber&&n<6;fiber=fiber.return,n++){
          const props=fiber.memoizedProps;
          if(!props||typeof props.src!=='string'||![person.nickname,person.remark_name].some(name=>name&&props.alt===name+'头像'))continue;
          if(props.uid!==undefined&&String(props.uid)!==person.uid)continue;
          for(const url of projectUser({uid:person.uid,avatar_url:props.src}).avatar_thumb.url_list)componentUrls.add(url);
        }
      }
      if(componentUrls.size===1){person.avatar_thumb={url_list:[...new Set([...componentUrls,...person.avatar_thumb.url_list])].slice(0,4)};delete person.avatarReadHint;}
      if(!person.avatar_thumb.url_list.length&&!componentUrls.size){
      const images=[...new Set(boxes.flatMap(link=>link.tagName==='IMG'?[link]:[...link.querySelectorAll('img')]))].filter(image=>{const r=image.getBoundingClientRect();return visible(image)&&r.width>=28&&r.height>=28&&r.width<=192&&Math.abs(r.width-r.height)<3;});
      const backgrounds=boxes.flatMap(link=>[link,...link.querySelectorAll('[style],[class]')].slice(0,64)).filter(element=>{const r=element.getBoundingClientRect();return visible(element)&&r.width>=28&&r.width<=192&&Math.abs(r.width-r.height)<3;}).flatMap(element=>{const background=getComputedStyle(element).backgroundImage,match=typeof background==='string'?/^url\(["']?(https:\/\/[^"')]+)["']?\)$/.exec(background):undefined;return match?[match[1]]:[];});
      const supplied=[...new Set([...images.map(image=>image.currentSrc||image.src),...backgrounds].filter(Boolean))];
      const resource=projectUser({...person,avatar_url:supplied.length===1?supplied[0]:undefined});if(resource.avatar_thumb.url_list.length){person.avatar_thumb=resource.avatar_thumb;delete person.avatarReadHint;}
      }
    }
    if(!person.nickname)person.nickname=anchors.map(text).find(Boolean)?.slice(0,200)||'';
    if(!projected.some(row=>row.uid===person.uid))projected.push(person);
  }
  state.domProjectedRows=projected.length;
  // Explicit account-page capture reads only already rendered members. It
  // never drives pagination, scrolls the user's page or treats a footer / fan
  // index as proof that the entire roster has been traversed.
  if(input.snapshotOnly===true)return {data:{status_code:0,followers:projected.slice(0,1000),has_more:true,myself_user_id:input.uid}};
  const ended=[...root.querySelectorAll('div,p,span')].some(e=>visible(e)&&!e.children.length&&/^(?:暂时没有更多了|没有更多了|暂无粉丝|暂时没有粉丝|还没有粉丝|你还没有粉丝)$/.test(text(e)));
  const fresh=projected.filter(person=>!cache.seen.has(person.uid)),count=Number.isSafeInteger(input.ownerFollowerCount)&&input.ownerFollowerCount>=0?input.ownerFollowerCount:undefined;
  if(count!==undefined&&cache.seen.size+fresh.length>count)return {waiting:true,detail:'本人粉丝计数与当前候选行尚未一致，未保存可能的推荐成员'};
  if(cache.seen.size+fresh.length>50000)return {error:'CONTROL',detail:'官网粉丝面板读取达到安全容量，原有名单保留'};
  const atEnd=ended||count!==undefined&&cache.seen.size+fresh.length===count;
  if(fresh.length||atEnd){
    const batch=fresh.slice(0,100);for(const person of batch)cache.seen.set(person.uid,person);
    const complete=atEnd&&batch.length===fresh.length;
    const data={status_code:0,followers:batch,has_more:!complete,min_time:String(cache.seen.size),offset:String(index+1),myself_user_id:input.uid,...(count!==undefined?{total:count}:{})};
    cache.pages.push(data);return {data};
  }
  if(!projected.length&&!ended){
    // Some website lists attach their ordinary read handler to the empty
    // container before any rows overflow it. A scrollHeight>clientHeight
    // requirement can strand that first page forever. Only the native reader
    // may permit ONE initial scroll, while no scoped follower request/failure
    // has been observed. Require exact own-list props and an empty roster;
    // never inspect hooks, call callbacks, invent URLs, or retry a refusal.
    state.emptyPanelChecks=Math.min(50000,(state.emptyPanelChecks||0)+1);
    if(input.allowInitialScroll===true&&index===0&&cache.seen.size===0&&state.domPanelOwnProof===1&&(state.domPanelPropsMask&3)===3&&!(state.domPanelPropsMask&4)&&state.domPanelUserListCount===0&&state.emptyPanelChecks>=3&&!state.initialScrolls&&!state.pages.size&&!state.pending.size&&!state.errors.size){
      state.initialScrolls=1;root.dispatchEvent(new Event('scroll',{bubbles:true}));
      return {waiting:true,detail:'已滚动官网本人空名单，等待首次成员加载；不会重复触发'};
    }
    return {waiting:true,detail:'等待官网粉丝面板渲染成员'};
  }
  if(cache.requested.has(index))return {waiting:true,detail:'已滚动官网粉丝面板，等待新成员'};
  const buttons=[...root.querySelectorAll('button,[role="button"]')].filter(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&/^(?:加载更多|下一页)$/.test(text(e)));
  if(buttons.length>1)return {error:'CONTROL',detail:'官网粉丝面板下一页不唯一'};
  if(buttons.length){cache.requested.add(index);buttons[0].click();return {waiting:true,detail:'已请求官网粉丝面板下一页'};}
  const scrolls=[root,...root.querySelectorAll('div,ul')].filter(e=>visible(e)&&e.clientHeight>40&&e.scrollHeight>e.clientHeight+2&&/auto|scroll/.test(getComputedStyle(e).overflowY)),leaves=scrolls.filter(e=>!scrolls.some(other=>other!==e&&e.contains(other)));
  if(leaves.length!==1)return {waiting:true,detail:'等待唯一的官网粉丝面板滚动区'};
  cache.requested.add(index);leaves[0].scrollTop=leaves[0].scrollHeight;leaves[0].dispatchEvent(new Event('scroll',{bubbles:true}));return {waiting:true,detail:'已滚动官网粉丝面板，等待新成员'};
}
function extractFollowerErrorSites(error) {
  // Standard error stack frame coordinates only. Skip its first (message)
  // line and all function/variable names; do not retain raw stack/error text.
  try{
    if(!['TypeError','ReferenceError'].includes(error?.name)||typeof error.stack!=='string'||error.stack.length>16000)return [];
    const sites=[];
    for(const frame of error.stack.split('\n').slice(1,12)){
      if(!/^\s*at\s/.test(frame))continue;
      const match=/(https:\/\/[^\s()?#]+\.js):(\d{1,7}):(\d{1,9})\)?$/.exec(frame.trim());if(!match)continue;
      const u=new URL(match[1]),file=u.pathname.split('/').at(-1),line=Number(match[2]),column=Number(match[3]);
      if(u.username||u.password||u.port||u.search||u.hash||!/(?:^|\.)(?:douyinstatic\.com|douyincdn\.com|bytescm\.com|bytegoofy\.com)$/.test(u.hostname)||/\/(?:api|aweme|passport|im)\//i.test(u.pathname)||!/(?:^|[._-])[a-f0-9]{8,64}(?=[._-]|\.js$)/i.test(file)||line>10000000||column>100000000)continue;
      const site={source:u.href,line,column,category:error.name==='TypeError'?'type-error':'reference-error'};
      if(!sites.some(old=>old.source===site.source&&old.line===line&&old.column===column))sites.push(site);if(sites.length===3)break;
    }
    return sites;
  }catch{return [];}
}
function installFollowerObserver(projectUser,renderedReader,renderedRoot,settings,extractErrorSites) {
  if(location.origin!=='https://www.douyin.com'||window.__matrixFollowerObserved)return;
  const state={version:1,pages:new Map(),order:[],pending:new Set(),errors:new Map(),sequence:new Map(),identity:null,identityPending:false,identityFailure:null,openRequested:false,requested:new Set(),transport:{fetchStarted:0,fetchReceived:0,fetchRepairs:0,xhrStarted:0,xhrReceived:0,xhrRepairs:0,xhrAbort:0,xhrError:0,xhrTimeout:0,xhrStatusZero:0,xhrStateErrors:0}},xhr=new WeakMap();
  Object.defineProperty(window,'__matrixFollowerObserved',{value:state});
  state.observeTransport=settings?.observeTransport!==false;
  if(settings?.captureErrorSites===true&&typeof extractErrorSites==='function'){
    state.errorSites=[];
    const capture=error=>{if(Date.now()>=Date.parse('2026-10-24T13:00:00Z')||state.errorSites.length>=8)return;for(const site of extractErrorSites(error)){const phase=state.openRequested?'follower-starting':'page-startup';if(!state.errorSites.some(old=>old.source===site.source&&old.line===site.line&&old.column===site.column&&old.phase===phase))state.errorSites.push({...site,phase});if(state.errorSites.length>=8)break;}};
    // Passive observation only: never cancel an event or alter its error,
    // promise, network transport, website component or existing handler.
    window.addEventListener('error',event=>capture(event.error));window.addEventListener('unhandledrejection',event=>capture(event.reason));
  }
  state.findRenderedRoot=()=>renderedRoot(state);state.readRenderedFollowers=input=>renderedReader(input,projectUser,state);
  const cursor=v=>typeof v==='string'&&/^\d{1,19}$/.test(v)?v:Number.isSafeInteger(v)&&v>=0?String(v):undefined;
  const parse=text=>{if(typeof text!=='string'||text.length>4*1024*1024)throw Error('SIZE');return JSON.parse(text.replace(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g,t=>t[0]!=='"'&&/^-?\d+$/.test(t)&&!Number.isSafeInteger(Number(t))?JSON.stringify(t):t));};
  const start=(value,method)=>{try{
    const u=new URL(value,location.href);if((method||'GET').toUpperCase()!=='GET'||u.origin!==location.origin)return;
    if(u.pathname==='/aweme/v1/web/user/profile/self/'){state.identityPending=true;state.identityFailure=null;const serial=(state.sequence.get('self')||0)+1;state.sequence.set('self',serial);return {kind:'self',serial};}
    if(u.pathname!=='/aweme/v1/web/user/follower/list/'||!state.openRequested)return;
    const source=u.searchParams.get('source_type')||'1',time=cursor(u.searchParams.get('max_time')||'0'),offset=cursor(u.searchParams.get('offset')||'0');
    if(!['1','2'].includes(source)||time===undefined||offset===undefined)return;
    if(state.sourceType&&state.sourceType!==source)return;state.sourceType=source;
    const first=!state.firstFollowerRequest;state.firstFollowerRequest=true;
    const logical=first?'0':time,key=logical+'/'+offset,serial=(state.sequence.get(key)||0)+1;state.sequence.set(key,serial);state.pending.add(key);state.pages.delete(key);state.errors.delete(key);
    if(!state.order.includes(key)){if(state.order.length>=5000)return;state.order.push(key);}
    return {kind:'followers',key,serial,uid:u.searchParams.get('user_id')||'',secUid:u.searchParams.get('sec_user_id')||'',initial:first};
  }catch{}};
  const receive=(req,status,raw)=>{
    if(!req||state.sequence.get(req.kind==='self'?'self':req.key)!==req.serial)return;
    const fail=(code,platformCode,httpStatus,shapeStage)=>{const error={code,...(Number.isSafeInteger(platformCode)?{platformCode}:{}),...(Number.isInteger(httpStatus)?{httpStatus}:{}),...(['FOLLOWER_LIST_SHAPE','FOLLOWER_MORE_SHAPE','FOLLOWER_CURSOR_SHAPE','FOLLOWER_UID_PRECISION','FOLLOWER_UID_SHAPE','FOLLOWER_BODY_SHAPE','FOLLOWER_STATUS_SHAPE','FOLLOWER_JSON_SHAPE'].includes(shapeStage)?{shapeStage}:{})};if(req.kind==='self'){state.identityPending=false;state.identityFailure=error;state.identity=null;}else{state.pending.delete(req.key);state.errors.set(req.key,error);}};
    if(status!==200){fail('HTTP',undefined,status);return;}
    try{
      const outer=typeof raw==='string'?parse(raw):raw;
      if(!outer||typeof outer!=='object'){fail('SHAPE',undefined,undefined,'FOLLOWER_BODY_SHAPE');return;}
      if((outer.status_code??outer.statusCode)===undefined){fail('SHAPE',undefined,undefined,'FOLLOWER_STATUS_SHAPE');return;}
      if(![0,'0'].includes(outer.status_code??outer.statusCode)){fail('API',Number.isSafeInteger(Number(outer.status_code??outer.statusCode))?Number(outer.status_code??outer.statusCode):undefined);return;}
      const body=outer.data&&typeof outer.data==='object'?outer.data:outer;
      if((body.status_code??body.statusCode)!==undefined&&![0,'0'].includes(body.status_code??body.statusCode)){fail('API',Number(body.status_code??body.statusCode));return;}
      if(req.kind==='self'){
        const u=outer.user??outer.userInfo??body.user??body.userInfo,person=projectUser(u),handle=u?.unique_id||u?.uniqueId||u?.short_id||u?.shortId;
        if(typeof handle!=='string'&&!(Number.isSafeInteger(handle)&&handle>=0))throw Error('SHAPE');
        const count=u.follower_count??u.followerCount,works=u.aweme_count??u.awemeCount;
        state.identity={at:Date.now(),data:{status_code:0,user:{uid:person.uid,unique_id:String(handle),sec_uid:person.sec_uid,...((typeof count==='number'&&Number.isSafeInteger(count)||typeof count==='string'&&/^\d{1,10}$/.test(count))?{follower_count:count}:{}),...(Number.isSafeInteger(works)&&works>=0?{aweme_count:works}:{})}}};state.identityPending=false;return;
      }
      const list=Object.hasOwn(body,'followers')?body.followers:Object.hasOwn(body,'followList')?body.followList:body.follow_list,rawMore=body.has_more??body.hasMore;
      if(![true,false,0,1,'0','1'].includes(rawMore))throw Object.assign(Error('SHAPE'),{shapeStage:'FOLLOWER_MORE_SHAPE'});
      const more=[true,1,'1'].includes(rawMore);
      if(!(Array.isArray(list)&&list.length<=100||list===null&&!more))throw Object.assign(Error('SHAPE'),{shapeStage:'FOLLOWER_LIST_SHAPE'});
      const time=cursor(body.min_time??body.minTime??'0'),offset=cursor(body.offset??'0');if(time===undefined||offset===undefined)throw Object.assign(Error('SHAPE'),{shapeStage:'FOLLOWER_CURSOR_SHAPE'});
      state.pages.set(req.key,{ownerUid:req.uid,ownerSecUid:req.secUid,receivedAt:Date.now(),data:{status_code:0,followers:(list||[]).map(projectUser),has_more:!!more,min_time:time,offset,...(body.total!==undefined?{total:body.total}:{})}});state.pending.delete(req.key);
      if(state.pages.size>512)state.pages.delete(state.pages.keys().next().value);
    }catch(error){fail('SHAPE',undefined,undefined,error?.shapeStage||'FOLLOWER_JSON_SHAPE');}
  };
  const fetchRequests=new Map(),fetchResponses=new WeakSet();let hookedFetch;
  const fetchKey=(value,method)=>{try{const u=new URL(value,location.href);if((method||'GET').toUpperCase()!=='GET'||u.origin!==location.origin)return;if(u.pathname==='/aweme/v1/web/user/profile/self/')return 'self';if(u.pathname==='/aweme/v1/web/user/follower/list/'&&state.openRequested)return JSON.stringify(['followers',...['source_type','user_id','sec_user_id','max_time','offset'].map(key=>u.searchParams.get(key)||'')]);}catch{}};
  state.ensureFetchHooks=()=>{
    if(typeof window.fetch!=='function'||window.fetch===hookedFetch)return;
    const original=window.fetch;
    const wrapped=function(input,init){
      const url=typeof input==='string'||input instanceof URL?String(input):input?.url,method=init?.method||input?.method,key=fetchKey(url,method);
      let token=key&&fetchRequests.get(key);
      if(!token&&key&&fetchRequests.size<64){const req=start(url,method);if(req){token={req,refs:0};fetchRequests.set(key,token);state.transport.fetchStarted++;}}
      if(token)token.refs++;
      const release=()=>{if(!token)return;if(--token.refs===0)setTimeout(()=>{if(token.refs===0&&fetchRequests.get(key)===token)fetchRequests.delete(key);},0);};
      const finish=(status,body)=>{if(token){state.transport.fetchReceived++;receive(token.req,status,body);}};
      let result;try{result=Reflect.apply(original,this,arguments);}catch(error){state.transport.fetchFailure='CALL';finish(0,null);release();throw error;}
      // Register on the ORIGINAL returned promise immediately. Assimilating a
      // cross-realm promise with Promise.resolve schedules an extra microtask;
      // the caller can then consume its body before our clone is registered.
      if(token)result.then(response=>{
        // Multiple public wrapper layers can resolve to the same Response.
        // Observe one clone, without changing the returned promise/body or
        // recording a second logical page when a wrapper awaits another one.
        if(fetchResponses.has(response))return;fetchResponses.add(response);
        state.transport.fetchPhase='CLONE';const copy=response.clone();if(Number(copy.headers?.get?.('content-length'))>4*1024*1024){finish(response.status,null);return;}
        state.transport.fetchPhase='BODY';return copy.text().then(body=>finish(response.status,body),()=>{state.transport.fetchFailure='BODY';finish(0,null);});
      },()=>{state.transport.fetchFailure='REJECT';finish(0,null);}).catch(()=>{state.transport.fetchFailure=state.transport.fetchPhase||'RESPONSE';finish(0,null);}).finally(release);
      return result;
    };
    window.fetch=wrapped;hookedFetch=wrapped;state.transport.fetchRepairs++;
  };
  // Website bootstrap can replace the PUBLIC XHR constructor/prototype after
  // preload. Adopt that normal surface immediately before the ordinary fans
  // click; never inspect SDK closures or call an internal request function.
  // Shared per-open entries keep wrapper chains from recording one send twice.
  let hookedPrototype,hookedOpen,hookedSend;
  state.ensureXhrHooks=()=>{
    const proto=window.XMLHttpRequest?.prototype;
    if(!proto||typeof proto.open!=='function'||typeof proto.send!=='function')return;
    if(proto===hookedPrototype&&proto.open===hookedOpen&&proto.send===hookedSend)return;
    const open=proto.open,send=proto.send;
    const wrappedOpen=function(method,url){const result=Reflect.apply(open,this,arguments);xhr.set(this,{url,method,sent:false});return result;};
    const wrappedSend=function(){
      const entry=xhr.get(this);
      if(!entry||entry.sent)return Reflect.apply(send,this,arguments);
      entry.sent=true;const req=start(entry.url,entry.method);
      if(!req)return Reflect.apply(send,this,arguments);
      state.transport.xhrStarted++;
      let finished=false;
      const finish=()=>{if(finished)return;finished=true;state.transport.xhrReceived++;try{this.removeEventListener('readystatechange',ready,true);this.removeEventListener('loadend',finish,true);}catch{}try{const status=this.status;if(status===0)state.transport.xhrStatusZero++;receive(req,status,this.responseType==='json'?this.response:this.responseType===''||this.responseType==='text'?this.responseText:null);}catch{state.transport.xhrStateErrors++;receive(req,0,null);}};
      const ready=()=>{try{if(this.readyState===4)finish();}catch{finish();}};
      // Capture readyState 4 as well as loadend: website load handlers may
      // stop later event propagation after they consume their own response.
      try{this.addEventListener('readystatechange',ready,true);this.addEventListener('loadend',finish,true);}catch{finish();}
      for(const [type,key]of [['abort','xhrAbort'],['error','xhrError'],['timeout','xhrTimeout']])try{this.addEventListener(type,()=>state.transport[key]++,{once:true,capture:true});}catch{}
      try{return Reflect.apply(send,this,arguments);}catch(error){finish();throw error;}
    };
    proto.open=wrappedOpen;proto.send=wrappedSend;hookedPrototype=proto;hookedOpen=wrappedOpen;hookedSend=wrappedSend;state.transport.xhrRepairs++;
  };
  if(state.observeTransport){state.ensureFetchHooks();state.ensureXhrHooks();}
}
function followerPage(input) {
  const wait=detail=>({waiting:true,detail}),fail=(code,detail)=>({error:code,detail:code==='CONTROL'?detail+'（结构阶段：FOLLOWER_CONTROL_SHAPE）':detail});
  if(location.origin!=='https://www.douyin.com'||location.pathname!=='/user/self'||!/^[1-9]\d{0,18}$/.test(input.uid||''))return fail('OWNER','本人粉丝页面或账号未能确认');
  if(/安全验证|验证码|访问受限/.test(document.title||''))return fail('VERIFY','官网要求本人完成验证');
  const state=window.__matrixFollowerObserved;if(state?.version!==1)return wait('等待官网粉丝响应观察器');
  state.uiReads=(state.uiReads||0)+1;
  state.ownerFollowerCount=Number.isSafeInteger(input.ownerFollowerCount)&&input.ownerFollowerCount>=0?input.ownerFollowerCount:undefined;
  state.ownerUid=input.uid;
  if(state.observeTransport!==false){state.ensureFetchHooks?.();state.ensureXhrHooks?.();}
  // Offset here is OUR observed-page index, never sent as an API argument.
  // Actual website time/offset values are retained by its own request/UI.
  const index=Number(input.offset||'0');if(!Number.isSafeInteger(index)||index<0||index>5000)return fail('OWNER','粉丝页面索引无效');
  if(state.readMode!=='dom'&&index&&!state.order.length)return fail('RESCAN','粉丝采集页已释放，需要重新建立分页');
  if(state.readMode!=='dom'&&index&&state.pages.get(state.order[index-1])?.data.min_time!==input.cursor)return fail('OWNER','粉丝页面索引与上一页响应不一致');
  const key=state.order[index]||'pending-page-'+index,failure=state.errors.get(key);
  if(failure)return {...failure,error:failure.code,detail:'官网粉丝列表请求未成功'+(failure.shapeStage?'（结构阶段：'+failure.shapeStage+'）':failure.code==='HTTP'&&failure.httpStatus===0?'（请求阶段：FOLLOWER_TRANSPORT）':'')+'；未换接口重试'};
  const page=state.pages.get(key);
  if(page){if(!(page.ownerUid===input.uid||page.ownerSecUid&&page.ownerSecUid===input.secUid)||page.ownerUid&&page.ownerUid!==input.uid||page.ownerSecUid&&page.ownerSecUid!==input.secUid)return fail('OWNER','粉丝响应的请求账号与本人不一致');if(state.readMode!=='dom'){state.readMode='response';return {data:{...page.data,offset:String(index+1),myself_user_id:input.uid}};}}
  // An error on the site's own request is terminal, even if its initial time
  // anchor differs from the application's logical page-zero anchor.
  if(state.errors.size){const error=[...state.errors.values()][0];return {...error,error:error.code,detail:'官网粉丝分页读取失败'+(error.shapeStage?'（结构阶段：'+error.shapeStage+'）':'')+'；原有名单保留'};}
  const rendered=state.readMode==='response'?undefined:state.readRenderedFollowers?.(input);
  if(rendered?.data){state.readMode='dom';return rendered;}
  if(rendered?.error)return rendered;
  if(state.readMode==='dom')return rendered||wait('等待官网粉丝面板');
  // A rendered card without an exact identity is not an empty page. Do not
  // click past it via the response-mode pager while its props are pending.
  if(rendered?.waiting&&state.domRootCount===1&&(state.domPanelOwnProof===1||state.domProfileLinks>0||state.domCandidateCards>0))return rendered;
  if(state.pending.has(key))return wait('等待官网粉丝分页响应');
  const visible=e=>e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
  const text=e=>(e.innerText||e.textContent||'').trim().replace(/\s+/g,' '),q=s=>[...document.querySelectorAll(s)].filter(visible);
  if(!state.openRequested&&!state.pages.size){
    // The site's own counter may be a DIV/P with a bubbled click handler,
    // and the current UI can label it Fans Index. Exact labels only: never
    // match New Followers, notifications or arbitrary text containing fans.
    const counter=/^(?:(?:粉丝(?:指数|数)?)\s*[\d,.万亿]*|[\d,.万亿]+\s*粉丝(?:指数|数)?)$/;
    const number=/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?[万亿]?$/;
    const matches=q('button,a,[role="button"],span,div,p').filter(e=>counter.test(text(e)));
    const leaves=matches.filter(e=>!matches.some(other=>other!==e&&e.contains(other))),official=q('[data-e2e="user-info-fans"]').filter(e=>counter.test(text(e))),legacyControls=[...new Set(leaves.map(e=>{
      const semantic=e.closest('button,a,[role="button"]');if(semantic&&counter.test(text(semantic)))return semantic;
      // Some normal layouts attach the click to the number, not the label.
      // Ascend only within a pure own-fans counter, never a profile header
      // that also contains Following, New Followers or notification text.
      for(let box=e,depth=0;box&&depth<4&&box!==document.body;box=box.parentElement,depth++){
        if(!counter.test(text(box)))break;
        if([...box.querySelectorAll('span,div,p,b,strong')].some(child=>visible(child)&&!child.children.length&&number.test(text(child))))return box;
      }return e;
    }))],controls=official.length?official:legacyControls;
    if(controls.length!==1)return controls.length>1?fail('CONTROL','官网本人粉丝入口不唯一，未猜测点击'):wait('尚未识别官网本人主页的粉丝入口');
    const control=controls[0],numbers=[...control.querySelectorAll('span,div,p,b,strong')].filter(child=>visible(child)&&!child.children.length&&number.test(text(child)));
    if(numbers.length>1)return fail('CONTROL','官网本人粉丝计数不唯一，未猜测点击');
    if(!numbers.length&&!/\d/.test(text(control))&&!control.matches('button,a,[role="button"]'))return wait('等待官网本人粉丝计数入口');
    const target=official.includes(control)?control:numbers[0]||control,anchor=target.closest('a')||control.closest('a');
    if(anchor){try{const u=new URL(anchor.href,location.href);if(u.origin!==location.origin||u.username||u.password||!['/user/self','/user/self/'].includes(u.pathname))return fail('CONTROL','粉丝入口指向另一页面，未自动跳转');}catch{return fail('CONTROL','粉丝入口地址未识别');}}
    if(control.disabled||control.getAttribute('aria-disabled')==='true'||target.closest('[disabled],[aria-disabled="true"]'))return fail('CONTROL','官网本人粉丝入口暂不可用');
    // The current official header can expose its counter before userInfo has
    // hydrated. Its modal's initial callback captures that object. Wait for
    // the normal rendered header props, never inspect SDK closures or tokens.
    const header=control.closest('[data-e2e="user-info"]');
    state.entryIdentityMask=header?1:0;
    if(header){
      const exact=value=>typeof value==='string'&&/^[1-9]\d{0,18}$/.test(value)?value:Number.isSafeInteger(value)&&value>0?String(value):'';
      const sec=value=>typeof value==='string'&&/^MS4w[A-Za-z0-9_-]{1,250}$/.test(value)?value:'';
      let ready=false,fiber=header[Object.keys(header).find(key=>key.startsWith('__reactFiber$'))];
      for(let depth=0;fiber&&depth<10;fiber=fiber.return,depth++)for(const props of [fiber.memoizedProps,fiber.memoizedProps?.children?.props])for(const user of [props?.userInfo,props?.currentUserInfo]){
        if(!user||typeof user!=='object')continue;
        const uid=exact(user.uid),secUid=sec(user.secUid??user.sec_uid);
        state.entryIdentityMask|=(uid?2:0)|(uid===input.uid?4:0)|(secUid?8:0)|(secUid&&secUid===input.secUid?16:0);
        if(uid&&uid!==input.uid||secUid&&sec(input.secUid)&&secUid!==input.secUid){state.entryIdentityMask|=32;return fail('OWNER','官网本人资料与粉丝入口归属不一致，未打开名单');}
        if(uid===input.uid&&secUid&&secUid===input.secUid)ready=true;
      }
      if(!ready)return wait('等待官网本人资料完成渲染，再打开本人粉丝列表');
    }
    state.followerControl=control;state.openRequested=true;target.click();return wait('已打开官网本人粉丝列表，等待读取');
  }
  if(state.requested.has(key))return wait('已请求官网下一页，等待响应');
  const dialogs=q('[role="dialog"],[data-e2e="follow-list"]').filter(e=>/粉丝/.test(text(e)));let roots=dialogs.filter(e=>!dialogs.some(other=>other!==e&&e.contains(other)));
  if(!roots.length){const found=state.findRenderedRoot?.();if(found?.error)return found;if(found?.root)roots=[found.root];}
  if(roots.length!==1)return roots.length>1?fail('CONTROL','官网粉丝列表容器不唯一'):wait('等待可确认的官网粉丝列表容器');
  const box=roots[0],buttons=[...box.querySelectorAll('button,[role="button"]')].filter(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&/^(?:加载更多|下一页)$/.test(text(e)));
  if(buttons.length>1)return fail('CONTROL','官网粉丝下一页控件不唯一');
  if(buttons.length){state.requested.add(key);buttons[0].click();return wait('已请求官网粉丝下一页');}
  const scrolls=[box,...box.querySelectorAll('div,ul')].filter(e=>visible(e)&&e.clientHeight>40&&e.scrollHeight>e.clientHeight+2&&/auto|scroll/.test(getComputedStyle(e).overflowY));
  const deepest=scrolls.filter(e=>!scrolls.some(other=>other!==e&&e.contains(other)));
  if(deepest.length!==1)return deepest.length>1?fail('CONTROL','官网粉丝滚动容器不唯一'):wait('等待官网粉丝可滚动列表');
  state.requested.add(key);deepest[0].scrollTop=deepest[0].scrollHeight;
  // A hidden collector may already be at the end while the website appends
  // rows; a same-position assignment emits no scroll event. Notify only this
  // identified list's normal read-only handler, once per observed page index.
  deepest[0].dispatchEvent(new Event('scroll',{bubbles:true}));return wait('已滚动官网粉丝列表，等待下一页');
}
if(typeof process!=='undefined'&&process.type==='renderer')require('electron').webFrame.executeJavaScriptInIsolatedWorld(0,[{code:'('+installFollowerObserver.toString()+')(('+projectFollowerUser.toString()+'),('+readRenderedFollowers.toString()+'),('+findRenderedFollowerRoot.toString()+'),'+JSON.stringify({observeTransport:!process.argv.includes('--matrix-follower-dom-only'),captureErrorSites:process.argv.includes('--matrix-follower-init-sites-rc187')})+',('+extractFollowerErrorSites.toString()+'))'}]).catch(()=>{});
else module.exports={projectFollowerUser,installFollowerObserver,followerPage,readRenderedFollowers,findRenderedFollowerRoot,extractFollowerErrorSites};
