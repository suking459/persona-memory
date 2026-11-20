import fs from 'node:fs';
import path from 'node:path';
function canonicalLocation(value){
  let current=path.resolve(value);const missing=[];
  for(let steps=0;steps<256;steps++){
    try{return path.join(fs.realpathSync(current),...missing.reverse());}
    catch(error){
      if(error.code!=='ENOENT')throw error;
      const parent=path.dirname(current);if(parent===current)throw error;
      missing.push(path.basename(current));current=parent;
    }
  }
  throw new RangeError('output path exceeds supported depth');
}
export function assertOwnerOutput(file,storage){
  const output=path.resolve(file),parent=fs.realpathSync(path.dirname(output));
  const fold=s=>process.platform==='win32'?s.toLowerCase():s;
  const actual=fold(path.join(parent,path.basename(output))),store=fold(canonicalLocation(storage));
  const relative=path.relative(store,actual);
  if(relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)))throw new TypeError('Owner output must be outside the memory store');
  return output;
}
