import type { GameState } from '../lib/types'
import { weatherAtActor,weatherObscurationAt,weatherPerceptionDisadvantage,type PerceptionSense } from '../lib/weather-state'
import { RuleViolation } from './rules'
import * as gs from './game-state'

export type PerceptionSelection={skill?:string;perceptionSense?:PerceptionSense;sightBased?:boolean}
export function perceptionCheckContext(input:PerceptionSelection,entityId:string,state:GameState=gs.getState()){
 if(input.perceptionSense!==undefined&&input.skill!=='perception')throw new RuleViolation('PERCEPTION_SENSE_NOT_APPLICABLE','perceptionSense belongs only to an explicit canonical Perception check; no skill or sensory intent is inferred from a label.',{})
 const context=state.dmTools?.weather?weatherAtActor(state,entityId):undefined,relevant=Boolean(context&&(context.strongWind||context.precipitation!=='none'||context.sandstorm||context.fog!=='none'&&!context.fogDispersed))
 if(input.skill==='perception'&&!input.perceptionSense&&relevant)throw new RuleViolation('PERCEPTION_SENSE_REQUIRED','Choose sight, hearing or other explicitly for this actual Perception check before any die or resource; the established weather can affect those senses differently.',{})
 if(input.perceptionSense&&input.sightBased!==undefined&&input.sightBased!==(input.perceptionSense==='sight'))throw new RuleViolation('PERCEPTION_SENSE_CONFLICT','sightBased and perceptionSense contradict one another; no sensory choice is rewritten.',{})
 // The old explicit sightBased field remains compatible without relevant
 // weather. It never fills a missing new choice in an affected weather area.
 const sense=input.perceptionSense??(input.skill==='perception'&&input.sightBased?'sight':undefined)
 const sightBased=input.sightBased??sense==='sight'
 const actor=entityId==='player'?state.player:state.monsters?.[entityId]
 const automaticFailure=Boolean(sense==='hearing'&&actor?.conditions.includes('deafened')
  ||sightBased&&(actor?.conditions.includes('blinded')||actor&&weatherObscurationAt(state,actor.position).heavy))
 return{perceptionSense:sense,sightBased,
  weatherDisadvantage:Boolean(sense&&weatherPerceptionDisadvantage(state,entityId,sense)),automaticFailure}
}
