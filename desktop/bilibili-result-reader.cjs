const {createOfficialResultReader}=require('./official-publish-result-reader.cjs');
function createBilibiliResultReader(options){
  if(options.record?.platform!=='bilibili')throw Error('Expected original Bilibili publication');
  return createOfficialResultReader(options);
}
module.exports={createBilibiliResultReader};
