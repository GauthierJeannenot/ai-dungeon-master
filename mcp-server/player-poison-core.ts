import type { PlayerPoisonState } from '../lib/player-poison-state'
import { playerPoisonStateOf } from '../lib/player-poison-state'
import { playerPoisonFromEquipment } from '../lib/srd/player-poisons'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { equipmentId,freeHands } from './equipment'
import { available,advanceHeroTime } from './hero-rules'
import { assertGameTimeAdvance } from './time-preflight'
import { toolkitState,toolkitError } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'

export const PLAYER_POISON_SOURCE='DMG2014 supplied Poisons/Sample Poisons/Purchasing/Crafting and Harvesting, lines8451–8631. No stock, ingredient, dealer, price agreement, skin contact or wound is granted.'
export function playerPoisons():PlayerPoisonState{
 const holder=toolkitState() as ReturnType<typeof toolkitState>&{playerPoisons?:PlayerPoisonState}
 return holder.playerPoisons??={version:1,preparations:{},surfaces:{},deliveries:{},clouds:{},receipts:{}}
}
export function playerPoisonReceipt(eventId:string,command:string){
 const records=playerPoisonStateOf(gs.getState())?.receipts,old=records&&Object.hasOwn(records,eventId)?records[eventId]:undefined
 if(old&&old.command!==command)toolkitError('PLAYER_POISON_EVENT_CONFLICT','Retain this exact real dose, physical surface, delivery and target for the original event.')
 return old?{...structuredClone(old.result),replayed:true}:undefined
}
export function rememberPlayerPoison(eventId:string,command:string,result:Record<string,unknown>){playerPoisons().receipts[eventId]={command,result:structuredClone(result)};return result}
export function playerPoisonDose(itemId:string){
 const state=gs.getState(),item=state.player.inventory.find(value=>value.id===itemId),templateId=item?playerPoisonFromEquipment(equipmentId(item)):undefined
 if(!item||!templateId||item.type!=='misc'||item.ammunitionType||item.quantity!==undefined&&item.quantity!==1)
  toolkitError('PLAYER_POISON_REAL_DOSE_REQUIRED','Choose one exact actually owned canonical DMG poison dose; a kit, scene contamination, Basic Poison, description or unseparated multi-dose stack is not a physical single dose.')
 const old=playerPoisonStateOf(state)
 if(Object.values(old?.preparations??{}).some(value=>value.doseItemId===itemId)||Object.values(old?.clouds??{}).some(value=>value.doseItemId===itemId))
  toolkitError('PLAYER_POISON_DOSE_ALREADY_SPENT','This exact actual dose identity was spent already; a restored item or new event cannot refill it.')
 return{item:item!,templateId:templateId!}
}
export function preflightPlayerPoisonWork(){
 available();rules.validateActionUse('player')
 if(gs.getState().phase==='combat'&&gs.getState().hero!.actionCredits<=0)toolkitError('ACTION_ALREADY_USED','This actual poison manipulation requires a complete action, not an unused Extra Attack.')
 if(freeHands()<1)toolkitError('PLAYER_POISON_FREE_HAND_REQUIRED','Free an actual hand for this actual dose manipulation; no shield, grapple or physical load hand is invented.')
 const seconds=gs.getState().phase==='combat'?0:6,issue=breathingActivityIssue(gs.getState(),'player',seconds)
 if(issue)toolkitError(issue.code,issue.message)
 assertGameTimeAdvance(seconds)
 if(Object.keys(playerPoisonStateOf(gs.getState())?.receipts??{}).length>=2048)toolkitError('PLAYER_POISON_EVENT_LIMIT','Retained actual dose/operation history is full before dice, time or resources.')
 return seconds
}
export function spendPlayerPoisonWork(seconds:number){if(seconds)advanceHeroTime(seconds);else rules.recordAction('player')}
export function observedPlayerPoisonFact(factId:string,cell:{x:number;y:number},subjectItemId?:string){
 const state=gs.getState(),fact=state.worldFacts?.find(value=>value.id===factId)
 if(!fact||fact.mapId!==state.currentMapId||fact.roomId!==state.currentRoomId||fact.narrativeEffect?.cell.x!==cell.x||fact.narrativeEffect.cell.y!==cell.y
  ||fact.subjectItemId&&fact.subjectItemId!==subjectItemId)
  toolkitError('PLAYER_POISON_PHYSICAL_FACT_REQUIRED','Select a real current public scene observation at this actual physical location; no text is parsed into ingestion, exposed skin, food, liquid or a wound.')
 return structuredClone(fact!) as unknown as Record<string,unknown>
}
