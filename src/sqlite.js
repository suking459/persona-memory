// Optional native store. Importing this module never loads node:sqlite.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {checkRevision,storageError} from './storage.js';
import {copySnapshotJSON} from './snapshot.js';
const require=createRequire(import.meta.url),APP_ID=0x504d454d,MAX_BYTES=67108864;
function nativeDatabase(){
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major<22||(major===22&&minor<13))throw storageError('ERR_SQLITE_UNAVAILABLE','SQLite requires Node 22.13 or newer; use JSON on older Node versions');
  try{const sqlite=require('node:sqlite');return sqlite.Database??sqlite.DatabaseSync;}
  catch{throw storageError('ERR_SQLITE_UNAVAILABLE','This Node runtime does not provide node:sqlite; use JSON');}
}
function regular(file){
  try{const s=fs.lstatSync(file);if(!s.isFile()||s.nlink>1)throw storageError('ERR_STORE_FILE','SQLite requires a single-link regular file, not a link or device');return s;}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
}
function validate(db){
  const app=db.prepare('PRAGMA application_id').get().application_id;
  const version=db.prepare('PRAGMA user_version').get().user_version;
  const objects=db.prepare("SELECT name,type FROM sqlite_schema WHERE substr(name,1,7)!='sqlite_' LIMIT 2").all();
  if(app!==APP_ID||version!==1||objects.length!==1||objects[0].name!=='pm_snapshots'||objects[0].type!=='table')throw storageError('ERR_SQLITE_IDENTITY','Database is not a supported persona-memory store; original preserved');
  const cols=db.prepare("PRAGMA table_xinfo('pm_snapshots')").all();
  if(cols.length!==3||cols.some((c,i)=>c.name!==['namespace','revision','snapshot'][i]||c.type!=='TEXT'||c.notnull!==1||c.hidden!==0||c.pk!==(i===0?1:0)||c.dflt_value!==null))throw storageError('ERR_SQLITE_SCHEMA','Unexpected SQLite store schema; original preserved');
  const table=db.prepare("PRAGMA table_list('pm_snapshots')").get();
  if(table?.strict!==1||table.type!=='table'||table.ncol!==3)throw storageError('ERR_SQLITE_SCHEMA','Unexpected SQLite table');
  if(db.prepare('PRAGMA journal_mode').get().journal_mode!=='delete')throw storageError('ERR_SQLITE_SCHEMA','Unsupported journal mode; use a logical snapshot backup for migration');
}
export class SQLiteSnapshotStore {
  constructor({file,namespace='default',maxBytes=MAX_BYTES,maxNamespaces=32}={}){
    if(typeof file!=='string'||!file.trim()||/[\u0000-\u001f]/.test(file))throw new TypeError('SQLite file required');
    if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(path.basename(file)))throw new TypeError('reserved device filename');
    if(typeof namespace!=='string'||!namespace.trim()||namespace.length>256)throw new TypeError('invalid SQLite namespace');
    if(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>MAX_BYTES)throw new RangeError('invalid store byte limit');
    if(!Number.isSafeInteger(maxNamespaces)||maxNamespaces<1||maxNamespaces>1024)throw new RangeError('invalid namespace limit');
    this._Database=nativeDatabase();this.file=path.resolve(file);this.namespace=namespace;this.maxBytes=maxBytes;this.maxNamespaces=maxNamespaces;
  }
  _run(write,operation){
    const entry=regular(this.file);
    if(!entry&&!write)return {snapshot:null,revision:null};
    let created=false,db,transaction=false;
    if(!entry){
      fs.mkdirSync(path.dirname(this.file),{recursive:true});
      try{const fd=fs.openSync(this.file,'wx',0o600);fs.closeSync(fd);created=true;}
      catch(error){if(error.code!=='EEXIST')throw error;regular(this.file);}
    }
    try{
      db=new this._Database(this.file,{readOnly:!write,allowExtension:false,enableDoubleQuotedStringLiterals:false});
      db.exec('PRAGMA busy_timeout=0; PRAGMA trusted_schema=OFF;');
      if(typeof db.enableDefensive==='function')db.enableDefensive(true);
      if(write)db.exec('PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;');
      db.exec(write?'BEGIN IMMEDIATE':'BEGIN');transaction=true;
      // Only a file exclusively created by this operation can acquire our identity.
      if(created){
        if(db.prepare('PRAGMA application_id').get().application_id!==0||db.prepare('SELECT count(*) AS n FROM sqlite_schema').get().n!==0)throw storageError('ERR_SQLITE_IDENTITY','New database changed before initialization');
        db.exec('CREATE TABLE pm_snapshots(namespace TEXT NOT NULL PRIMARY KEY,revision TEXT NOT NULL,snapshot TEXT NOT NULL) STRICT; PRAGMA application_id='+APP_ID+'; PRAGMA user_version=1;');
      }
      validate(db);const result=operation(db);
      db.exec('COMMIT');transaction=false;return result;
    }catch(error){
      if(transaction){try{db.exec('ROLLBACK');}catch{}}
      if(error.errcode===5||error.errcode===6)throw storageError('ERR_STORE_LOCKED','SQLite writer is busy; retry explicitly after it finishes');
      throw error;
    }finally{if(db)db.close();}
  }
  readSync(){
    const loaded=this._run(false,db=>{
      const row=db.prepare('SELECT revision,length(CAST(snapshot AS BLOB)) AS bytes FROM pm_snapshots WHERE namespace=?').get(this.namespace);
      if(!row)return {snapshot:null,revision:null};
      checkRevision(row.revision,{empty:false});
      if(row.bytes>this.maxBytes)throw new RangeError('snapshot exceeds store byte limit');
      return {bytes:db.prepare('SELECT CAST(snapshot AS BLOB) AS bytes FROM pm_snapshots WHERE namespace=?').get(this.namespace).bytes,revision:row.revision};
    });
    if(loaded.snapshot===null)return loaded;
    const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(loaded.bytes);
    return {snapshot:JSON.parse(text),revision:loaded.revision};
  }
  writeSync(snapshot,{expectedRevision}={}){
    checkRevision(expectedRevision);
    const text=JSON.stringify(copySnapshotJSON(snapshot,this.maxBytes));
    if(expectedRevision!==null&&!regular(this.file))throw storageError('ERR_STORE_CONFLICT','snapshot was removed; inspect before writing');
    return this._run(true,db=>{
      const row=db.prepare('SELECT revision FROM pm_snapshots WHERE namespace=?').get(this.namespace);
      if((row?.revision??null)!==expectedRevision)throw storageError('ERR_STORE_CONFLICT','snapshot changed; reload and resolve before writing');
      if(!row&&db.prepare('SELECT count(*) AS n FROM pm_snapshots').get().n>=this.maxNamespaces)throw storageError('ERR_STORE_CAPACITY','SQLite namespace limit reached');
      const revision=randomUUID();
      db.prepare('INSERT INTO pm_snapshots(namespace,revision,snapshot) VALUES(?,?,?) ON CONFLICT(namespace) DO UPDATE SET revision=excluded.revision,snapshot=excluded.snapshot').run(this.namespace,revision,text);
      return {revision};
    });
  }
  async read(){return this.readSync();}
  async write(snapshot,options){return this.writeSync(snapshot,options);}
}
