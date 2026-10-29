// Resource ceilings constrain accidental workloads; valuable profiles are never silently evicted.
export const HARD_LIMITS=Object.freeze({
  maxCandidates:10000,maxCandidateBytes:16777216,maxVersionsPerMemory:1000,maxMemories:100000,maxProfiles:100000,maxVisitors:100000,maxStyleFragments:2048,maxTagsPerPerson:256,
  maxPeople:64,maxChars:100000,dedupeLimit:20000,historyLimit:10000,maxSnapshotBytes:67108864,
});
export function validateResourceLimits(config){
  for(const [name,max] of Object.entries(HARD_LIMITS)){
    const value=config[name];
    if(!Number.isSafeInteger(value) || value<0 || value>max)throw new RangeError(name+' exceeds supported bounds');
  }
  for(const [name,max] of Object.entries({candidateTtlHours:720,stateMemoryTtlHours:876000,episodeMemoryTtlDays:36500}))if(!Number.isFinite(config[name]) || config[name]<0 || config[name]>max)throw new RangeError('invalid memory lifetime');
  if(config.maxVersionsPerMemory<1)throw new RangeError('maxVersionsPerMemory must be at least 1');
  if(config.maxSnapshotBytes<1024)throw new RangeError('maxSnapshotBytes must be at least 1024');
  if(config.blockWords.length>512 || config.blockWords.some(w=>typeof w!=='string'||w.length>128))throw new RangeError('invalid or excessive blockWords');
  if(Object.keys(config.dimensions).length>16)throw new RangeError('too many relationship dimensions');
}
export function capacityError(kind){
  const error=new RangeError(kind+' capacity reached; clean up or choose an explicit higher limit');
  error.code='ERR_MEMORY_CAPACITY';return error;
}
