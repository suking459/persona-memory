// Development-only deadlines. Production execution leases never read these variables.
export function testTimeout(milliseconds){
  const scale=process.env.PM_TEST_TIMEOUT_SCALE===undefined?1:Number(process.env.PM_TEST_TIMEOUT_SCALE);
  if(!Number.isSafeInteger(scale)||scale<1||scale>20)throw new RangeError('PM_TEST_TIMEOUT_SCALE must be an integer from 1 to 20');
  return milliseconds*scale;
}
export function testConcurrency(){
  const raw=process.env.PM_TEST_CONCURRENCY;
  if(raw===undefined)return [];
  const value=Number(raw);
  if(!Number.isSafeInteger(value)||value<1||value>64)throw new RangeError('PM_TEST_CONCURRENCY must be an integer from 1 to 64');
  return ['--test-concurrency='+value];
}
