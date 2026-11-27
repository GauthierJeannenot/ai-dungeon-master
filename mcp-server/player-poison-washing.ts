import { actualPoisonedNutrition } from './poison-nutrition'
import { playerPoisonStateOf } from '../lib/player-poison-state'
import { preflightPlayerPoisonWork,spendPlayerPoisonWork,playerPoisonReceipt,rememberPlayerPoison,observedPlayerPoisonFact,PLAYER_POISON_SOURCE } from './player-poison-core'
import { poisonSurfaceLocation } from './player-poison-exposure'
import { assertToolkitReach,toolkitError } from './toolkit'
import { afterInventoryChange } from './equipment'
import * as gs from './game-state'

export interface WashPlayerPoisonInput{eventId:string;preparationId:string;waterContainerItemId:string;quarterPints:number;physicalFactId:string;completeWashingConfirmed:true;adjudication:string}
export function washPlayerPoison(input:WashPlayerPoisonInput){
 const command=JSON.stringify(input),old=playerPoisonReceipt(input.eventId,command);if(old)return old
 const state=gs.getState(),preparation=playerPoisonStateOf(state)?.preparations[input.preparationId]
 if(!preparation||preparation.status!=='active'||preparation.delivery==='ingested')toolkitError('PLAYER_POISON_WASHABLE_SURFACE_REQUIRED','Select an actual still-potent contact/injury coating. Washing food or diluted ingested poison needs its own actual contamination adjudication; this procedure grants no purification.')
 const location=poisonSurfaceLocation(preparation!);assertToolkitReach(location!)
 const physicalFact=observedPlayerPoisonFact(input.physicalFactId,location!.cell,preparation!.currentSurface?.id??preparation!.targetId)
 const container=state.dmTools?.foraging?.containers[input.waterContainerItemId],item=state.player.inventory.find(value=>value.id===input.waterContainerItemId)
 if(!container||!item||container.contentsQuarterPints<input.quarterPints)toolkitError('PLAYER_POISON_WASHING_WATER_REQUIRED','Choose actual possessed counted container water sufficient for the explicitly adjudicated complete wash; no water or vessel is created.')
 if(actualPoisonedNutrition(input.waterContainerItemId))toolkitError('POISON_WASHING_RESOURCE_CONTAMINATED','This washing water contains an actual whole ingested poison dose. Its disposal/contact distribution requires a separate real procedure; do not silently erase or transfer that poison through washing.')
 const seconds=preflightPlayerPoisonWork();spendPlayerPoisonWork(seconds)
 container!.contentsQuarterPints-=input.quarterPints
 if(container!.containerType==='waterskin'){item!.equipmentId=container!.contentsQuarterPints?'waterskin_full':'waterskin_empty';item!.name=`Outre : ${container!.contentsQuarterPints/4} pintes d’eau`}
 preparation!.status='washed';preparation!.washEventId=input.eventId
 const result={success:true,eventId:input.eventId,preparationId:input.preparationId,washed:true,waterContainerItemId:input.waterContainerItemId,waterSpentQuarterPints:input.quarterPints,seconds,physicalFact,adjudication:input.adjudication,source:PLAYER_POISON_SOURCE,
  interpretation:'The MJ explicitly establishes enough real water and a complete actual wash. Water quantity and full-action/six-second timing are engine adjudications, not printed universal DMG amounts; immersion never silently washes a coating.'}
 rememberPlayerPoison(input.eventId,command,result);afterInventoryChange();return result
}
