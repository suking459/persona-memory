import fs from 'node:fs';
import path from 'node:path';
import {compareMemoryTrials} from '../src/metrics.js';
import {readBackupJSON} from '../adapters/agent/backup.js';
export function compareTrialsCommand(options){
  if(!options.input)throw new TypeError('--input required');
  const report=compareMemoryTrials(readBackupJSON(options.input,65536));
  if(options.out){const fd=fs.openSync(path.resolve(options.out),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(report,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
  return report;
}
