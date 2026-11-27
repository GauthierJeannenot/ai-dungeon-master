const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,battle,object}=require('./helpers/mcp-toolkit.cjs')
const {resolveObjectDamage}=require('../mcp-server/dist/mcp-server/object-damage.js')
const reason='Le MJ déclare explicitement la résistance de cet objet de scène.'
const profile=overrides=>({reason,immunities:[],resistances:[],vulnerabilities:[],damageThreshold:0,magicalResilience:false,...overrides})
const damage=(type,amount,savedProfile)=>resolveObjectDamage([{type,amount}],savedProfile)

test('all actual objects are immune to poison and psychic, including vulnerable magical objects',()=>{
 for(const type of ['poison','psychic']){
  const result=damage(type,100,profile({vulnerabilities:[type],magicalResilience:true}))
  assert.equal(result.damageDealt,0);assert.equal(result.components[0].immune,true)
 }
})
test('ordinary magical resistance does not stack and PHB resistance precedes vulnerability with rounding',()=>{
 assert.equal(damage('slashing',5,profile({magicalResilience:true,resistances:['slashing']})).damageDealt,2)
 assert.equal(damage('slashing',5,profile({resistances:['slashing'],vulnerabilities:['slashing']})).damageDealt,4)
 assert.equal(damage('fire',5,profile({vulnerabilities:['fire']})).damageDealt,10)
})
test('the declared threshold interpretation compares post-resistance/vulnerability damage, including equality, and never subtracts the threshold',()=>{
 const resisted=damage('slashing',12,profile({resistances:['slashing'],damageThreshold:10}))
 assert.equal(resisted.rawDamage,12);assert.equal(resisted.applicableDamage,6);assert.equal(resisted.damageDealt,0)
 const vulnerable=damage('fire',10,profile({vulnerabilities:['fire'],damageThreshold:15}))
 assert.equal(vulnerable.damageDealt,20)
 const equal=damage('slashing',16,profile({resistances:['slashing'],damageThreshold:8}))
 assert.equal(equal.damageDealt,8);assert.equal(equal.thresholdMet,true)
 assert.equal(equal.thresholdPolicyBasis,'engine_interpretation')
})
test('one source effect combines each type before resistance and immunity never contributes toward its threshold',()=>{
 const combined=resolveObjectDamage([{type:'fire',amount:3},{type:'fire',amount:3}],profile({resistances:['fire'],damageThreshold:3}))
 assert.equal(combined.damageDealt,3)
 const immune=resolveObjectDamage([{type:'poison',amount:100},{type:'fire',amount:5}],profile({damageThreshold:6}))
 assert.equal(immune.applicableDamage,5);assert.equal(immune.damageDealt,0)
})
test('the typed kernel refuses negative or invented damage types instead of creating damage',()=>{
 assert.throws(()=>damage('fire',-1),/nonnegative/)
 assert.throws(()=>damage('imaginary',10))
})

test('the complete DMG material table uses source AC and preserves published average HP without inventing giant objects',async t=>{
 const call=await engine(t,{dice:'19'})
 const table={cloth:11,paper:11,rope:11,crystal:13,glass:13,ice:13,wood:15,bone:15,stone:17,iron:19,steel:19,mithral:21,adamantine:23}
 for(const [material,ac] of Object.entries(table)){
  const created=await object(call,`material-${material}`,{material})
  assert.equal(created.object.ac,ac);assert.deepEqual(created.object.hp,{current:10,max:10})
 }
 const before=await call('get_game_state')
 assert.ok((await call('create_scene_object',{objectId:'whole-fortress',name:'Forteresse',description:'Objet dépassant les sections autorisées.',cell:before.player.position,kind:'container',material:'stone',size:'huge',resilience:'resilient'})).error)
 assert.deepEqual(await call('get_game_state'),before)
 ok(await call('replace_game_state',{gameState:before}))
 assert.equal((await call('get_game_state')).dmTools.objects['material-adamantine'].ac,23)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real immune object attack consumes its actual attack and damage dice while preserving Extra Attack and source HP',async t=>{
 const call=await engine(t,{dice:'17,4,19'})
 await object(call,'ineffective-cut',{damageProfile:profile({immunities:['slashing']})})
 const enemy=await spawn(call);await battle(call,[enemy.id])
 const result=ok(await call('interact_object',{objectId:'ineffective-cut',action:'attack',weaponId:'longsword'}))
 assert.equal(result.hit,true);assert.ok(result.damageRoll.total>0);assert.equal(result.damageDealt,0)
 assert.equal(result.damageType,'slashing');assert.equal(result.damageResolution.components[0].immune,true)
 assert.equal(result.object.hp.current,10);assert.equal(result.object.state,'closed')
 const state=await call('get_game_state');assert.equal(state.hero.attackAction.remaining,1);assert.equal(state.hero.actionCredits,0)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('separate real hits below the threshold never accumulate structural damage or release contents',async t=>{
 const call=await engine(t,{dice:'17,4,17,4,19'})
 await object(call,'threshold-object',{contents:['healers_kit'],damageProfile:profile({damageThreshold:1000})})
 const enemy=await spawn(call);await battle(call,[enemy.id])
 for(let i=0;i<2;i++){
  const result=ok(await call('interact_object',{objectId:'threshold-object',action:'attack',weaponId:'longsword'}))
  assert.equal(result.hit,true);assert.equal(result.damageResolution.thresholdMet,false)
  assert.equal(result.damageDealt,0);assert.equal(result.object.hp.current,10);assert.deepEqual(result.releasedItems,[])
 }
 const state=await call('get_game_state');assert.equal(state.hero.attackAction.remaining,0);assert.equal(state.dmTools.objects['threshold-object'].contentsReleased,false)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('an explicit ordinary magical scene profile persists and reduces a real weapon hit once without creating an inventory magic item',async t=>{
 const call=await engine(t,{dice:'17,3,19'})
 const input={size:'large',damageProfile:profile({magicalResilience:true,resistances:['slashing']})}
 await object(call,'magical-fixture',input)
 assert.equal((await object(call,'magical-fixture',input)).alreadyCreated,true)
 let state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}))
 const enemy=await spawn(call);await battle(call,[enemy.id])
 const result=ok(await call('interact_object',{objectId:'magical-fixture',action:'attack',weaponId:'longsword'}))
 assert.equal(result.damageDealt,Math.floor(result.damageRoll.total/2))
 assert.equal(result.object.hp.current,27-result.damageDealt)
 state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}))
 assert.equal((await call('get_game_state')).dmTools.objects['magical-fixture'].damageProfile.magicalResilience,true)
 assert.equal(state.dmTools.magicItems?.['magical-fixture'],undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('invalid damage profiles refuse creation and hydration before state or random draws change',async t=>{
 const call=await engine(t,{dice:'19'})
 const before=await call('get_game_state')
 const base={objectId:'invalid-profile',name:'Objet',description:'Objet réel choisi par le MJ.',cell:before.player.position,kind:'container',material:'wood',size:'small',resilience:'resilient'}
 for(const damageProfile of [profile({damageThreshold:-1}),profile({immunities:['fire','fire']}),profile({reason:' '}),profile({immunities:['imaginary']})]){
  assert.ok((await call('create_scene_object',{...base,damageProfile})).error)
  assert.deepEqual(await call('get_game_state'),before)
 }
 await object(call,'persisted-profile',{damageProfile:profile({damageThreshold:5})})
 const valid=await call('get_game_state'),invalid=structuredClone(valid)
 invalid.dmTools.objects['persisted-profile'].damageProfile.damageThreshold=-1
 assert.ok((await call('replace_game_state',{gameState:invalid})).error)
 assert.deepEqual(await call('get_game_state'),valid)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
