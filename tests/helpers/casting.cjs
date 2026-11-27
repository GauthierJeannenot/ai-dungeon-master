const assert=require('node:assert/strict')
/** Test caller explicitly performs the returned work and resolution. Production
 * orchestration never synthesizes these game calls. */
async function completeCasting(call,started){
 assert.ok(!started.error,JSON.stringify(started))
 if(!started.castingId)return started
 const worked=await call('continue_casting',{castingId:started.castingId,eventId:'test-explicit-work',seconds:started.remainingWorkSeconds})
 assert.ok(!worked.error,JSON.stringify(worked));assert.equal(worked.status,'ready')
 const done=await call('finish_casting',{castingId:started.castingId})
 assert.ok(!done.error,JSON.stringify(done));return done
}
module.exports={completeCasting}
