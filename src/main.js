// Node resolves main modules through links, while argv[1] can retain the npm link.
import {realpathSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function isMainModule(url){
  const entry=process.argv[1];if(!entry)return false;
  if(url===pathToFileURL(entry).href)return true;
  try{return url===pathToFileURL(realpathSync(entry)).href;}catch{return false;}
}
