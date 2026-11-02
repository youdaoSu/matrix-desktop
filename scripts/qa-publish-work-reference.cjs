const assert=require('node:assert/strict');
const {normalizePublishWorkReference:normalize}=require('./qa-load-typescript.cjs').loadTs('shared/publish-work-reference.ts');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
for(const [platform,workId,workUrl] of [['bilibili','BV1jnnE6PEBp','https://www.bilibili.com/video/BV1jnnE6PEBp/'],['douyin','7698319813789470607','https://www.douyin.com/video/7698319813789470607'],['xiaohongshu','abcdef0123456789abcdef01','https://www.xiaohongshu.com/explore/abcdef0123456789abcdef01']]){
 const reference={workId,workUrl,workReferenceSource:'official_title_link'};eq(normalize(platform,reference),reference);
 for(const patch of [{workId:'another'},{workReferenceSource:'title_guess'},{workUrl:workUrl+'?token=not-stored'},{workUrl:workUrl+'#reply-1'},{workUrl:workUrl.replace('https:','http:')},{workUrl:workUrl.replace('www.','www.evil.')},{workUrl:workUrl.replace('https://','https://user:secret@')},{workUrl:workUrl.replace('.com/','.com:8443/')}])eq(normalize(platform,{...reference,...patch}),undefined);
 eq(normalize('wechat',reference),undefined);eq(normalize(platform,{...reference,cookie:'never-return-extra-state'}),reference);
}
for(const value of [null,undefined,'name',[],{},42])eq(normalize('bilibili',value),undefined);
console.log(JSON.stringify({exactPublishWorkReferenceChecks:checks,noTitleOrNicknameGuess:true,noCredentialOrQueryRetention:true,notAuthorizationForWrites:true}));
