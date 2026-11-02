import { BadRequestException, HttpException, Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, count, desc, eq, gt, sql } from 'drizzle-orm';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import * as jwt from 'jsonwebtoken';
import { operationLogs } from '@server/database/schema';
import { sanitizePublishErrorReport, type PublishErrorReport } from '@shared/publish-error-report';
const ACTION = 'publish_error_report';
const digest = (report: PublishErrorReport) => createHash('sha256').update(JSON.stringify(report)).digest('hex');
const acknowledgement = (secret:string,id:string,reportId:string) => createHmac('sha256',secret).update(['accepted',id,reportId].join('\0')).digest('hex');
@Injectable()
export class FeedbackService implements OnModuleInit, OnModuleDestroy {
  private intake?: Server;
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}
  private sanitize(value: unknown) { try { return sanitizePublishErrorReport(value); } catch (error) { throw new BadRequestException((error as Error).message); } }
  private config(): { url?: string; port?: number; invalid?: boolean } {
    const file = process.env.MATRIX_FEEDBACK_CONFIG_FILE;
    if (!file) return {};
    let value: { url?: string; port?: number };try { value = JSON.parse(readFileSync(file,'utf8')); } catch { return {}; }
    const port=Number.isInteger(value.port) && value.port! >= 1024 && value.port! < 65536 ? value.port : undefined;
    if (!value.url) return {port};
    try { const url = new URL(value.url);if(url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || !/^(?:[a-z0-9-]+\.)+(?:cpolar\.top|cpolar\.cn|cpolar\.io)$/.test(url.hostname)) return {port,invalid:true};return { url:url.origin,port }; } catch { return {port,invalid:true}; }
  }
  async submit(userId: string, raw: unknown) {
    const report = this.sanitize(raw), { url, invalid } = this.config();
    if(invalid)throw new HttpException('反馈地址无效，请联系管理员或导出报告',503);
    if (!url) return { ...await this.store(userId,report), delivery:'local' };
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) throw new HttpException('反馈签名未配置；请导出报告',503);
    const ticket = jwt.sign({ scope:ACTION, userId, reportId:report.reportId, digest:digest(report) },secret,{audience:'matrix-error-intake',expiresIn:60});
    try {
      const response = await fetch(url+'/reports',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+ticket},body:JSON.stringify(report),redirect:'error',signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw Error('反馈入口返回 '+response.status);
      const reader=response.body?.getReader();if(!reader)throw Error('反馈回执缺失');let size=0;const chunks:Uint8Array[]=[];
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000){await reader.cancel();throw Error('反馈回执过大');}chunks.push(value);}
      const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!result.accepted || result.reportId !== report.reportId || !/^[a-f0-9-]{36}$/i.test(result.id))throw Error('反馈回执无效');
      if(typeof result.signature!=='string' || !/^[a-f0-9]{64}$/.test(result.signature) || !timingSafeEqual(Buffer.from(result.signature,'hex'),Buffer.from(acknowledgement(secret,result.id,report.reportId),'hex')))throw Error('反馈回执签名无效');
      return {...result,delivery:'tunnel'};
    } catch { throw new HttpException('开发者反馈入口未确认接收，请重试或导出报告；本条发布状态未改变',502); }
  }
  async store(userId: string, report: PublishErrorReport) {
    return this.db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), 3103)`);
      const where=and(eq(operationLogs.action,ACTION),eq(operationLogs.operatorId,userId));
      const [existing]=await tx.select({id:operationLogs.id}).from(operationLogs).where(and(where,eq(operationLogs.targetId,report.reportId))).limit(1);
      if(existing)return {accepted:true,reportId:report.reportId,id:existing.id,deduplicated:true};
      const [recent]=await tx.select({total:count()}).from(operationLogs).where(and(where,gt(operationLogs.createdAt,new Date(Date.now()-60000))));
      if(Number(recent?.total)>=5)throw new HttpException('反馈过于频繁，请一分钟后再试',429);
      const [saved]=await tx.insert(operationLogs).values({operatorType:'user',operatorId:userId,action:ACTION,targetType:'publish_task_error',targetId:report.reportId,detail:JSON.stringify(report)}).returning({id:operationLogs.id});
      return {accepted:true,reportId:report.reportId,id:saved.id,deduplicated:false};
    });
  }
  async list(page = 1, pageSize = 20) {
    if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new BadRequestException('分页参数无效');
    const where=eq(operationLogs.action,ACTION);
    const [total,rows]=await Promise.all([this.db.select({total:count()}).from(operationLogs).where(where),this.db.select().from(operationLogs).where(where).orderBy(desc(operationLogs.createdAt),desc(operationLogs.id)).limit(pageSize).offset((page-1)*pageSize)]);
    return {items:rows.map(row=>{let report:PublishErrorReport|undefined;try{report=this.sanitize(JSON.parse(row.detail || '{}'));}catch{}return {id:row.id,receivedAt:row.createdAt,reporterId:row.operatorId,report};}),total:Number(total[0]?.total || 0),page,pageSize};
  }
  async onModuleInit() {
    const { port } = this.config();if (!port) return;
    const secret=process.env.JWT_SECRET;if(!secret || secret.length < 32) return;
    let inFlight=0,windowAt=Date.now(),requests=0;
    this.intake=createServer((request,response)=>{
      const reply=(status:number,value:unknown)=>{if(!response.headersSent){response.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});response.end(JSON.stringify(value));}};
      if(request.url==='/health' && request.method==='GET'){reply(200,{ok:true,service:'matrix-error-intake'});return;}
      if(request.url!=='/reports' || request.method!=='POST'){reply(404,{error:'Not found'});request.resume();return;}
      if(Date.now()-windowAt>60000){windowAt=Date.now();requests=0;}
      if(++requests>30 || inFlight>=5){reply(429,{error:'Rate limited'});request.resume();return;}
      if(!/^application\/json(?:;|$)/i.test(request.headers['content-type']||'')){reply(415,{error:'JSON required'});request.resume();return;}
      let ticket:jwt.JwtPayload;
      try {const verified=jwt.verify((request.headers.authorization||'').replace(/^Bearer /,''),secret,{audience:'matrix-error-intake',algorithms:['HS256']});if(typeof verified==='string' || verified.scope!==ACTION || !/^[a-f0-9-]{36}$/i.test(verified.userId) || !/^[a-f0-9]{64}$/.test(verified.digest))throw Error();ticket=verified;}catch{reply(401,{error:'Invalid delivery ticket'});request.resume();return;}
      inFlight++;let size=0,body='',finished=false;
      const finish=()=>{if(!finished){finished=true;inFlight--;}};
      const timer=setTimeout(()=>{reply(408,{error:'Request timeout'});request.destroy();finish();},10000);timer.unref();
      request.on('error',()=>{clearTimeout(timer);finish();});request.on('aborted',()=>{clearTimeout(timer);finish();});
      request.setEncoding('utf8');
      request.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>32768){reply(413,{error:'Report too large'});request.destroy();clearTimeout(timer);finish();}else body+=chunk;});
      request.on('end',()=>{clearTimeout(timer);if(finished)return;void(async()=>{try{const report=this.sanitize(JSON.parse(body));if(ticket.reportId!==report.reportId || ticket.digest!==digest(report))throw Error('Invalid report');const saved=await this.store(ticket.userId,report);reply(200,{...saved,signature:acknowledgement(secret,saved.id,report.reportId)});}catch(error){reply(error instanceof HttpException?error.getStatus():400,{error:'Report not accepted'});}finally{finish();}})();});
    });
    this.intake.maxConnections=20;this.intake.headersTimeout=5000;this.intake.requestTimeout=10000;
    await new Promise<void>(resolve=>{this.intake!.once('error',()=>{this.intake=undefined;resolve();});this.intake!.listen(port,'127.0.0.1',resolve);});
  }
  onModuleDestroy() {this.intake?.closeAllConnections();this.intake?.close();}
}
