// Local TLS SMTP fixture. Never connects to a provider or sends real email.
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
export async function createRecoverySmtp(folder) {
  const cert=path.join(folder,'smtp-cert.pem'),key=path.join(folder,'smtp-key.pem');
  const generated=spawnSync('C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{windowsHide:true,encoding:'utf8'});
  if(generated.status!==0)throw Error('Unable to create disposable TLS fixture certificate');
  const mails=[],sockets=new Set();let rejectMail=false;
  const decode=raw=>{
    const split=raw.indexOf('\r\n\r\n'),head=raw.slice(0,split),body=raw.slice(split+4);
    if(/Content-Transfer-Encoding:\s*base64/i.test(head))return Buffer.from(body.replace(/\s/g,''),'base64').toString('utf8');
    if(/Content-Transfer-Encoding:\s*quoted-printable/i.test(head))return Buffer.from(body.replace(/=\r?\n/g,'').replace(/=([a-f\d]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))),'latin1').toString('utf8');
    return body;
  };
  const server=tls.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
    let buffer='',data=false,recipient='';socket.write('220 localhost isolated recovery QA\r\n');
    socket.on('data',chunk=>{
      buffer+=chunk.toString('utf8');
      while(true){
        if(data){const end=buffer.indexOf('\r\n.\r\n');if(end<0)return;
          const raw=buffer.slice(0,end);buffer=buffer.slice(end+5);data=false;
          if(rejectMail)socket.write('550 fixture delivery rejected\r\n');
          else {mails.push({recipient,text:decode(raw)});socket.write('250 accepted by local fixture only\r\n');}
          continue;
        }
        const end=buffer.indexOf('\r\n');if(end<0)return;const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
        if(/^EHLO|^HELO/i.test(line))socket.write('250-localhost\r\n250-AUTH PLAIN\r\n250 SIZE 1048576\r\n');
        else if(/^AUTH PLAIN /i.test(line))socket.write('235 fixture authenticated\r\n');
        else if(/^MAIL FROM:/i.test(line))socket.write('250 ok\r\n');
        else if(/^RCPT TO:/i.test(line)){recipient=/<([^>]+)>/.exec(line)?.[1]||'';socket.write('250 ok\r\n');}
        else if(/^DATA$/i.test(line)){data=true;socket.write('354 send fixture message\r\n');}
        else if(/^QUIT$/i.test(line)){socket.end('221 bye\r\n');return;}
        else if(/^RSET|^NOOP/i.test(line))socket.write('250 ok\r\n');
        else socket.write('500 unsupported fixture command\r\n');
      }
    });
  });
  server.on('tlsClientError',()=>{});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {port:server.address().port,cert,mails,reject(value){rejectMail=value;},async close(){for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
}
