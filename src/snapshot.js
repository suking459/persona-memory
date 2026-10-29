// Copy imported JSON without getters/toJSON, under one byte/depth/node budget.
import {capacityError} from './limits.js';
const MAX_DEPTH=32,MAX_NODES=2000000;
export function copySnapshotJSON(value,maxBytes){
  let bytes=0,nodes=0;const ancestors=new Set();
  const charge=n=>{bytes+=n;if(bytes>maxBytes)throw capacityError('snapshot');};
  const stringCost=value=>{
    // A JSON string cannot be shorter than its UTF-16 length plus delimiters.
    if(value.length+2>maxBytes-bytes)throw capacityError('snapshot');
    let cost=2;
    for(let i=0;i<value.length;i++){
      const code=value.charCodeAt(i);
      if(code===34||code===92)cost+=2;
      else if(code<32)cost+=[8,9,10,12,13].includes(code)?2:6;
      else if(code<128)cost++;
      else if(code<2048)cost+=2;
      else if(code>=0xd800&&code<=0xdbff){
        const next=value.charCodeAt(i+1);if(next>=0xdc00&&next<=0xdfff){cost+=4;i++;}else cost+=6;
      }else if(code>=0xdc00&&code<=0xdfff)cost+=6;
      else cost+=3;
      if(cost>maxBytes-bytes)throw capacityError('snapshot');
    }
    return cost;
  };
  function copy(raw,depth){
    if(++nodes>MAX_NODES||depth>MAX_DEPTH)throw capacityError('snapshot structure');
    if(raw===null){charge(4);return null;}
    if(typeof raw==='string'){charge(stringCost(raw));return raw;}
    if(typeof raw==='boolean'){charge(raw?4:5);return raw;}
    if(typeof raw==='number'){if(!Number.isFinite(raw))throw new TypeError('snapshot requires finite JSON numbers');charge(String(raw).length);return raw;}
    if(!raw||typeof raw!=='object')throw new TypeError('snapshot requires JSON data');
    if(ancestors.has(raw))throw new TypeError('cyclic snapshot');
    ancestors.add(raw);let result;charge(2);
    const keys=Reflect.ownKeys(raw);
    if(Array.isArray(raw)){
      if(raw.length>MAX_NODES||keys.length!==raw.length+1)throw new TypeError('snapshot requires dense JSON arrays');
      result=[];
      for(let i=0;i<raw.length;i++){
        const d=Object.getOwnPropertyDescriptor(raw,String(i));
        if(!d||!d.enumerable||!Object.hasOwn(d,'value'))throw new TypeError('invalid snapshot array entry');
        if(i)charge(1);result.push(copy(d.value,depth+1));
      }
    }else{
      if(![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw new TypeError('snapshot requires plain JSON objects');
      if(keys.length>MAX_NODES)throw capacityError('snapshot structure');
      result={};let first=true;
      for(const key of keys){
        const d=Object.getOwnPropertyDescriptor(raw,key);
        if(typeof key!=='string'||!d.enumerable||!Object.hasOwn(d,'value'))throw new TypeError('invalid snapshot data field');
        if(!first)charge(1);first=false;charge(stringCost(key)+1);
        Object.defineProperty(result,key,{value:copy(d.value,depth+1),enumerable:true,writable:true,configurable:true});
      }
    }
    ancestors.delete(raw);return result;
  }
  return copy(value,0);
}
