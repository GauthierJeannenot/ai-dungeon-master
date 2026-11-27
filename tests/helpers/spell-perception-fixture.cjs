const assert=require('node:assert/strict')
const{engine,ok,spawn}=require('./mcp-toolkit.cjs')
async function setup(t,{dice='19',observerType='goblin'}={}){
 const call=await engine(t,{characterId:'wizard',dice}),initial=await call('get_game_state')
 ok(await call('prepare_spells',{spellIds:['mage-armor','counterspell','magic-missile','shield','greater-invisibility']}))
 const observer=await spawn(call,observerType)
 const choice=(channels=['sight'],extra={})=>({observerId:observer.id,channels,...extra})
 const materialCast=(observers=[choice()],extra={})=>({spellId:'mage-armor',targetId:'player',focusItemId:'component_pouch',spellObservers:observers,...extra})
 const sourceFact=async()=>ok(await call('record_scene_fact',{description:'The actual casting voice from this exact current source cell reaches this exact chosen observer through the actual present acoustic scene. This is an explicit physical audibility qualification, no universal hearing radius, spell identity or hidden voice recognition.',cell:initial.player.position})).worldFact
 const inspect=eventId=>call('inspect_spellcasting_perception',{eventId,observerId:observer.id})
 return{call,initial,observer,choice,materialCast,sourceFact,inspect}
}
async function refused(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before);return answer}
function noIdentity(view){for(const key of ['spell','spellId','spellName','level','slotLevel','targetId','targetIds','original','componentProof','sourceFrame','phase','status','castingStatus','position','casterCell','targetCell','mapId','roomId','effectiveComponents','sourceComponents','materialItemId','focusItemId','componentItems'])assert.equal(Object.hasOwn(view,key),false,key);assert.equal(view.spellIdentified,false);assert.equal(view.targetRevealed,false);if(!view.sourceAttributed)assert.equal(Object.hasOwn(view,'casterId'),false);if(!view.castingPerceived)assert.equal(Object.hasOwn(view,'observedAt'),false)}
module.exports={setup,refused,noIdentity}
