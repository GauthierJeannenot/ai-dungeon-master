import type { GameState } from '../lib/types'
import { underwaterFireDefenseIssue } from '../lib/underwater-rules'
import { oilFireCapacityIssue } from '../lib/oil-state'
export function fireDamageContextIssue(state:GameState,kind:'creature'|'object',id:string){
 return underwaterFireDefenseIssue(state,kind==='creature'?{kind,entityId:id}:{kind,objectId:id})??oilFireCapacityIssue(state,kind,id)
}
