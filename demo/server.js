import http from 'node:http';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createDemoState} from './scenarios.js';
export function createDemoServer({storage=null}={}) {
  const demo=createDemoState({storage});
  return http.createServer(async(req,res)=>{
    const json=(status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
    try{
      const url=new URL(req.url,'http://127.0.0.1'),scenario=url.searchParams.get('scenario')||'community';
      if(req.method==='GET' && url.pathname==='/'){
        res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(readFileSync(new URL('./index.html',import.meta.url)));
      }
      if(req.method==='GET' && url.pathname==='/api/state')return json(200,demo.state(scenario));
      if(req.method!=='POST' || !req.headers['content-type']?.startsWith('application/json'))return json(404,{error:'not found'});
      if(req.headers.origin && new URL(req.headers.origin).origin!=='http://'+req.headers.host)return json(403,{error:'cross-origin request denied'});
      const chunks=[];let bytes=0;for await(const c of req){bytes+=c.length;if(bytes>16384)return json(413,{error:'body too large'});chunks.push(c);}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
      if(url.pathname==='/api/chat')return json(200,demo.chat(scenario,body.text));
      if(url.pathname==='/api/action')return json(200,demo.action(scenario,body.action));
      return json(404,{error:'not found'});
    }catch(e){return json(e instanceof TypeError || e instanceof SyntaxError?400:500,{error:e.message});}
  });
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const server=createDemoServer({storage:path.join(path.dirname(fileURLToPath(import.meta.url)),'.data')});
  server.listen(Number(process.env.PORT)||7788,'127.0.0.1',()=>console.log('Relationship rule demo: http://127.0.0.1:'+server.address().port));
}
