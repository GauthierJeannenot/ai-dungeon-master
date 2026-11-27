import { heldPitMeasurementsAllowed } from './pit-migration-scope'
import { DeclareVerticalBarrierSchema,RemoveVerticalBarrierSchema,type VerticalBarrier } from '../lib/vertical-barrier-state'
import { resolvePhysicalBarrierReference,readPhysicalBarrier,barrierReferenceKey } from '../lib/vertical-barriers'
import { jumpingStateOf } from '../lib/jumping-state'
import { verticalData } from './vertical-observations'
import { toolkitError } from './toolkit'
import * as gs from './game-state'

function existing(eventId:string,command:string){const receipt=jumpingStateOf(gs.getState())?.receipts[eventId]
 if(receipt&&receipt.command!==command)toolkitError('VERTICAL_EVENT_CONFLICT','This actual retained geometry event has different arguments.')
 return receipt?{...structuredClone(receipt.result),replayed:true}:undefined
}
function preflight(){const state=gs.getState(),data=jumpingStateOf(state)
 if(state.hero?.pending&&!heldPitMeasurementsAllowed(state))toolkitError('REACTION_PENDING','Resolve the held original reaction before changing its physical geometry.')
 if(data?.activeJumpId)toolkitError('JUMP_CONTINUATION_REQUIRED','Retain the real barrier observations during an actual held leap; resolve its continuation before editing its collision model.')
 if(Object.keys(data?.receipts??{}).length>=2048)toolkitError('VERTICAL_HISTORY_LIMIT','Real physical receipts are retained, never evicted to obtain another result.')
}
export function declareVerticalBarrier(raw:unknown){
 const input=DeclareVerticalBarrierSchema.parse(raw),command=JSON.stringify({kind:'vertical-barrier',input}),old=existing(input.eventId,command);if(old)return old
 preflight();const state=gs.getState(),data=jumpingStateOf(state)
 if(input.mapId!==state.currentMapId)toolkitError('VERTICAL_BARRIER_ACTIVE_MAP_REQUIRED','Measure an actual existing physical reference on the active map; no remote wall or obstacle is generated.')
 if(input.reference.kind==='object'&&state.dmTools?.objects[input.reference.objectId]?.razorvine)
  toolkitError('RAZORVINE_FIXED_SOURCE_GEOMETRY','This actual hedge already has its fixed measured source volume; another barrier cannot replace or duplicate it.')
 const actual=resolvePhysicalBarrierReference(state,input.mapId,input.reference)
 if(!actual.exists)toolkitError('VERTICAL_BARRIER_REFERENCE_REQUIRED',`The measured barrier requires its real existing edge, blocked cell, support, obstacle object or cover: ${actual.reason}.`)
 if(input.reference.kind==='surface'){
  const surface=data!.surfaces[input.reference.surfaceId]
  if(Math.abs(surface.elevationFeet-input.bottomZFeet)>1e-8&&Math.abs(surface.elevationFeet-input.topZFeet)>1e-8)
   toolkitError('VERTICAL_BARRIER_SURFACE_BOUND_REQUIRED','The measured solid slab must retain its actual supporting plane as its top or bottom; no second floor elevation is created.')
 }
 const key=barrierReferenceKey(input.reference),previous=data?.barriers[input.barrierId]
 if(previous&&(previous.mapId!==input.mapId||barrierReferenceKey(previous.reference)!==key))toolkitError('VERTICAL_BARRIER_ID_CONFLICT','This barrier ID already identifies another actual physical referent.')
 for(const receipt of Object.values(data?.receipts??{})){
  const measured=receipt.result.barrier as VerticalBarrier|undefined
  if(measured&&measured.mapId===input.mapId&&barrierReferenceKey(measured.reference)===key&&measured.provenance.referenceWitness===actual.witness
   &&(measured.bottomZFeet!==input.bottomZFeet||measured.topZFeet!==input.topZFeet||measured.blocksSight!==undefined&&input.blocksSight!==undefined&&measured.blocksSight!==input.blocksSight))
   toolkitError('VERTICAL_BARRIER_PHYSICAL_CHANGE_REQUIRED','This unchanged real barrier already has a measured vertical extent. Another nonce cannot alter its height; resolve its actual changed physical source first.')
 }
 if(!previous&&Object.keys(data?.barriers??{}).length>=512)toolkitError('VERTICAL_BARRIER_LIMIT','The retained measured-barrier registry is full.')
 const barrier:VerticalBarrier={id:input.barrierId,mapId:input.mapId,reference:input.reference,bottomZFeet:input.bottomZFeet,topZFeet:input.topZFeet,
  provenance:{eventId:input.eventId,at:state.worldTimeSeconds??0,source:input.source,referenceWitness:actual.witness},revision:(previous?.revision??0)+1}
 if(input.blocksSight!==undefined)barrier.blocksSight=input.blocksSight
 const result={confidential:true,success:true,eventId:input.eventId,barrier,active:actual.active,geometryCreated:false,bodyMoved:false}
 const ledger=verticalData();ledger.barriers[input.barrierId]=barrier;ledger.receipts[input.eventId]={command,result:structuredClone(result)}
 return result
}
export function removeVerticalBarrier(raw:unknown){
 const input=RemoveVerticalBarrierSchema.parse(raw),command=JSON.stringify({kind:'vertical-barrier-remove',input}),old=existing(input.eventId,command);if(old)return old
 preflight();const data=verticalData(),removed=Boolean(data.barriers[input.barrierId]);delete data.barriers[input.barrierId]
 const result={confidential:true,success:true,eventId:input.eventId,barrierId:input.barrierId,removed,geometryCreated:false,bodyMoved:false,
  mechanicalSummary:'Mesure retirée ; le mur/objet réel reste en place. Sa hauteur redevient inconnue pour une interaction qui en dépend.'}
 data.receipts[input.eventId]={command,result:structuredClone(result)};return result
}
export function inspectVerticalBarriers(barrierId?:string){
 const data=jumpingStateOf(gs.getState()),ids=barrierId?[barrierId]:Object.values(data?.barriers??{}).filter(b=>b.mapId===gs.getState().currentMapId).map(b=>b.id)
 return{confidential:true,barriers:ids.map(id=>readPhysicalBarrier(gs.getState(),id)),geometryCreated:false,bodyMoved:false,
  instructions:'Une référence physique réelle seulement. L’absence de mesure ne transforme pas un mur en passage ; les corps, surfaces et vols gardent leur unique état vertical.'}
}
