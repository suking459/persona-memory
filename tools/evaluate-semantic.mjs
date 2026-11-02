import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {PersonaMemory} from '../src/index.js';
import {createSemanticRetriever,createHttpEmbedder,normalizeEmbeddingConfig} from '../adapters/semantic/index.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/semantic-cases.json',import.meta.url),'utf8'));
const subject={type:'project',id:'synthetic-evaluation'};
export function oracleEmbeddingFixture(){
  const queryIds=new Map(fixture.cases.map(item=>[item.query,item.expected[0]??'none']));
  const keys=new Map(fixture.records.map(record=>[record.key,record.id])),ids=['drink','release','storage','none'];
  return ({texts})=>texts.map(text=>{
    let id=queryIds.get(text);if(!id)try{id=keys.get(JSON.parse(text).key);}catch{}
    return ids.map(candidate=>candidate===(id??'none')?1:0);
  });
}
export async function evaluateSemantic({embed,mode='configured-provider',model,minSimilarity=0.55}={}){
  if(typeof embed!=='function')throw new TypeError('an explicit embedding provider or fixture is required');
  const pm=new PersonaMemory();
  for(const record of fixture.records)pm.putMemory({id:record.id,subject,kind:'fact',key:record.key,value:record.value,source:'manual',assertion:'explicit'});
  pm.putMemory({subject:{type:'user',id:'synthetic-private'},kind:'fact',key:'private',value:'Private coffee preference'});
  const retriever=createSemanticRetriever(pm,{subject,embed,minSimilarity}),cases=[],latencies=[];
  let passed=0,tp=0,fp=0,fn=0,fallbacks=0,lexicalPassed=0;
  for(const item of fixture.cases){
    const lexical=pm.searchMemories({subject,query:item.query,locale:item.locale,limit:1}).matches.map(hit=>hit.record.id);
    if(JSON.stringify(lexical)===JSON.stringify(item.expected))lexicalPassed++;
    const start=performance.now(),result=await retriever.search({query:item.query,locale:item.locale,limit:1});latencies.push(performance.now()-start);
    const actual=result.matches.map(hit=>hit.record.id),ok=JSON.stringify(actual)===JSON.stringify(item.expected);if(ok)passed++;
    for(const id of actual)if(item.expected.includes(id))tp++;else fp++;
    for(const id of item.expected)if(!actual.includes(id))fn++;
    if(result.semantic.mode==='fallback')fallbacks++;
    cases.push({locale:item.locale,query:item.query,expected:item.expected,actual,passed:ok,mode:result.semantic.mode,...(result.semantic.reason?{reason:result.semantic.reason}:{})});
  }
  latencies.sort((a,b)=>a-b);
  return {dataset:fixture.name,mode,...(model?{model}:{}),threshold:minSimilarity,cases:cases.length,passed,lexicalPassed,
    precision:tp/(tp+fp||1),recall:tp/(tp+fn||1),fallbacks,providerAttempts:retriever.stats().providerAttempts,
    latency:{p50Ms:latencies[Math.floor(latencies.length*.5)],p95Ms:latencies[Math.floor(latencies.length*.95)]},
    results:cases,limits:mode==='oracle-fixture'?'Oracle vectors exercise orchestration only. Not measured model quality, production accuracy, translation evaluation or an agent benchmark.':'Small synthetic relevance set only; measurements apply to this configured provider/model/threshold and time. Not production accuracy, exhaustive multilingual support or agent response quality.'};
}
export async function semanticEvaluationCommand(args){
  const options={};
  for(let i=0;i<args.length;i++){
    const key=args[i];if(key==='--fixture'){if(options.fixture)throw new TypeError('duplicate fixture option');options.fixture=true;continue;}
    if(!['--provider','--endpoint','--model','--api-key-env','--threshold','--out'].includes(key)||args[i+1]===undefined||Object.hasOwn(options,key))throw new TypeError('invalid semantic evaluation option');options[key]=args[++i];
  }
  if(options['--out']){
    const out=path.resolve(options['--out']);let present=false;try{fs.lstatSync(out);present=true;}catch(error){if(error.code!=='ENOENT')throw error;}
    if(present)throw Object.assign(new Error('output already exists'),{code:'EEXIST'});
    if(!fs.statSync(path.dirname(out)).isDirectory())throw new TypeError('output parent must be a directory');
  }
  const minSimilarity=options['--threshold']===undefined?0.55:Number(options['--threshold']);let embed,mode,model;
  if(options.fixture){
    if(['--provider','--endpoint','--model','--api-key-env'].some(key=>options[key]!==undefined))throw new TypeError('choose fixture or an explicit service');
    embed=oracleEmbeddingFixture();mode='oracle-fixture';
  }else{
    if(!options['--provider']||!options['--endpoint']||!options['--model'])throw new TypeError('use --fixture, or explicitly set --provider --endpoint --model [--api-key-env NAME]');
    const config=normalizeEmbeddingConfig({provider:options['--provider'],endpoint:options['--endpoint'],model:options['--model'],...(options['--api-key-env']?{apiKeyEnv:options['--api-key-env']}:{})});
    embed=createHttpEmbedder(config,{apiKey:config.apiKeyEnv?process.env[config.apiKeyEnv]:undefined});mode='configured-provider';model=config.model;
  }
  const report=await evaluateSemantic({embed,mode,model,minSimilarity});
  if(options['--out'])fs.writeFileSync(path.resolve(options['--out']),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const report=await semanticEvaluationCommand(process.argv.slice(2));process.stdout.write(JSON.stringify(report,null,2)+'\n');if(report.passed!==report.cases||report.fallbacks)process.exitCode=1;}
  catch{process.stderr.write('Semantic evaluation failed. Use --fixture, or an explicit provider/endpoint/model; check credentials and output path. No model is installed automatically.\n');process.exitCode=1;}
}
