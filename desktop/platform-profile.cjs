// Read only the current account's rendered profile, never cookies or arbitrary page state.
// Kept self-contained so the same code is exercised in a real Chromium test page.
function readPlatformProfile(platform, componentRoots = []) {
  const query = selector => [...new Set([document,...componentRoots].flatMap(root=>[...root.querySelectorAll(selector)]))];
  const parent = el => el.parentElement || el.getRootNode().host;
  const within = (el, selector) => { for(let node=el;node;node=parent(node))if(node.matches(selector))return true;return false; };
  const visible = el => {
    if(!el||!el.getClientRects().length)return false;
    for(let node=el;node;node=parent(node)){const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden'||style.opacity==='0')return false;}
    return true;
  };
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const valid = value => value && value.length <= 80 && !/^(?:登录|立即登录|扫码登录|退出登录|注册|创作服务平台|账号管理|个人中心|创作者中心|手机号|验证码|昵称|用户名|加载中[.…]*|小红书账号|抖音账号|视频号账号|B站账号)$/.test(value);
  const own = {
    xiaohongshu: ['.creator-header .user-name', '.user-info .name', '.user-info .nickname', '.user .name', '.user .user-name'],
    douyin: ['[class*=userInfo] [class*=nickname]', '[class*=user-info] [class*=user-name]'],
    wechat: ['.finder-nickname', '.finder-info .nickname', '.account-info .name', '.common-menu-item.account-info.default'],
    bilibili: ['.home-top-msg .home-top-msg-name', '.header-entry-mini .nickname', '.header-avatar-wrap .nickname', '.user-info .nickname'],
  };
  const selectors = [
    ...(own[platform] || []),
    'header [class*=nickname]', 'header [class*=user-name]', 'header [class*=userName]',
    '[class*=user-info] [class*=name]', '[class*=userInfo] [class*=name]',
    '[class*=account-info] [class*=name]', '[class*=accountInfo] [class*=name]',
    '[class*=nickname]', '[class*=user-name]', '[class*=username]', '[class*=account-name]', '[class*=userName]',
  ];
  let nickname = '', ownerElement, ownIdentity, metrics;
  // The exact signed-in self route is not an arbitrary public author profile.
  // Use its rendered nickname AND labelled handle, never a conversation title
  // or hidden application store. Needed before opening the private message list.
  if(platform==='douyin'&&location.hostname==='www.douyin.com'&&/^\/user\/self\/?$/.test(location.pathname)){
    const markers=query('span,div,p').filter(el=>visible(el)&&/^抖音号[：:]\s*[A-Za-z0-9_.-]{2,80}$/.test(normalize(el.innerText||el.textContent)));
    for(const marker of markers){
      if(within(marker,'article,[data-e2e="im-dialog"],[class*=comment],[class*=video-card]'))continue;
      const key=/^抖音号[：:]\s*([A-Za-z0-9_.-]{2,80})$/.exec(normalize(marker.innerText||marker.textContent))?.[1];
      for(let block=parent(marker),depth=0;block&&block!==document.body&&depth<5;block=parent(block),depth++){
        const names=[...block.querySelectorAll('h1')].filter(visible);
        if(names.length!==1)continue;
        const name=normalize(names[0].innerText||names[0].textContent);
        if(!valid(name)||!key)continue;
        nickname=name;ownerElement=block;ownIdentity={source:'official_own_homepage',key};break;
      }
      if(nickname)break;
    }
  }
  // Observed creator home: nickname + public handle + own counters share one
  // profile block. This survives CSS hashes without reading stores/private APIs.
  // Never run this semantic fallback in work/comment/public-profile pages.
  if(platform==='douyin'&&location.hostname==='creator.douyin.com'&&/^\/creator-micro\/home\/?$/.test(location.pathname)){
    const markers=query('span,div,p').filter(el=>visible(el)&&/^抖音号[：:]\s*[A-Za-z0-9_.-]{2,80}$/.test(normalize(el.innerText||el.textContent)));
    for(const marker of markers){
      if(within(marker,'article,[class*=comment],[class*=video-card],[class*=author-info]'))continue;
      for(let block=parent(marker),depth=0;block&&depth<4;block=parent(block),depth++){
        const body=normalize(block.innerText||block.textContent),parts=body.split(/抖音号[：:]\s*/);
        if(parts.length!==2||!body.includes('关注')||!body.includes('获赞'))continue;
        const name=normalize(parts[0]),key=/^[A-Za-z0-9_.-]{2,80}/.exec(parts[1])?.[0];
        if(!valid(name)||!key)continue;
        nickname=name;ownerElement=block;ownIdentity={source:'official_own_homepage',key};
        const number=value=>{const m=/^(\d+(?:\.\d+)?)(万|亿)?$/.exec(value);return m?Math.round(Number(m[1])*(m[2]==='亿'?1e8:m[2]==='万'?1e4:1)):undefined;};
        metrics={};for(const [label,field] of [['粉丝数','followersCount'],['粉丝','followersCount'],['关注','followingCount'],['获赞','likesCount']]){const match=new RegExp('(?:^|\\s)'+label+'\\s+(\\d+(?:\\.\\d+)?[万亿]?)(?=\\s|$)').exec(body);if(field==='followersCount'&&match&&/[万亿.]/.test(match[1]))continue;const value=match&&number(match[1]);if(Number.isSafeInteger(value)&&value>=0)metrics[field]=value;}
        break;
      }
      if(nickname)break;
    }
  }
  for (const selector of selectors) {
    if(nickname)break;
    for (const el of query(selector)) {
      // A comment, follower, conversation or work card is not the signed-in account.
      if (!visible(el) || within(el,'article, [class*=comment], [class*=message-item], [class*=follower-item], [class*=note-item], [class*=video-card], [class*=author-info], [data-comment-id], [data-conversation-id], [data-follower-id], [data-e2e="comment-item"], [data-e2e="conversation-item"], [class*=conversation-item], [class*=sessionItem], [class*=fansItem], .fans-item')) continue;
      let text;
      if (platform === 'wechat' && el.matches('.common-menu-item.account-info.default')) {
        // This sidebar owns the account-switch dialog too. Its aggregate text
        // and tooltip are not the nickname. Read only rendered owner text,
        // excluding dialog accounts, icon titles and hidden/stale labels.
        const parts = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const parent = node.parentElement;
          if (!parent || parent.closest('svg,script,style,.common-dialog,[role=dialog],[role=alertdialog],[hidden],[aria-hidden=true]')) continue;
          let shown = true;
          for (let branch = parent; branch; branch = branch.parentElement) {
            const style = getComputedStyle(branch);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') { shown = false; break; }
            if (branch === el) break;
          }
          if (shown && visible(parent)) parts.push(node.textContent);
        }
        text = parts.join(' ');
      } else text = el.getAttribute('title') || el.getAttribute('data-nickname') || el.textContent;
      const candidate = normalize(text);
      if (valid(candidate)) { nickname = candidate; ownerElement = el; break; }
    }
    if (nickname) break;
  }
  // Observed XHS creator home labels the identifier "小红书账号", not only
  // "小红书号". Its header nickname can be separate from the own profile card.
  // Read a single labelled ID within that card; never a note author/dialog.
  if(platform==='xiaohongshu'&&nickname&&location.protocol==='https:'&&location.hostname==='creator.xiaohongshu.com'&&/^\/(?:new\/)?(?:home\/?)?$/.test(location.pathname)){
    const excluded='article,[class*=comment],[class*=note-card],[class*=note-item],[class*=recommend],[role=dialog],.common-dialog';
    const markers=query('span,div,p').filter(node=>visible(node)&&!within(node,excluded)&&/^(?:小红书账号|小红书号)\s*[:：]\s*[A-Za-z0-9_.-]{2,80}$/.test(normalize(node.innerText||node.textContent)));
    const cards=[];
    for(const marker of markers){
      const key=/[:：]\s*([A-Za-z0-9_.-]{2,80})$/.exec(normalize(marker.innerText||marker.textContent))[1];
      for(let block=parent(marker),depth=0;block&&block!==document.body&&block!==document.documentElement&&depth<5;block=parent(block),depth++){
        if(within(block,excluded))break;
        const body=normalize(block.innerText||block.textContent);
        // The signed-in nickname can be in a separate header. The labelled
        // identifier and OWN counters are the profile-card boundary, not a
        // duplicated nickname that this layout does not render in that card.
        if(body.includes('关注数')&&body.includes('粉丝数')){cards.push({key,block});break;}
      }
    }
    if(new Set(cards.map(card=>card.key)).size===1){ownIdentity={source:'official_own_homepage',key:cards[0].key};ownerElement=cards[0].block;}
  }
  const owner = ownIdentity?ownerElement:ownerElement?.closest('header, [class*=user-info], [class*=userInfo], [class*=account-info], .user');
  // Platform IDs are collected only beside an authenticated OWN profile label,
  // never from video authors, comments, arbitrary links or embedded JS stores.
  if(!ownIdentity&&nickname&&location.protocol==='https:'){
    const ownHome=platform==='bilibili'&&location.hostname==='account.bilibili.com'&&location.pathname==='/account/home'||platform==='wechat'&&location.hostname==='channels.weixin.qq.com'&&/^\/platform(?:\/home)?\/?$/.test(location.pathname)||platform==='xiaohongshu'&&location.hostname==='creator.xiaohongshu.com'&&!/login|publish|note-manager/.test(location.pathname);
    if(ownHome){
      for(let block=ownerElement,depth=0;block&&depth<5&&block!==document.body;block=parent(block),depth++){
        if(within(block,'article,[class*=comment],[class*=video-card]'))break;
        const body=normalize(block.innerText||block.textContent),label=platform==='bilibili'?'UID':platform==='wechat'?'视频号ID':'(?:小红书号|小红书账号)';
        const marker=new RegExp('(?:^|\\s)'+label+'\\s*[:：]\\s*([A-Za-z0-9_.-]{2,80})(?=\\s|$)','i').exec(body);
        const ids=new Set();
        if(marker)ids.add(marker[1]);
        if(platform==='bilibili')for(const link of block.querySelectorAll('a[href]')){if(!visible(link))continue;try{const url=new URL(link.href);if(url.protocol==='https:'&&url.hostname==='space.bilibili.com'&&/^\/\d+\/?$/.test(url.pathname))ids.add(url.pathname.replaceAll('/',''));}catch{}}
        if(ids.size===1){ownIdentity={source:'official_own_homepage',key:[...ids][0]};break;}
        if(ids.size>1)break;
      }
    }
  }
  if(platform==='xiaohongshu'&&ownIdentity&&ownerElement){
    // XHS renders each counter as value THEN label. Reading "粉丝数 27"
    // from the aggregate text can steal the next (likes+favorites) counter.
    // Accept only an isolated value/label pair inside this OWN card. Combined
    // likes+favorites is not a pure likes count and must not populate likes.
    const values=new Map(),contains=node=>{for(let at=node;at;at=parent(at))if(at===ownerElement)return true;return false;};
    for(const node of query('span,div,p,li,dt,dd,strong,b')){
      if(!contains(node)||!visible(node)||within(node,'article,[class*=comment],[class*=note-card],[class*=recommend],[role=dialog]'))continue;
      const text=normalize(node.innerText||node.textContent),label='(关注数|粉丝数|获赞数|获赞)',number='(\\d+(?:\\.\\d+)?)(万|亿)?';
      const before=new RegExp('^'+number+'\\s*'+label+'$').exec(text),after=new RegExp('^'+label+'\\s*[:：]?\\s*'+number+'$').exec(text);
      if(!before&&!after)continue;
      const count=before?before[1]:after[2],unit=before?before[2]:after[3],name=before?before[3]:after[1],field=name==='关注数'?'followingCount':name==='粉丝数'?'followersCount':'likesCount';
      if(field==='followersCount'&&(unit||count.includes('.')))continue;
      const value=Math.round(Number(count)*(unit==='亿'?1e8:unit==='万'?1e4:1));if(!Number.isSafeInteger(value)||value<0)continue;
      if(!values.has(field))values.set(field,new Set());values.get(field).add(value);
    }
    metrics={};for(const[field,counts]of values)if(counts.size===1)metrics[field]=[...counts][0];
  }
  // Counts must be explicit counters in the rendered OWN profile block. No
  // document-wide number scraping and no conversion of a platform's fan index.
  const countOwner=platform==='wechat'?ownerElement?.closest('.finder-info'):owner;
  if(!metrics&&nickname&&countOwner&&!within(countOwner,'article,[class*=comment],[class*=video-card]')){
    const body=normalize(countOwner.innerText||countOwner.textContent);metrics={};
    for(const [labels,field]of [['粉丝数|粉丝|关注者','followersCount'],['关注','followingCount'],['获赞','likesCount']]){
      const match=new RegExp('(?:^|\\s)(?:'+labels+')\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?)(万|亿)?(?=\\s|$)').exec(body);
      if(match){if(field==='followersCount'&&(match[2]||match[1].includes('.')))continue;const value=Math.round(Number(match[1])*(match[2]==='亿'?1e8:match[2]==='万'?1e4:1));if(Number.isSafeInteger(value)&&value>=0)metrics[field]=value;}
    }
  }
  let avatarUrl = '';
  const douyinOwnRoute=location.protocol==='https:'&&(location.hostname==='creator.douyin.com'&&/^\/(?:creator-micro\/home\/?)?$/.test(location.pathname)||location.hostname==='www.douyin.com'&&/^\/user\/self\/?$/.test(location.pathname));
  if(platform==='douyin'&&douyinOwnRoute&&ownerElement&&(ownIdentity?.source==='official_own_homepage'||owner)){
    // The handle/counters live in a text column, while the portrait can be a
    // sibling. Stay within that OWN card; never fall back to the page's first
    // avatar (which may belong to a video author or comment).
    const excluded='article,[class*=comment],[class*=message-item],[class*=conversation],[class*=video-card],[class*=author-info],[data-comment-id],[data-conversation-id],[data-follower-id],[class*=recommend], [role=dialog]';
    const contains=(scope,node)=>{for(let el=node;el;el=parent(el))if(el===scope)return true;return false;};
    const portraitLabel=node=>/avatar|head[-_]?(?:img|image|portrait)|user[-_]?(?:image|icon|photo)|profile[-_]?(?:image|photo)|头像/i.test([node.className,node.id,node.getAttribute('alt'),node.getAttribute('aria-label')].join(' '));
    const isPortrait=node=>{for(let el=node,depth=0;el&&depth<3;el=parent(el),depth++)if(portraitLabel(el))return true;return false;};
    const safeUrl=value=>{try{const url=new URL(value,location.href);return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}};
    const square=node=>{const r=node.getBoundingClientRect();return r.width>=20&&r.height>=20&&r.width/r.height>=0.7&&r.width/r.height<=1.4;};
    const unwanted=node=>/logo|二维码|qrcode|qr-code|默认头像|default[-_]?avatar|placeholder/i.test([node.className,node.id,node.getAttribute('alt'),node.getAttribute('aria-label')].join(' '));
    const urlsIn=(scope,allowUnlabelled)=>{
      const urls=new Set();
      for(const image of query('img')){
        if(!contains(scope,image)||!visible(image)||within(image,excluded)||unwanted(image)||!square(image)||!allowUnlabelled&&!isPortrait(image))continue;
        // currentSrc honors <picture>/srcset; an empty src attribute is not the
        // current document URL, and lazy data-src is not a rendered selection.
        const value=image.currentSrc||image.getAttribute('src');if(!value)continue;
        const url=safeUrl(value);if(url)urls.add(url);
      }
      for(const node of query('[class],[aria-label]')){
        if(!contains(scope,node)||!visible(node)||within(node,excluded)||unwanted(node)||!square(node)||!portraitLabel(node)||node.querySelector('img'))continue;
        const background=getComputedStyle(node).backgroundImage,match=/^url\(["']?(.*?)["']?\)$/.exec(background);
        const url=match&&safeUrl(match[1]);if(url)urls.add(url);
      }
      return urls;
    };
    let scope=ownIdentity?ownerElement:owner;
    for(let depth=0;scope&&scope!==document.body&&scope!==document.documentElement&&depth<(ownIdentity?3:1);scope=parent(scope),depth++){
      if(within(scope,excluded))break;
      if(ownIdentity){
        const ids=new Set(query('span,div,p').filter(node=>contains(scope,node)&&visible(node)&&!within(node,excluded)).map(node=>/^抖音号[：:]\s*([A-Za-z0-9_.-]{2,80})$/.exec(normalize(node.innerText||node.textContent))?.[1]).filter(Boolean));
        if(ids.size!==1||!ids.has(ownIdentity.key))break;
      }
      const urls=urlsIn(scope,Boolean(ownIdentity)&&depth===0);if(urls.size===1){avatarUrl=[...urls][0];break;}if(urls.size>1)break;
    }
  }
  if (platform === 'bilibili' && ownerElement?.matches('.home-top-msg-name')) {
    const image = query('.home-head img').find(visible);
    if (image && /^https?:/.test(image.src)) avatarUrl = image.src;
  }
  if (platform === 'wechat' && ownerElement?.matches('.finder-nickname')) {
    const image = query('img[alt="视频号头像"]').find(visible);
    if (image && /^https?:/.test(image.src)) avatarUrl = image.src;
  }
  for (const selector of platform==='douyin'?[]:['img[class*=avatar]', '[class*=avatar] img', 'img[class*=user]']) {
    const image = (owner ? [...owner.querySelectorAll(selector)] : query(selector)).find(visible);
    if (!avatarUrl && image && /^https?:/.test(image.src)) { avatarUrl = image.src; break; }
  }
  let accountIssue;
  for (const element of query('[role=alert],[role=alertdialog],[class*=account-status],[class*=accountStatus],[data-account-state]')) {
    if (!visible(element) || within(element,'article,[class*=comment],[class*=message-item],[class*=conversation],[class*=video-card],[class*=note-item]')) continue;
    const message = normalize(element.innerText || element.textContent);
    if (!message || message.length > 200 || /如果|若您|如您|如何|是否|尚未|未被|没有被|封禁规则|封禁说明/.test(message)) continue;
    const verdict = /^(?:安全提示[：:]\s*)?(?:您的|你的|当前|该|此)?(?:账号|帐号|账户|视频号)(?:已(?:被|遭)?|因.{0,45}?被)(?:永久)?(封禁|封停|禁用|限制发布|禁止投稿|禁止发布)(?:[，。！!：:\s]|$)/.exec(message);
    if (verdict) { accountIssue = { kind: /封禁|封停/.test(verdict[1]) ? 'banned' : 'restricted', message }; break; }
    if (/^(?:您的|你的|当前|该|此)?(?:账号|帐号|账户)(?:状态)?异常[。！!\s]*$/.test(message)) { accountIssue = { kind: 'abnormal', message }; break; }
  }
  const verificationRequired=/^(?:验证码中间页|安全验证|Captcha(?: Verification)?)(?:\s*[-|].*)?$/i.test(document.title.trim())||query('iframe').some(frame=>visible(frame)&&/captcha|verifycenter|verify\.snssdk\.com/i.test(frame.getAttribute('src')||'')&&!within(frame,'article,[class*=comment],[class*=message-item]'));
  return { nickname, avatarUrl, ...(ownIdentity ? { ownIdentity } : {}), ...(metrics ? { metrics } : {}), ...(accountIssue ? { accountIssue } : {}), ...(verificationRequired?{verificationRequired:true}:{}), pageUrl: location.href, title: document.title.trim(),
    loginVisible: query('input').some(el => visible(el) && /密码|验证码|手机号|password|one-time-code/.test([el.type, el.placeholder, el.autocomplete].join(' '))),
  };
}

function bindingProfile(profile, label) {
  if(profile.verificationRequired)return {error:`${label}官方页面要求本人验证，请在官方页面正常完成验证后再核验；未改动已有绑定`,verificationRequired:true};
  if (profile.accountIssue) return { error: `官方页面显示${label}账号状态异常：${profile.accountIssue.message}`, accountIssue: profile.accountIssue };
  if (!profile.nickname?.trim()) return { error: `已登录${label}，正在读取账号昵称。请停留在官方首页；如长时间未识别，可展开右上角头像菜单后重试。`, pendingProfile: true };
  return { ...profile, nickname: profile.nickname.trim() };
}

module.exports = { readPlatformProfile, bindingProfile };
