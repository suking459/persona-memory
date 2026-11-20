// Repository prose uses English; source-language content and explicit locales are intentional.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),han=/\p{Script=Han}/u;
const excludedDocs=new Set(['WORKING-AGREEMENT.md','DEVELOPMENT.md','PROMO.md','V2EX-POST.md','RELEASE.md']);
const resources=new Map([
  ['adapters/onebot/index.js','Compatibility placeholders used by linguistic evidence checks'],
  ['src/locale.js','Explicit Chinese locale resource'],
  ['src/retrieval.js','Chinese stop words'],
  ['src/text-policy.js','Chinese linguistic evidence rules'],
  ['src/presets.js','Historical compatible tag identifiers and localized advice'],
  ['adapters/agent/bundle.js','Explicit locale resources and WorkBuddy localized metadata'],
  ['adapters/agent/workflow.js','Explicit Chinese workflow option'],
  ['adapters/agent/operations.js','Explicit Chinese owner-guide option'],
  ['adapters/agent/shared-bundle.js','WorkBuddy localized metadata'],
  ['tools/evaluate.mjs','Synthetic multilingual benchmark input'],
]);
function files(relative){return fs.readdirSync(path.join(root,relative),{withFileTypes:true}).flatMap(e=>{
  const name=path.posix.join(relative,e.name);return e.isDirectory()?files(name):e.isFile()?[name]:[];
});}
const targets=['README.md','NOTICE.md','CHANGELOG.md',...files('docs').filter(f=>f.endsWith('.md')&&!excludedDocs.has(path.basename(f))),
  ...['src','adapters','examples','demo','tools'].flatMap(files).filter(f=>/\.(?:js|mjs|ts|mts|html)$/.test(f)&&!f.startsWith('tools/fixtures/'))];
const failures=[],retained=[];
for(const file of targets){
  const text=fs.readFileSync(path.join(root,file),'utf8');
  if(resources.has(file)){if(han.test(text))retained.push({file,reason:resources.get(file)});continue;}
  let fence=false;
  for(const [index,line] of text.split(/\r?\n/).entries()){
    if(file.startsWith('docs/')&&/^\s*(?:```|~~~)/.test(line)){fence=!fence;continue;}
    // Non-English query examples are permitted inside documentation code fences only.
    if(han.test(line)&&!(file.startsWith('docs/')&&fence))failures.push(file+':'+(index+1));
  }
}
console.log(JSON.stringify({checked:targets.length,prosePolicy:'English',retainedLanguageResources:retained,failures},null,2));
if(failures.length)process.exitCode=1;
