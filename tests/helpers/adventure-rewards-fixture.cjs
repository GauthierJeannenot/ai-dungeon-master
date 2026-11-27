const assert=require('node:assert/strict')
const {engine,ok,adjacent}=require('./mcp-toolkit.cjs')
const move=async(call,roomId)=>ok(await call('move_token',{tokenId:'player',roomId}))
async function toTemple(call){
 ok(await call('reveal_npc',{npcId:'sarah',disposition:'helpful'}))
 ok(await call('pick_up_item',{itemId:'sarah_diary_copy'}))
 await move(call,'3');ok(await call('travel_to_map',{transitionId:'sail_to_waterdeep'}))
 await move(call,'7');ok(await call('reveal_npc',{npcId:'cobbler',disposition:'neutral'}))
 ok(await call('reveal_clue',{clueId:'greenfast_lead',npcId:'cobbler'}))
 await move(call,'9');ok(await call('travel_to_map',{transitionId:'road_to_greenfast'}))
 await move(call,'16');ok(await call('travel_to_map',{transitionId:'walk_to_tower'}))
}
async function fact(call,description,cell){return ok(await call('record_scene_fact',{description,cell})).worldFact}
async function prepareAtCurrentSite(call,rewardId){
 const s=await call('get_game_state'),f=await fact(call,'Le MJ a établi une vraie fouille et un accès physique complet au contenu imprimé de cette source, à cet emplacement réel.',s.player.position)
 return{rewardId,cell:s.player.position,searchFactId:f.id,actualSearchAndContentsAccessConfirmed:true}
}
async function magic(call,templateId,id){
 const s=await call('get_game_state')
 ok(await call('create_magic_item',{itemId:id,templateId,name:'Objet physique à identifier',description:'Objet actuel trouvé, sans propriétés apprises par cette préparation.',cell:s.player.position}))
 ok(await call('pick_up_item',{itemId:id}))
}
async function scroll(call,spellId,id){
 const s=await call('get_game_state')
 ok(await call('create_spell_scroll',{itemId:id,spellId,name:'Parchemin matériel',description:'Un vrai parchemin, pas une connaissance ou un sort préparé.',cell:s.player.position}))
 ok(await call('pick_up_item',{itemId:id}))
}
async function hold(call,id){
 const s=await call('get_game_state'),held=s.dmTools.loadout?.mainHandId??s.player.inventory.find(i=>i.type==='weapon')?.id
 if(held)ok(await call('equip_item',{itemId:held,slot:'main_hand',operation:'unequip'}))
 ok(await call('equip_item',{itemId:id,slot:'main_hand',operation:'equip'}))
}
async function persist(t,call,dice='19'){
 const{saveSession,loadSession,deleteSession}=require('../../lib/session-store.ts')
 const before=await call('get_game_state'),id='adventure-rewards-'+process.pid+'-'+Math.random()
 t.after(()=>deleteSession(id));await saveSession(id,{gameState:before,history:[],adventureId:before.adventureId,characterId:before.characterId})
 const next=await engine(t,{characterId:before.characterId,adventureId:before.adventureId,dice})
 ok(await next('replace_game_state',{gameState:(await loadSession(id)).gameState}))
 assert.deepEqual(await next('get_game_state'),before)
 return next
}
module.exports={engine,ok,adjacent,move,toTemple,fact,prepareAtCurrentSite,magic,scroll,hold,persist}
