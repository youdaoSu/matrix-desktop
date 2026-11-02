import { useEffect, useState } from 'react';
import { getInlineEmojiCatalog, inlineEmojiTokens, loadInlineEmojiCatalog, needsInlineEmoji, subscribeInlineEmoji } from './douyin-inline-emoji';

function Emoji({url,token}:{url:string;token:string}){
  const [failed,setFailed]=useState(false);
  return failed?<>{token}</>:<img src={url} alt={token} title={token} referrerPolicy="no-referrer" loading="lazy" className="matrix-inline-emoji" onError={()=>setFailed(true)}/>;
}
export function DouyinInlineText({text}:{text:string}){
  const [,update]=useState(0),needed=needsInlineEmoji(text);
  useEffect(()=>{if(!needed)return;const unsubscribe=subscribeInlineEmoji(()=>update(n=>n+1));void loadInlineEmojiCatalog();return unsubscribe;},[needed]);
  const catalog=getInlineEmojiCatalog();
  let images=0;
  return <>{inlineEmojiTokens(text).map((token,index)=>catalog[token]&&images++<128?<Emoji key={index+'/'+catalog[token]} token={token} url={catalog[token]}/>:token)}</>;
}
