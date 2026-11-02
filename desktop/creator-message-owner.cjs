const {createHash}=require('node:crypto');
const {createOperationBudget}=require('./operation-budget.cjs');

// A short OWN-profile proof, bound to the exact partition's identity-cookie generation.
// Values never leave this verifier; only ephemeral digests are retained. A
// cookie A->B->A transition still invalidates the lease via the changed event.
// Missing cookie observation falls back to fresh profile verification, never
// to a nickname, partition name, or an unverified cached identity.
function createCreatorMessageOwnerVerifier({inspectAccountHealth,fallbackBefore,now=Date.now,ttlMs=45000}){
  const sessions=new WeakMap(),proofs=new Map(),pending=new Map();let sessionSequence=0;
  const ownDomain=domain=>typeof domain==='string'&&/(^|\.)douyin\.com$/i.test(domain.replace(/^\./,''));
  // Request/device challenge identifiers do not identify the signed-in person.
  // Keep this allowlist small: unknown cookies still invalidate the proof.
  const volatileNames=new Set(['msToken','s_v_web_id','ttwid','tt_webid','tt_webid_v2']);
  const credentialNames=new Set(['sessionid','sessionid_ss','sid_guard','sid_tt','uid_tt','uid_tt_ss','sid_ucp_v1','ssid_ucp_v1']);
  const relevant=cookie=>ownDomain(cookie?.domain)&&!volatileNames.has(cookie.name);
  const cookieKey=cookie=>JSON.stringify([cookie.name,String(cookie.domain).toLowerCase(),cookie.path||'/']);
  // Expiry extension is not a credential change. Actual expiration/removal is
  // still observed below and excluded by snapshot(), including missing events.
  const cookieValue=cookie=>{
    let material=cookie.value;
    // sid_guard includes its SID plus issued-at/TTL/date metadata. Renewing
    // that metadata is not a new SID. Parse only the recognized complete
    // format; unknown formats remain opaque and invalidate conservatively.
    if(cookie.name==='sid_guard'&&typeof material==='string')try{const parts=decodeURIComponent(material).split('|');if(parts.length===4&&parts[0]&&/^\d+$/.test(parts[1])&&/^\d+$/.test(parts[2])&&parts[3])material=['sid_guard.sid',parts[0]];}catch{}
    return createHash('sha256').update(JSON.stringify([material,Boolean(cookie.secure),Boolean(cookie.httpOnly),cookie.sameSite||'unspecified'])).digest('hex');
  };
  const binding=(input,ctx)=>{
    const account=ctx.auth?.account;
    if(!ctx.auth?.userId||!account||account.id!==input.accountId||account.platform!=='douyin'||input.platform!=='douyin'||account.connectorSessionId!==input.sessionId||!account.nativeAccountKey)throw Error('创作者消息摘要所属绑定ID不完整，未读取');
    if(ctx.observedNativeAccountKey&&ctx.observedNativeAccountKey!==account.nativeAccountKey)throw Error('当前网页显示的本人账号ID与绑定不同，未读取消息');
    return JSON.stringify([ctx.auth.userId,account.id,input.sessionId,account.nativeAccountKey]);
  };
  const sessionState=accountSession=>{
    const cookies=accountSession?.cookies;
    if(!cookies||typeof cookies.get!=='function'||typeof cookies.on!=='function')return;
    let state=sessions.get(accountSession);
    if(!state){
      state={generation:0,credentialGeneration:0,serial:++sessionSequence,values:new Map()};
      cookies.on('changed',(_event,cookie,cause,removed)=>{
        if(!relevant(cookie))return;
        const key=cookieKey(cookie),value=cookieValue(cookie);
        // Chromium can report an overwrite removal followed by the insertion.
        // Preserve the old value for that pair so same-value renewal is benign,
        // while A->B->A still increments twice. Final disappearance is caught
        // by the full snapshot even when the insertion never arrives.
        if(removed){if(cause==='overwrite'&&state.values.get(key)===value)return;state.generation++;if(credentialNames.has(cookie.name))state.credentialGeneration++;state.values.delete(key);return;}
        if(typeof cookie.value!=='string'||state.values.get(key)!==value){state.generation++;if(credentialNames.has(cookie.name))state.credentialGeneration++;}
        state.values.set(key,value);
      });
      sessions.set(accountSession,state);
    }
    return state;
  };
  const snapshot=async accountSession=>{
    const state=sessionState(accountSession);if(!state)return;
    const generation=state.generation;
    const rows=await createOperationBudget(3000).run(()=>accountSession.cookies.get({}),'读取互动会话变化标识',3000);
    if(generation!==state.generation)throw Error('读取期间官方登录正在变化，已有消息保留，稍后自动重试');
    const active=rows.filter(cookie=>ownDomain(cookie.domain)&&cookie.value&&(!cookie.expirationDate||cookie.expirationDate>now()/1000));
    if(!active.some(cookie=>['sessionid','sessionid_ss','sid_guard'].includes(cookie.name)))return;
    const digest=createHash('sha256'),credentials=createHash('sha256');
    const identityCookies=active.filter(relevant);
    const serial=identityCookies.map(cookie=>cookieKey(cookie)+':'+cookieValue(cookie)).sort();
    state.values=new Map(identityCookies.map(cookie=>[cookieKey(cookie),cookieValue(cookie)]));
    for(const row of serial)digest.update(row+'\0');
    for(const row of identityCookies.filter(cookie=>credentialNames.has(cookie.name)).map(cookie=>cookieKey(cookie)+':'+cookieValue(cookie)).sort())credentials.update(row+'\0');
    return{state,generation,digest:digest.digest('hex'),credentialGeneration:state.credentialGeneration,credentialDigest:credentials.digest('hex')};
  };
  const same=(a,b)=>a&&b&&a.state===b.state&&a.generation===b.generation&&a.digest===b.digest;
  const sameCredentials=(a,b)=>a&&b&&a.state===b.state&&a.credentialGeneration===b.credentialGeneration&&a.credentialDigest===b.credentialDigest;
  const fresh=async(event,input,ctx,key,lease,allowPageStateChurn=false)=>{
    if(!inspectAccountHealth)throw Error('创作者消息摘要的本人ID核验尚不可用，已有结果保留');
    const requestKey=JSON.stringify([key,lease?.state.serial,lease?.generation,lease?.digest,allowPageStateChurn]);
    if(!pending.has(requestKey)){
      const task=createOperationBudget(12000).run(()=>inspectAccountHealth(event,{accessToken:input.accessToken,accountId:input.accountId}),'确认创作者消息摘要所属本人ID',12000).then(async observed=>{
        if(binding(input,ctx)!==key)throw Error('核验期间账号绑定身份发生变化，未读取消息');
        const account=ctx.auth.account;
        if(observed.state!=='normal'||observed.accountId!==input.accountId||observed.sessionId!==input.sessionId||observed.nativeAccountKey!==account.nativeAccountKey)throw Error('创作者消息摘要的本人账号ID未确认或已变化，私信结果已忽略；'+(observed.message||observed.error||'稍后自动重试'));
        const after=lease?await snapshot(ctx.guest.session):undefined;
        if(lease&&!same(lease,after)){
          // A second exact OWN-ID observation may settle ordinary page state,
          // but never changed credentials (including an auth A->B->A event).
          // Unknown-cookie churn DURING a message read is still rejected by
          // verify(), which always compares the full generation/digest.
          if(!(allowPageStateChurn&&sameCredentials(lease,after))){const error=Error('本人ID核验期间官方登录已变化，消息结果未套用');error.code='MATRIX_CREATOR_PROOF_STALE';error.pageStateOnly=Boolean(sameCredentials(lease,after));throw error;}
        }
        lease=after;
        if(lease){proofs.set(key,{...lease,at:now()});for(const [old,proof]of proofs)if(now()<proof.at||now()-proof.at>=ttlMs)proofs.delete(old);while(proofs.size>200)proofs.delete(proofs.keys().next().value);}
        return lease;
      }).finally(()=>pending.delete(requestKey));
      pending.set(requestKey,task);
    }
    return await pending.get(requestKey);
  };
  return{
    async begin(event,input,ctx){
      const key=binding(input,ctx);let lease=await snapshot(ctx.guest.session);
      if(!lease){await fallbackBefore(event,input,ctx);return{...ctx,creatorMessageProof:{key,fallback:true}};}
      const previous=proofs.get(key);
      if(!same(previous,lease)||now()<previous.at||now()-previous.at>=ttlMs){
        // No summary has been read yet. If loading the own-profile page itself
        // changes identity state, discard that proof and freshly verify the OWN
        // ID once more against the new snapshot. Never rebase verify() after a
        // message read: an in-flight A->B->A must still be rejected.
        const budget=createOperationBudget(16000);
        try{lease=await budget.run(()=>fresh(event,input,ctx,key,lease),'核验消息读取前的本人ID',16000);}
        catch(error){
          if(error.code!=='MATRIX_CREATOR_PROOF_STALE')throw error;
          proofs.delete(key);lease=await snapshot(ctx.guest.session);
          if(!lease)throw Error('本人ID核验期间登录已退出，未读取消息');
          lease=await budget.run(()=>fresh(event,input,ctx,key,lease,error.pageStateOnly===true),'重新确认消息读取前的本人ID',16000);
        }
      }
      if(!same(lease,await snapshot(ctx.guest.session)))throw Error('官方登录在读取前发生变化，未读取消息');
      return{...ctx,creatorMessageProof:{key,...lease}};
    },
    async verify(event,input,ctx){
      const key=binding(input,ctx),lease=ctx.creatorMessageProof;
      if(!lease||lease.key!==key)throw Error('本次消息读取缺少同一绑定会话的身份凭据，结果已忽略');
      if(lease.fallback){await fresh(event,input,ctx,key);return;}
      if(!same(lease,await snapshot(ctx.guest.session))){proofs.delete(key);throw Error('读取期间官方登录已变化，私信结果已忽略，已有消息保留');}
      const previous=proofs.get(key);
      if(!same(previous,lease)||now()<previous.at||now()-previous.at>=ttlMs)await fresh(event,input,ctx,key,lease);
      if(!same(lease,await snapshot(ctx.guest.session))){proofs.delete(key);throw Error('读取结束时官方登录已变化，消息结果已忽略');}
    },
  };
}
module.exports={createCreatorMessageOwnerVerifier};
