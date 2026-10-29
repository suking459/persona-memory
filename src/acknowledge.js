export function acknowledge(pm,context,turnId) {
  try{return pm.confirmContext(context,{turnId});}
  catch(error){
    if(/unknown or expired context|context confirmation expired/.test(error.message))return {confirmed:false,tagCount:0,memoryCount:0,reason:'context-unavailable'};
    throw error;
  }
}
