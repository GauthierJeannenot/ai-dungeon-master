const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem(),{engine,ok}=require('./helpers/mcp-toolkit.cjs')
const{prepareDiagonalRazorvine,equipDiagonalHandaxe,enterDiagonalCombat,buyDiagonalBow}=require('./helpers/razorvine-diagonal-fixture.cjs')
const{refused,restoreRazorvine,marker}=require('./helpers/razorvine-fixture.cjs')
test.after(()=>pg.restore())
function exactEntry(result,f){
 const ray=result.razorvineRay,d=ray.diagonal;assert.deepEqual(ray.rayCells,f.rayCells);assert.deepEqual(ray.face,f.face)
 assert.equal(d.kind,'exact45degree');assert.equal(d.entryNumerator,3);assert.equal(d.denominator,4)
 assert.deepEqual(d.entryPointHalfCells,{x:5,y:19});assert.deepEqual(d.hedgeBoundsHalfCells,{minX:3,maxX:7,minY:19,maxY:21})
 assert.equal(d.entryBoundaryAxis,'y');assert.deepEqual(d.enteredCell,f.face);assert.deepEqual(d.enteredInterval,{fromNumerator:3,toNumerator:4})
 assert.deepEqual(d.tangentCells,[{cell:f.anchor,atNumerator:3}]);assert.deepEqual(d.clearanceCells,f.clearanceCells)
}

test('the concrete whole-hedge edge enters only the non-anchor cell after its cell-corner, spends one real attack and lands one actual handaxe through SQL',async t=>{
 const call=await engine(t,{dice:'20,1,14,6,17'}),f=await prepareDiagonalRazorvine(call)
 await equipDiagonalHandaxe(call);await enterDiagonalCombat(call)
 const before=await call('get_game_state'),hit=ok(await call('interact_object',f.handaxe));assert.equal(hit.hit,true);exactEntry(hit,f)
 assert.ok(hit.damageDealt>0);assert.equal(hit.damageType,'slashing');assert.equal(hit.object.hp.current,25-hit.damageDealt)
 assert.deepEqual(hit.thrownItem.position,f.face);assert.notDeepEqual(hit.thrownItem.position,f.anchor)
 const state=await call('get_game_state');assert.equal(state.hero.attackAction.used,1);assert.equal(state.hero.attackAction.remaining,1);assert.equal(state.hero.actionCredits,0)
 assert.deepEqual(state.player.position,before.player.position);assert.deepEqual(state.movementUsed,before.movementUsed);assert.deepEqual(state.diagonalMovementUsed,before.diagonalMovementUsed)
 assert.equal(state.player.inventory.some(item=>item.id==='handaxe'),false);assert.deepEqual(state.droppedItems.handaxe.position,f.face)
 assert.deepEqual(state.dmTools.razorvine?.contacts??{},{});assert.equal(hit.rangedContext.distanceCells,2)
 const fresh=await restoreRazorvine(t,state,'17');assert.equal(ok(await fresh('interact_object',f.handaxe)).replayed,true)
 assert.deepEqual(await fresh('get_game_state'),state);assert.equal(await marker(fresh),17)
})

test('a purchased bow uses the same explicit diagonal face and existing object-range metric, spends exactly one arrow and keeps printed piercing immunity',async t=>{
 const call=await engine(t,{dice:'14,6,17'}),f=await prepareDiagonalRazorvine(call),b=await buyDiagonalBow(call,f)
 const before=await call('get_game_state'),hit=ok(await call('interact_object',b.shot));assert.equal(hit.hit,true);exactEntry(hit,f)
 assert.equal(hit.rangedContext.distanceCells,2);assert.equal(hit.damageDealt,0);assert.equal(hit.object.hp.current,25);assert.equal(hit.damageResolution.components[0].immune,true)
 assert.deepEqual(hit.ammunition.targetCell,f.face)
 const state=await call('get_game_state');assert.equal(state.player.inventory.find(item=>item.id===b.ammoId).quantity,3)
 assert.deepEqual(state.player.position,before.player.position);assert.deepEqual(state.movementUsed,before.movementUsed);assert.deepEqual(state.diagonalMovementUsed,before.diagonalMovementUsed)
 const fresh=await restoreRazorvine(t,state,'17');assert.equal(ok(await fresh('interact_object',b.shot)).replayed,true)
 assert.deepEqual(await fresh('get_game_state'),state);assert.equal(await marker(fresh),17)
})

test('whole-hedge corner, unmeasured actual corner/ray and a real blocking corner obstacle refuse before weapon/action/die without retargeting',async t=>{
 for(const kind of ['outerCorner','missingCorner','missingRay','obstacle']){
  const call=await engine(t,{dice:'17'}),f=await prepareDiagonalRazorvine(call,{[kind]:true});await equipDiagonalHandaxe(call)
  if(kind==='obstacle')ok(await call('create_scene_object',{objectId:'actual-diagonal-corner-block',name:'Bloc présent',description:'Ce vrai bloc de pierre occupe le passage de coin mesuré avant le tir.',cell:f.clearanceCells[0],kind:'obstacle',material:'stone',size:'small',resilience:'resilient'}))
  await refused(call,'interact_object',f.handaxe,kind==='outerCorner'?'RAZORVINE_DIAGONAL_CORNER_UNREPRESENTED':kind==='obstacle'?'RAZORVINE_RANGED_PATH_BLOCKED':'RAZORVINE_RANGED_PLANE_REQUIRED')
  assert.equal((await call('get_game_state')).dmTools.objectWeaponAttacks,undefined);assert.equal(await marker(call),17)
 }
})

test('directional cover stays on the chosen non-anchor diagonal face through SQL; total rejects before cost and partial cover feeds only its existing AC bonus',async t=>{
 for(const degree of ['total','half','three_quarters']){
  const call=await engine(t,{dice:degree==='total'?'17':'14,6,17'}),f=await prepareDiagonalRazorvine(call),b=await buyDiagonalBow(call,f)
  ok(await call('configure_cover',{coverId:'actual-diagonal-face-cover',operation:'set',originId:'player',targetId:f.hedgeId,targetCell:f.face,obstacleCell:f.face,degree,
   reason:'Le MJ qualifie ce vrai obstacle devant cette seule face et son degré effectivement observé ; aucun obstacle ou pourcentage n’est déduit de la plante.'}))
  assert.equal(ok(await call('inspect_cover',{originId:'player',targetId:f.hedgeId,targetCell:f.face})).degree,degree)
  assert.equal(ok(await call('inspect_cover',{originId:'player',targetId:f.hedgeId,targetCell:f.anchor})).degree,'none')
  const state=await call('get_game_state'),fresh=await restoreRazorvine(t,state,degree==='total'?'17':'14,6,17')
  if(degree==='total')await refused(fresh,'interact_object',b.shot,'COVER_TOTAL')
  else{const hit=ok(await fresh('interact_object',b.shot));assert.equal(hit.cover.degree,degree);assert.equal(hit.targetAC,degree==='half'?13:16);assert.deepEqual(hit.ammunition.targetCell,f.face);assert.equal(hit.damageDealt,0);exactEntry(hit,f)}
  assert.equal(await marker(fresh),17)
 }
})
