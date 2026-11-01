// NDJSON framing is byte-bounded per message, processed sequentially with output backpressure.
import {once} from 'node:events';
export async function serveStdio(handle,{input=process.stdin,output=process.stdout,maxInputBytes=65536,maxOutputBytes=1048576}={}){
  const write=async value=>{
    const bytes=Buffer.from(JSON.stringify(value)+'\n');
    if(bytes.length>maxOutputBytes)throw new RangeError('response exceeds output budget');
    if(!output.write(bytes))await once(output,'drain');
  };
  let pieces=[],size=0;
  const line=async()=>{
    const bytes=Buffer.concat(pieces,size);pieces=[];size=0;
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if(!text.trim())return;
    let request;
    try{request=JSON.parse(text);}catch{await write({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});return;}
    const result=await handle(request);if(result!==null&&result!==undefined)await write(result);
  };
  for await(const raw of input){
    const chunk=Buffer.isBuffer(raw)?raw:Buffer.from(raw);let start=0;
    for(let i=0;i<chunk.length;i++)if(chunk[i]===10){
      const part=chunk.subarray(start,i);size+=part.length;
      if(size>maxInputBytes)throw new RangeError('message exceeds input budget');
      pieces.push(part);await line();start=i+1;
    }
    if(start<chunk.length){const part=chunk.subarray(start);size+=part.length;if(size>maxInputBytes)throw new RangeError('message exceeds input budget');pieces.push(Buffer.from(part));}
  }
  if(size)await line();
}
