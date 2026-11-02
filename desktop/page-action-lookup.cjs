// Internal durable lookup, independent of the UI's latest200 display cap.
// Preserve the public interrupted-state normalization and ownership boundary.
function publicPageAction(record){
  const result=Object.fromEntries(Object.entries(record).filter(([key])=>key!=='ownerId'&&!/cookie|password|passwd|authorization|token|csrf|secret/i.test(key)));
  return result.status==='submitting'?{...result,status:'unknown',message:'上次提交过程被中断，请到官方页面核对结果后再操作。'}:result;
}
function findOwnedPageAction(journal,ownerId,id){
  if(typeof ownerId!=='string'||!ownerId||typeof id!=='string'||!id||id.length>120)return;
  const record=typeof journal.find==='function'?journal.find(ownerId,id):journal.list(ownerId).find(row=>row.id===id);
  if(!record||record.id!==id||record.ownerId!==undefined&&record.ownerId!==ownerId)return;
  return publicPageAction(record);
}
module.exports={findOwnedPageAction,publicPageAction};
