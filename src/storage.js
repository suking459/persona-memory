// Snapshot stores use explicit compare-and-swap; they do not merge application state.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const MAX_BYTES=67108864;
const digest=text=>createHash('sha256').update(text).digest('hex');
export function storageError(code,message){return Object.assign(new Error(message),{code});}
export function checkRevision(value,{empty=true}={}){
  if((empty && value===null) || (typeof value==='string' && value.length>0 && value.length<=256))return value;
  throw new TypeError('invalid snapshot store revision');
}
function serialize(snapshot,maxBytes){
  const text=JSON.stringify(snapshot);
  if(typeof text!=='string' || Buffer.byteLength(text)>maxBytes)throw new RangeError('snapshot exceeds store byte limit');
  return text;
}
function readResult(text){return {snapshot:JSON.parse(text.replace(/^\uFEFF/,'')),revision:digest(text)};}
export class MemorySnapshotStore {
  constructor({snapshot=null,maxBytes=MAX_BYTES}={}){
    if(!Number.isSafeInteger(maxBytes) || maxBytes<1024 || maxBytes>MAX_BYTES)throw new RangeError('invalid store byte limit');
    this.maxBytes=maxBytes;this._text=snapshot===null?null:serialize(snapshot,maxBytes);
    this._revision=this._text===null?null:randomUUID();
  }
  async read(){return {snapshot:this._text===null?null:JSON.parse(this._text),revision:this._revision};}
  async write(snapshot,{expectedRevision}={}){
    checkRevision(expectedRevision);
    const text=serialize(snapshot,this.maxBytes);
    if(expectedRevision!==this._revision)throw storageError('ERR_STORE_CONFLICT','snapshot changed; reload and resolve before writing');
    this._text=text;this._revision=randomUUID();return {revision:this._revision};
  }
}
export class JsonFileStore {
  constructor({file,maxBytes=MAX_BYTES}={}){
    if(typeof file!=='string' || !file.trim())throw new TypeError('store file required');
    if(!Number.isSafeInteger(maxBytes) || maxBytes<1024 || maxBytes>MAX_BYTES)throw new RangeError('invalid store byte limit');
    this.file=path.resolve(file);this.maxBytes=maxBytes;
  }
  readSync(){
    let fd;
    try{
      fd=fs.openSync(this.file,'r');
      if(fs.fstatSync(fd).size>this.maxBytes)throw new RangeError('snapshot exceeds store byte limit');
      const text=fs.readFileSync(fd,'utf8');
      if(Buffer.byteLength(text)>this.maxBytes)throw new RangeError('snapshot exceeds store byte limit');
      return readResult(text);
    }catch(error){if(error.code==='ENOENT')return {snapshot:null,revision:null};throw error;}
    finally{if(fd!==undefined)fs.closeSync(fd);}
  }
  writeSync(snapshot,{expectedRevision}={}){
    checkRevision(expectedRevision);const text=serialize(snapshot,this.maxBytes);
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const lock=this.file+'.lock',tmp=this.file+'.'+randomUUID()+'.tmp';
    let lockFd,committed=false;
    try{
      try{lockFd=fs.openSync(lock,'wx',0o600);}
      catch(error){if(error.code==='EEXIST')throw storageError('ERR_STORE_LOCKED','snapshot is locked; retry explicitly after the writer finishes');throw error;}
      if(this.readSync().revision!==expectedRevision)throw storageError('ERR_STORE_CONFLICT','snapshot changed; reload and resolve before writing');
      fs.writeFileSync(tmp,text,{flag:'wx',mode:0o600});
      const fd=fs.openSync(tmp,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      fs.renameSync(tmp,this.file);committed=true;
      return {revision:digest(text)};
    }finally{
      if(!committed){try{fs.unlinkSync(tmp);}catch{}}
      if(lockFd!==undefined){try{fs.closeSync(lockFd);}finally{fs.unlinkSync(lock);}}
    }
  }
  async read(){return this.readSync();}
  async write(snapshot,options){return this.writeSync(snapshot,options);}
}
