const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,battle,grid,object}=require('./helpers/mcp-toolkit.cjs')
const {getMapSpec,getAdventureMap,inferRoomIdOnMap}=require('../mcp-server/dist/lib/adventure-map.js')
const {playerHandOccupancy}=require('../mcp-server/dist/lib/hand-occupancy.js')
const reason='Le MJ établit la prise et les données physiques de cette charge réelle.'
const source='Masse mesurée de la charge entière ; consentement/forme/mobilité explicitement établis, sans déduction du nom.'
async function refused(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before);return answer}
async function hydrate(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
async function fixture(t,{body=false,targetType='commoner',characterId='fighter',dice='19',observer=false,large=false,gearScope=true}={}){
 const call=await engine(t,{characterId,dice}),initial=await call('get_game_state'),nav=grid(initial),map=getMapSpec(initial.currentMapId,initial)
 let corner
 for(let y=0;y<=map.grid.rows-5&&!corner;y++)for(let x=0;x<=map.grid.cols-7&&!corner;x++){
  const patch=Array.from({length:35},(_,i)=>({x:x+i%7,y:y+Math.floor(i/7)}))
  if(patch.every(cell=>nav.free(cell)&&inferRoomIdOnMap(cell,initial.currentMapId,initial)===initial.currentRoomId))corner={x,y}
 }
 assert.ok(corner,'fixture uses an actual clear7x5 patch of the source room')
 const cell=(x,y)=>({x:corner.x+x,y:corner.y+y})
 const main=initial.dmTools?.loadout?.mainHandId??initial.player.inventory.find(item=>item.type==='weapon')?.id
 if(main)ok(await call('equip_item',{itemId:main,slot:'main_hand',operation:'unequip'}))
 const current=await call('get_game_state'),shield=current.dmTools?.loadout?.shieldId
 if(shield)ok(await call('equip_item',{itemId:shield,slot:'shield',operation:'unequip'}))
 const target=body?await spawn(call,targetType):undefined,witness=await spawn(call,observer?'goblin':'commoner')
 await replace(call,state=>{state.player.position=cell(2,2);state.monsters[witness.id].position=observer?cell(1,2):cell(6,0);if(target)state.monsters[target.id].position=cell(2,3)})
 const made=!body?await object(call,'actual-load',{cell:cell(2,3),kind:large?'obstacle':'container',size:large?'large':'small'}):undefined
 const targetId=target?.id??made.object.id,targetKind=body?'creature':'object'
 ok(await call('set_carrying_context',{eventId:'physical-size',entityId:'player',size:'Medium',reason,source}))
 const carrying=ok(await call('inspect_carrying_capacity',{entityId:'player'}))
 for(const missing of carrying.missing.filter(row=>row.itemId))ok(await call('declare_physical_weight',{eventId:`mass-${missing.itemId}`,targetKind:'item',targetId:missing.itemId,weightLb:0.5,unit:'lb_per_inventory_unit',reason,source}))
 ok(await call('declare_physical_weight',{eventId:'whole-load-mass',targetKind,targetId,weightLb:body?80:10,unit:'lb_total',...(body&&gearScope?{includesCarriedEquipment:true}:{}),reason,source}))
 const begin=extra=>({loadId:'actual-grip',actorId:'player',targetKind,targetId,operation:'carry',control:body?'willing':'inanimate',hands:1,reason,source,
  ...(body?{willing:true}:{mobilityConfirmed:true,interactionCost:'interaction',...(large?{}:{objectFootprint:{widthCells:1,heightCells:1,source:'Actual authored single-cell container footprint.'}})}),...extra})
 const move=(x=4,y=2,tx=4,ty=3)=>({loadId:'actual-grip',actorId:'player',targetId,toCell:cell(x,y),targetToCell:cell(tx,ty)})
 return {call,cell,targetId,targetKind,witness,begin,move}
}

test('a real object grip reserves hands, moves both actual positions atomically, carries attached uncollected contents, and releases without another action',async t=>{
 const f=await fixture(t),{call,cell,targetId}=f
 ok(await call('create_treasure',{treasureId:'inside-load',name:'Pièces dans la charge',description:'Contenu réel du coffre à déplacer.',cell:cell(2,3),containerId:targetId,mode:'authored',coins:{cp:50}}))
 // The source contents changed: declare their real current combined mass.
 ok(await call('declare_physical_weight',{eventId:'load-with-coins',targetKind:'object',targetId,weightLb:11,unit:'lb_total',reason,source}))
 await battle(call,[f.witness.id])
 const start=ok(await call('begin_handling_load',f.begin())),before=await hydrate(call)
 assert.equal(start.actionSpent,false);assert.equal(playerHandOccupancy(before).free,1)
 const plan=ok(await call('preview_handled_load',f.move()));assert.equal(plan.costCells,2);assert.deepEqual(await call('get_game_state'),before)
 await refused(call,'move_token',{tokenId:'player',toCell:cell(3,2)},'PHYSICAL_TRANSPORT_REQUIRED')
 ok(await call('move_handled_load',f.move()))
 const after=await hydrate(call);assert.deepEqual(after.player.position,cell(4,2));assert.deepEqual(after.dmTools.objects[targetId].cell,cell(4,3))
 assert.deepEqual(after.dmTools.treasures['inside-load'].cell,cell(4,3));assert.equal(after.dmTools.treasures['inside-load'].collected,false)
 assert.deepEqual(after.dmTools.wallet,before.dmTools.wallet);assert.equal(after.movementUsed.player,2);assert.equal(after.hero.actionCredits,1)
 const carrying=ok(await call('inspect_carrying_capacity',{entityId:'player'}));assert.equal(carrying.handledLoad.payloadWeightLb,11)
 ok(await call('release_handled_load',{loadId:'actual-grip'}));assert.equal(playerHandOccupancy(await call('get_game_state')).free,2)
 const released=await call('get_game_state');assert.equal(ok(await call('begin_handling_load',f.begin())).replayed,true);assert.deepEqual(await call('get_game_state'),released)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual zero-HP nonlethal injury can be grappled automatically with the remaining real attack, then transported with its source half speed and no target turn',async t=>{
 const f=await fixture(t,{body:true,dice:'17,1,19'}),{call,targetId}=f
 await replace(call,state=>{state.monsters[targetId].hp.current=1});await battle(call,[targetId,f.witness.id])
 ok(await call('resolve_attack',{attackerId:'player',targetId,weaponOrSpell:'unarmed',nonlethal:true}))
 let state=await call('get_game_state');assert.equal(state.monsters[targetId].hp.current,0);assert.equal(state.monsters[targetId].isAlive,true);assert.ok(state.monsters[targetId].knockout)
 const life=structuredClone(state.monsters[targetId].knockout),sourceTurn=state.currentTurn,sourceOrder=[...state.initiativeOrder]
 const begun=ok(await call('begin_handling_load',f.begin({control:'incapacitated_grapple',willing:undefined})))
 assert.equal(begun.attackSpent,true);state=await call('get_game_state');assert.equal(state.hero.attackAction.remaining,0);assert.equal(state.hero.attackAction.used,2)
 const plan=ok(await call('preview_handled_load',f.move()));assert.equal(plan.transport.speedDivisor,2);assert.equal(plan.transport.speed,15)
 ok(await call('move_handled_load',f.move()));state=await hydrate(call)
 assert.deepEqual(state.monsters[targetId].knockout,life);assert.equal(state.currentTurn,sourceTurn);assert.deepEqual(state.initiativeOrder,sourceOrder)
 assert.equal(state.movementUsed[targetId]??0,0);assert.equal(state.actionUsed[targetId],undefined);assert.equal(state.monsters[targetId].hp.current,0)
 assert.equal(playerHandOccupancy(state).free,1,'the same real grapple is counted once across equipment/spell hands')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an actual corpse moves as an explicitly adjudicated inanimate load and never triggers creature-entry damage or changes life/initiative',async t=>{
 const f=await fixture(t,{body:true,dice:'17,19'}),{call,targetId,cell}=f
 await replace(call,state=>{state.monsters[targetId].hp.current=1});await battle(call,[targetId,f.witness.id])
 ok(await call('resolve_attack',{attackerId:'player',targetId,weaponOrSpell:'unarmed'}))
 let state=await call('get_game_state');assert.equal(state.monsters[targetId].isAlive,false)
 await replace(call,state=>state.hero.effects.push({id:'corpse-guardian-witness',kind:'guardian-of-faith',sourceId:'player',targetIds:[],expiresAt:10000,concentration:false,
  data:{mapId:state.currentMapId,cell:cell(4,3),damageDealt:0,lastTriggers:{}}}))
 ok(await call('begin_handling_load',f.begin({control:'inanimate',willing:undefined,mobilityConfirmed:true,interactionCost:'interaction',hands:2})))
 const before=await call('get_game_state'),corpseTime=before.hero.corpseTimes[targetId]
 ok(await call('move_handled_load',f.move(4,1,4,2)));state=await hydrate(call)
 assert.deepEqual(state.monsters[targetId].position,cell(4,2));assert.equal(state.monsters[targetId].hp.current,0);assert.equal(state.monsters[targetId].isAlive,false)
 assert.equal(state.hero.corpseTimes[targetId],corpseTime);assert.equal(state.hero.effects.find(effect=>effect.id==='corpse-guardian-witness').data.damageDealt,0)
 assert.deepEqual(state.initiativeOrder,before.initiativeOrder);assert.equal(state.currentTurn,before.currentTurn);assert.equal(state.actionUsed[targetId],before.actionUsed[targetId])
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('pushing/dragging above carry capacity uses the actual five-foot speed before Dash and never a fictitious target action',async t=>{
 const f=await fixture(t),{call,targetId}=f,cap=ok(await call('inspect_carrying_capacity',{entityId:'player'}))
 ok(await call('declare_physical_weight',{eventId:'heavy-actual-load',targetKind:'object',targetId,weightLb:cap.carryingCapacityLb+1,unit:'lb_total',reason,source}))
 await battle(call,[f.witness.id]);ok(await call('begin_handling_load',f.begin({operation:'drag',hands:2})))
 await refused(call,'move_handled_load',f.move(),'MOVEMENT_EXCEEDED')
 const plan=ok(await call('preview_handled_load',f.move(3,2,3,3)));assert.equal(plan.transport.speed,5)
 ok(await call('move_handled_load',f.move(3,2,3,3)));ok(await call('combat_action',{actorId:'player',action:'dash'}))
 const dashed=ok(await call('preview_handled_load',f.move()));assert.equal(dashed.transport.speed,10);assert.equal(dashed.remaining,0)
 ok(await call('move_handled_load',f.move()));const state=await hydrate(call);assert.equal(state.movementUsed.player,2);assert.equal(state.hero.actionCredits,0)
 assert.equal(state.actionUsed[targetId],undefined);assert.equal(state.movementUsed[targetId],undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('the actual large obstacle footprint cannot be shrunk or moved through a blocked payload cell',async t=>{
 const f=await fixture(t,{large:true}),{call,cell,targetId}=f
 await object(call,'payload-wall',{kind:'obstacle',cell:cell(4,4),material:'stone',size:'small'})
 await refused(call,'begin_handling_load',f.begin({objectFootprint:{widthCells:1,heightCells:1,source:'Contradictory smaller shape'}}),'PHYSICAL_LOAD_FOOTPRINT_CONFLICT')
 ok(await call('begin_handling_load',f.begin()))
 await refused(call,'move_handled_load',f.move(),'PHYSICAL_LOAD_PATH_BLOCKED')
 const legal=f.move(4,1,4,2),plan=ok(await call('preview_handled_load',legal));assert.equal(plan.transport.footprint.widthCells,2);assert.equal(plan.transport.footprint.heightCells,2)
 ok(await call('move_handled_load',legal));assert.deepEqual((await call('get_game_state')).dmTools.objects[targetId].cell,cell(4,2))
 ok(await call('release_handled_load',{loadId:'actual-grip'}));assert.ok(!(await call('preview_navigation',{tokenId:'player',toCell:cell(2,3)})).error)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('physical hands are shared by equipment and spell components and release frees both without spending the casting action',async t=>{
 const f=await fixture(t,{characterId:'wizard',dice:'1,1,1,19'}),{call}=f
 await battle(call,[f.witness.id]);ok(await call('begin_handling_load',f.begin({hands:2})))
 const before=await call('get_game_state');assert.equal(playerHandOccupancy(before).free,0)
 await refused(call,'equip_item',{itemId:'dagger',slot:'main_hand',operation:'equip'},'FREE_HAND_REQUIRED')
 const spell=await call('cast_spell',{spellId:'magic-missile',slotLevel:1,targetId:f.witness.id})
 assert.ok(spell.error);assert.ok(JSON.stringify(spell).includes('SOMATIC'));assert.deepEqual(await call('get_game_state'),before)
 ok(await call('release_handled_load',{loadId:'actual-grip'}));assert.equal(playerHandOccupancy(await call('get_game_state')).free,2)
 ok(await call('cast_spell',{spellId:'magic-missile',slotLevel:1,targetId:f.witness.id}))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('opportunity reactions keep the exact held pair and resume after hydration with one real attack',async t=>{
 const f=await fixture(t,{observer:true,dice:'17,3,19'}),{call,cell,targetId}=f
 await battle(call,[f.witness.id]);ok(await call('begin_handling_load',f.begin()))
 const pending=ok(await call('move_handled_load',f.move()));assert.ok(pending.pendingReaction)
 let state=await hydrate(call);assert.deepEqual(state.player.position,cell(2,2));assert.deepEqual(state.dmTools.objects[targetId].cell,cell(2,3))
 const result=ok(await call('resolve_reaction',{pendingId:pending.pendingReaction.id,choice:'opportunity_attack',weaponOrSpell:'Scimitar'}));assert.ok(!result.pendingReaction)
 state=await hydrate(call);assert.deepEqual(state.player.position,cell(4,2));assert.deepEqual(state.dmTools.objects[targetId].cell,cell(4,3))
 assert.equal(state.hero.reactionsUsed[f.witness.id],true);assert.equal(state.movementUsed.player,2)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an actual incapacitating opportunity attack releases the grip without moving the load or resuming a dead carrier',async t=>{
 const f=await fixture(t,{observer:true,dice:'17,3,19'}),{call,cell,targetId}=f
 await replace(call,state=>{state.player.hp.current=1});await battle(call,[f.witness.id]);ok(await call('begin_handling_load',f.begin()))
 const pending=ok(await call('move_handled_load',f.move()));ok(await call('resolve_reaction',{pendingId:pending.pendingReaction.id,choice:'opportunity_attack',weaponOrSpell:'Scimitar'}))
 const state=await hydrate(call);assert.equal(state.player.hp.current,0);assert.deepEqual(state.player.position,cell(2,2));assert.deepEqual(state.dmTools.objects[targetId].cell,cell(2,3))
 assert.equal(state.dmTools.physicalHandling.activeId,undefined);assert.equal(state.dmTools.physicalHandling.loads['actual-grip'].status,'released')
 assert.equal(state.movementUsed.player??0,0)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('missing payload equipment scope, consent, source grapple, container shape or physical actor data refuse before any cost/die',async t=>{
 const f=await fixture(t,{body:true,gearScope:false}),{call}=f
 await refused(call,'begin_handling_load',f.begin(),'PHYSICAL_PAYLOAD_GEAR_REQUIRED')
 ok(await call('declare_physical_weight',{eventId:'whole-equipped-body',targetKind:'creature',targetId:f.targetId,weightLb:80,unit:'lb_total',includesCarriedEquipment:true,reason,source}))
 await refused(call,'begin_handling_load',f.begin({willing:undefined}),'PHYSICAL_CURRENT_CONSENT_REQUIRED')
 await refused(call,'begin_handling_load',f.begin({control:'grapple',willing:undefined}),'PHYSICAL_SOURCE_GRAPPLE_REQUIRED')
 await refused(call,'begin_handling_load',f.begin({actorId:f.witness.id}),'PHYSICAL_CARRIER_NOT_MODELED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a capable living target moves only from explicit willingness, with the real full action ruling and no invented grapple or target action',async t=>{
 const f=await fixture(t,{body:true}),{call,targetId,cell}=f
 await battle(call,[targetId,f.witness.id]);const started=ok(await call('begin_handling_load',f.begin({hands:2})))
 assert.equal(started.actionSpent,true);assert.match(started.adjudication,/MJ/)
 const before=await call('get_game_state');assert.equal(before.hero.actionCredits,0);assert.ok(!before.monsters[targetId].conditions.includes('grappled'))
 const plan=ok(await call('preview_handled_load',f.move()));assert.equal(plan.transport.speed,30);assert.equal(plan.transport.speedDivisor,1)
 ok(await call('move_handled_load',f.move()));const after=await hydrate(call)
 assert.deepEqual(after.monsters[targetId].position,cell(4,3));assert.equal(after.monsters[targetId].hp.current,before.monsters[targetId].hp.current)
 assert.equal(after.actionUsed[targetId],undefined);assert.equal(after.movementUsed[targetId],undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('the exact source grapple contest supplies physical control without a second action or a second set of hands',async t=>{
 const f=await fixture(t,{body:true,dice:'20,1,19'}),{call,targetId}=f
 await battle(call,[targetId,f.witness.id]);assert.equal(ok(await call('combat_action',{actorId:'player',action:'grapple',targetId,defenseSkill:'acrobatics'})).success,true)
 const before=await call('get_game_state'),effect=before.hero.effects.find(effect=>effect.kind==='grapple'&&effect.sourceId==='player'&&effect.targetIds.includes(targetId))
 await refused(call,'move_grappled_creature',{actorId:'player',targetId,toCell:f.cell(4,2),targetToCell:f.cell(4,3)},'PHYSICAL_TRANSPORT_REQUIRED')
 const begun=ok(await call('begin_handling_load',f.begin({control:'grapple',willing:undefined,grappleEffectId:effect.id})))
 assert.equal(begun.actionSpent,false);assert.equal(begun.attackSpent,false)
 const held=await call('get_game_state');assert.deepEqual(held.hero.attackAction,before.hero.attackAction);assert.equal(playerHandOccupancy(held).free,1)
 ok(await call('move_handled_load',f.move()));assert.ok((await call('get_game_state')).hero.effects.some(item=>item.id===effect.id))
 ok(await call('combat_action',{actorId:'player',action:'release_grapple',effectId:effect.id}));assert.ok(!(await call('get_game_state')).monsters[targetId].conditions.includes('grappled'))
 assert.equal((await hydrate(call)).dmTools.physicalHandling.activeId,undefined,'ending the actual source grapple also ended physical control')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('jump and both stages of Ready movement refuse a held load before cost; releasing it preserves the real stored reaction',async t=>{
 const f=await fixture(t),{call}=f
 await battle(call,[f.witness.id]);ok(await call('begin_handling_load',f.begin()))
 await refused(call,'jump',{eventId:'held-load-jump',kind:'long',toCell:f.cell(3,2)},'PHYSICAL_VERTICAL_TRANSPORT_UNSUPPORTED')
 const readied={kind:'move',trigger:'Quand le signal réel convenu devient perceptible.'}
 await refused(call,'combat_action',{actorId:'player',action:'ready',readied},'PHYSICAL_READIED_TRANSPORT_UNSUPPORTED')
 ok(await call('release_handled_load',{loadId:'actual-grip'}))
 ok(await call('next_turn',{actorId:'player',skipAction:true}));ok(await call('next_turn',{actorId:f.witness.id,skipAction:true}))
 ok(await call('combat_action',{actorId:'player',action:'ready',readied}))
 const ready=(await call('get_game_state')).hero.effects.find(effect=>effect.kind==='readied-action')
 ok(await call('begin_handling_load',f.begin({loadId:'later-grip'})))
 const release={readyId:ready.id,choice:'execute',triggerObserved:'Le signal convenu est effectivement observé.',toCell:f.cell(3,2)}
 await refused(call,'resolve_readied_action',release,'PHYSICAL_READIED_TRANSPORT_UNSUPPORTED')
 ok(await call('release_handled_load',{loadId:'later-grip'}));ok(await call('resolve_readied_action',release))
 const state=await hydrate(call);assert.deepEqual(state.player.position,f.cell(3,2));assert.equal(state.hero.reactionsUsed.player,true)
 assert.ok(!state.hero.effects.some(effect=>effect.id===ready.id))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real non-graspable source cannot acquire a fabricated corporeal grip from token position or a mass declaration',async t=>{
 const f=await fixture(t,{body:true,targetType:'ghost'})
 await refused(f.call,'begin_handling_load',f.begin(),'PHYSICAL_BODY_FORM_UNSUPPORTED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a physically carried load counts in later real coin acquisitions and a missing container shape never charges an interaction',async t=>{
 const f=await fixture(t),{call}=f
 await refused(call,'begin_handling_load',f.begin({objectFootprint:undefined}),'PHYSICAL_LOAD_FOOTPRINT_REQUIRED')
 ok(await call('begin_handling_load',f.begin()))
 const cap=ok(await call('inspect_carrying_capacity',{entityId:'player'})),coins=Math.round((cap.carryingCapacityLb-cap.carriedWeightLb+cap.handledLoad.payloadWeightLb/2)*50)
 ok(await call('create_treasure',{treasureId:'carried-limit-loot',name:'Pièces réelles',description:'Une pile physique indépendante du coffre porté.',mode:'authored',coins:{cp:coins},cell:(await call('get_game_state')).player.position}))
 await refused(call,'collect_treasure',{treasureId:'carried-limit-loot'},'CARRYING_CAPACITY_EXCEEDED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an actual authored map journey refuses a held load before any mutation, then leaves the released object on its real original map',async t=>{
 const call=await engine(t,{adventureId:'fey-shadow-fair',dice:'19'})
 const state0=await call('get_game_state'),events=getAdventureMap(state0).rooms.flatMap(room=>room.navigationEvent?[room.navigationEvent.id]:[])
 ok(await call('move_token',{tokenId:'player',toCell:{x:7,y:8},acknowledgeEventIds:events}))
 ok(await call('reveal_npc',{npcId:'madame_bougie',disposition:'helpful',reason:'Coopération explicitement établie pour cette quête.'}))
 ok(await call('move_token',{tokenId:'player',toCell:{x:3,y:3},acknowledgeEventIds:events}))
 const state=await call('get_game_state'),main=state.dmTools?.loadout?.mainHandId??state.player.inventory.find(item=>item.type==='weapon')?.id
 if(main)ok(await call('equip_item',{itemId:main,slot:'main_hand',operation:'unequip'}))
 const shield=(await call('get_game_state')).dmTools?.loadout?.shieldId
 if(shield)ok(await call('equip_item',{itemId:shield,slot:'shield',operation:'unequip'}))
 ok(await call('set_carrying_context',{eventId:'fair-size',entityId:'player',size:'Medium',reason,source}))
 for(const missing of ok(await call('inspect_carrying_capacity',{entityId:'player'})).missing.filter(row=>row.itemId))
  ok(await call('declare_physical_weight',{eventId:`fair-mass-${missing.itemId}`,targetKind:'item',targetId:missing.itemId,weightLb:0.5,unit:'lb_per_inventory_unit',reason,source}))
 const fresh=await call('get_game_state'),nav=grid(fresh),cell=nav.neighbors(fresh.player.position).find(cell=>nav.step(fresh.player.position,cell)&&inferRoomIdOnMap(cell,fresh.currentMapId,fresh)===fresh.currentRoomId)
 assert.ok(cell);await object(call,'fair-physical-load',{cell})
 ok(await call('declare_physical_weight',{eventId:'fair-object-mass',targetKind:'object',targetId:'fair-physical-load',weightLb:10,unit:'lb_total',reason,source}))
 ok(await call('begin_handling_load',{loadId:'fair-grip',actorId:'player',targetKind:'object',targetId:'fair-physical-load',operation:'carry',control:'inanimate',hands:1,mobilityConfirmed:true,interactionCost:'interaction',objectFootprint:{widthCells:1,heightCells:1,source:'Actual authored single-cell footprint'},reason,source}))
 await refused(call,'travel_to_map',{toMapId:'wood'},'PHYSICAL_LOAD_MAP_TRANSITION_REQUIRED')
 ok(await call('release_handled_load',{loadId:'fair-grip'}));ok(await call('travel_to_map',{toMapId:'wood'}))
 const after=await call('get_game_state');assert.equal(after.currentMapId,'wood');assert.equal(after.dmTools.objects['fair-physical-load'].mapId,'fair')
 assert.deepEqual(after.dmTools.objects['fair-physical-load'].cell,cell);assert.equal(after.dmTools.physicalHandling.activeId,undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
