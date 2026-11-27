const assert=require('node:assert/strict')
const {getAdventureMap}=require('../../mcp-server/dist/lib/adventure-map.js')
const {getWeapon}=require('../../mcp-server/dist/lib/srd/weapons.js')
const {getMonsterRecord}=require('../../mcp-server/dist/lib/srd/monsters.js')
const {buildPlayerState}=require('../../mcp-server/dist/lib/character-registry.js')
const {initialHeroState}=require('../../mcp-server/dist/lib/hero-state.js')
const gs=require('../../mcp-server/dist/mcp-server/game-state.js')
const {toolkitState}=require('../../mcp-server/dist/mcp-server/toolkit.js')
const {registerCombatTools}=require('../../mcp-server/dist/mcp-server/tools/combat-tools.js')
const {registerHeroTools}=require('../../mcp-server/dist/mcp-server/tools/hero-tools.js')
const {registerInventoryTools}=require('../../mcp-server/dist/mcp-server/tools/inventory-tools.js')
const {registerAmmunitionTools}=require('../../mcp-server/dist/mcp-server/tools/ammunition-tools.js')
const {registerPhaseTools}=require('../../mcp-server/dist/mcp-server/tools/phase-tools.js')
const {registerBreathingTools}=require('../../mcp-server/dist/mcp-server/tools/breathing-tools.js')
const {registerItemTools}=require('../../mcp-server/dist/mcp-server/tools/item-tools.js')
const {registerCarryingTools}=require('../../mcp-server/dist/mcp-server/tools/carrying-tools.js')
const {registerNavigationTools}=require('../../mcp-server/dist/mcp-server/tools/navigation-tools.js')
const {registerObjectTools}=require('../../mcp-server/dist/mcp-server/tools/object-tools.js')
const {registerCastingTools}=require('../../mcp-server/dist/mcp-server/tools/casting-tools.js')
const {registerMagicItemTools}=require('../../mcp-server/dist/mcp-server/tools/magic-item-tools.js')
const {registerNetTools}=require('../../mcp-server/dist/mcp-server/tools/net-tools.js')
const {registerTwoWeaponTools}=require('../../mcp-server/dist/mcp-server/tools/two-weapon-tools.js')
const {registerImprovisedTools}=require('../../mcp-server/dist/mcp-server/tools/improvised-tools.js')
const {registerSilveringTools}=require('../../mcp-server/dist/mcp-server/tools/silvering-tools.js')
const {registerPhysicalHandlingTools}=require('../../mcp-server/dist/mcp-server/tools/physical-handling-tools.js')
const {registerWeaponConsumableTools}=require('../../mcp-server/dist/mcp-server/tools/weapon-consumable-tools.js')
const {registerSceneFactTools}=require('../../mcp-server/dist/mcp-server/scene-facts.js')
const {registerBasicPoisonTools}=require('../../mcp-server/dist/mcp-server/tools/basic-poison-tools.js')
const {registerOilTools}=require('../../mcp-server/dist/mcp-server/tools/oil-tools.js')
const {registerLightingTools}=require('../../mcp-server/dist/mcp-server/tools/lighting-tools.js')
const {registerGroundGearTools}=require('../../mcp-server/dist/mcp-server/tools/ground-gear-tools.js')
const {reconcileNaturalRecoveryClock}=require('../../mcp-server/dist/mcp-server/hero-rules.js')
let unique=0
const ok=value=>{assert.ok(!value.error,JSON.stringify(value));return value}
async function fixture(t,{weapon='shortbow',quantity=3,ammunitionType='arrow',dice='17,4,19',legacy=false,shield=false,realBattle=false,startBattle=true,additionalAmmo=[],additionalWeapons=[]}={}){
 const map=getAdventureMap(),saved=structuredClone(map),oldDice=process.env.AI_DM_TEST_DICE_SEQUENCE
 t.after(()=>{for(const key of Object.keys(map))delete map[key];Object.assign(map,saved);gs.resetState();if(oldDice===undefined)delete process.env.AI_DM_TEST_DICE_SEQUENCE;else process.env.AI_DM_TEST_DICE_SEQUENCE=oldDice})
 const mapId='ammunition-fixture',grid={cols:12,rows:5},geometry={version:1,mapId,grid,source:{kind:'procedural',version:1},review:'approved',blockedCells:[],edges:[],decorations:[],uncertainties:[],contradictions:[]}
 Object.assign(map,{maps:[{id:mapId,name:'Firing room',grid,geometry}],rooms:[{id:'firing-room',mapId,name:'Firing room',zone:{minX:0,maxX:6,minY:0,maxY:4}},{id:'other-room',mapId,name:'Other room',zone:{minX:7,maxX:11,minY:0,maxY:4}}],startCell:{x:1,y:2},entryCells:{'firing-room':{x:1,y:2}},npcs:[],encounters:{},doors:[],partitions:[],roomHooks:{}})
 gs.resetState();const state=gs.getState()
 state.player=buildPlayerState({characterId:'fighter',level:7,position:{x:1,y:2}})
 state.player.inventory=[{id:weapon,equipmentId:weapon,name:getWeapon(weapon).label,type:'weapon'}]
 for(const id of additionalWeapons)state.player.inventory.push({id,equipmentId:id,name:getWeapon(id).label,type:'weapon'})
 if(shield)state.player.inventory.push({id:'actual-shield',equipmentId:'shield',name:'Bouclier',type:'armor',acBonus:2})
 state.hero=initialHeroState('fighter',7)
 Object.assign(state,{currentMapId:mapId,currentRoomId:'firing-room',roomsVisited:['firing-room'],phase:'exploration',currentTurn:null,npcs:{},monsters:{},initiativeOrder:[],actionUsed:{},bonusActionUsed:{},movementUsed:{}})
 toolkitState().loadout={mainHandId:weapon,...shield?{shieldId:'actual-shield'}:{},unarmoredAC:14}
 process.env.AI_DM_TEST_DICE_SEQUENCE=dice+' '.repeat(++unique)
 const callbacks={},server={tool(name,_desc,schema,callback){callbacks[name]=input=>callback(require('zod').z.object(schema).parse(input))},registerTool(name,config,callback){callbacks[name]=input=>callback(require('zod').z.object(config.inputSchema).parse(input))}}
 registerCombatTools(server);registerHeroTools(server);registerInventoryTools(server);registerAmmunitionTools(server);registerPhaseTools(server)
 registerItemTools(server)
 registerCarryingTools(server)
 registerNavigationTools(server)
 registerObjectTools(server)
 registerCastingTools(server)
 registerMagicItemTools(server)
 registerNetTools(server)
 registerTwoWeaponTools(server)
 registerImprovisedTools(server);registerSilveringTools(server)
 registerPhysicalHandlingTools(server)
 registerWeaponConsumableTools(server)
 registerSceneFactTools(server)
 registerBasicPoisonTools(server)
 registerOilTools(server);registerLightingTools(server)
 registerGroundGearTools(server)
 registerBreathingTools(server,{collapse:gs.dropForSuffocation,stabilizeAfterAir:gs.stabilizeAfterBreathingAir,airRestored:()=>reconcileNaturalRecoveryClock()})
 const call=async(name,input={})=>JSON.parse((await callbacks[name](input)).content[0].text)
 const preparation={itemId:'actual-ammo',ammunitionType,quantity:quantity??3,name:'Munitions du scénario',description:'Projectiles ordinaires effectivement présents.',cell:{...state.player.position}}
 if(quantity!==null){ok(await call('create_ammunition',preparation));ok(await call('pick_up_item',{itemId:'actual-ammo'}))}
 for(const stack of additionalAmmo){ok(await call('create_ammunition',{...preparation,...stack}));ok(await call('pick_up_item',{itemId:stack.itemId}))}
 const target={...structuredClone(getMonsterRecord('goblin').engine),id:'target',position:{x:5,y:2},hp:{current:200,max:200},isAlive:true}
 Object.assign(state,{phase:'combat',round:1,currentTurn:'player',initiativeOrder:['player','target'],combatGeneration:1});state.monsters.target=target
 if(realBattle){Object.assign(state,{phase:'exploration',currentTurn:null,initiativeOrder:[],combatGeneration:0});ok(await call('enter_combat',{combatants:['player','target']}));assert.equal(state.combatGeneration,1)}
 if(!startBattle)Object.assign(state,{phase:'exploration',currentTurn:null,initiativeOrder:[],combatGeneration:0})
 if(legacy){delete state.player.ruleset;delete state.hero}
 const attack=extra=>call(legacy?'resolve_attack':'resolve_player_attack',{...(legacy?{attackerId:'player'}:{}),targetId:'target',weaponOrSpell:weapon,...quantity!==null?{ammunitionItemId:'actual-ammo'}:{},...extra})
 return{state,target,call,attack,preparation,stock:()=>gs.getPlayer().inventory.find(item=>item.id==='actual-ammo')?.quantity}
}
async function refused(f,name,input,code){const before=structuredClone(gs.getState()),answer=await f.call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(gs.getState(),before);return answer}
const shot=f=>({targetId:'target',weaponOrSpell:f.state.player.inventory[0].id,ammunitionItemId:'actual-ammo'})

module.exports={fixture,ok,refused,shot}
