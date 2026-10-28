// Opt-in, one-shot, read-only analysis. No hooks, writes, or process control in QQA.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PersonaMemory} from '../src/index.js';
import {parse} from '../adapters/generic/index.js';
export function summarizeShadow(rows) {
  const salt=randomBytes(32),anonymous=value=>createHash('sha256').update(salt).update(String(value)).digest('hex');
  let now=0;const pm=new PersonaMemory({clock:()=>now,config:{historyLimit:0}});
  const result={messages:0,skipped:0,duplicates:0,outOfOrder:0,tagObservations:0,contextCharacters:0,mode:'offline-shadow',modelUsageConfirmed:0};
  for(const raw of rows){
    const input=parse(raw);
    if(!input || !Number.isFinite(input.ts)) {result.skipped++;continue;}
    now=Math.max(now,input.ts);
    const message={...input,chatId:anonymous(input.chatId),userId:anonymous(input.userId),eventId:input.eventId?anonymous(input.eventId):undefined,raw:undefined};
    try{
      const r=pm.ingest(message);result.messages++;if(r.duplicate)result.duplicates++;if(r.ignored)result.outOfOrder++;
      result.tagObservations+=(r.tags||[]).length;
      result.contextCharacters+=pm.buildContext({chatId:message.chatId,userIds:[message.userId]}).characters;
    }catch{result.skipped++;}
  }
  return {...result,...pm.diagnostics(),limits:'No chat text or identifiers exported. Shadow preview does not prove the production bot used this context.'};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const at=process.argv.indexOf('--source'),source=process.argv[at+1];
  if(at<0 || !source)throw new Error('Usage: npm run shadow -- --source <normalized JSON array or NDJSON file>');
  const file=path.resolve(source),stat=fs.statSync(file);
  if(!stat.isFile() || stat.size>16*1024*1024)throw new Error('Source must be a regular file up to 16 MiB; use a bounded snapshot');
  const raw=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').trim();
  const rows=raw.startsWith('[')?JSON.parse(raw):raw.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  if(!Array.isArray(rows) || rows.length>10000)throw new Error('Maximum 10000 messages per snapshot');
  const report=summarizeShadow(rows);
  const output=new URL('../.shadow/',import.meta.url);fs.mkdirSync(output,{recursive:true});
  const directory=fs.realpathSync(fileURLToPath(output)),project=fs.realpathSync(fileURLToPath(new URL('../',import.meta.url)));
  if(!directory.startsWith(project+path.sep))throw new Error('Observer output must stay inside this project');
  const target=path.join(directory,'summary.json');
  if(fs.existsSync(target) && (fs.lstatSync(target).isSymbolicLink() || fs.realpathSync(target)===fs.realpathSync(file)))throw new Error('Refusing to overwrite an input or symlink');
  fs.writeFileSync(target,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
