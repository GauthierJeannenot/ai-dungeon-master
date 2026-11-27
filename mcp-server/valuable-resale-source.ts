import { getAdventureMap } from '../lib/adventure-map'
import type { GameState } from '../lib/types'
import type { ValuableRecord } from '../lib/hoard-state'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import { readDmgTreasureSource,readRollableTable } from './rules-library'

/** One exact already-registered table, selected by structured kind/value only.
 * No book scan, new valuable, appraisal, roll or classification from prose. */
export function valuableResaleSourceMatches(record:ValuableRecord,state?:GameState):boolean{
 if(record.rewardId){
  if(!state||!record.rewardId)return false
  const definition=getAdventureMap(state).rewards?.find(r=>r.id===record.rewardId),item=definition?.items.find(i=>i.id===record.id)
  return Boolean(definition&&item&&['valuable','collection'].includes(item.kind)&&record.kind===(item.kind==='collection'?'collection':'art')&&item.name===record.name&&item.valueGp===record.valueGp&&witness(record.source)===witness(definition.source)&&state.dmTools?.adventureRewards?.receipts[record.rewardId]?.outputIds.includes(record.id))
 }
 try{
  const value=record.valueGp.toLocaleString('en-US'),title=`${value} gp ${record.kind==='gem'?'Gemstones':'Art Objects'}`
  const source=readDmgTreasureSource(title)
  if(witness(source.source)!==witness(record.source))return false
  const table=readRollableTable(source.tableId)
  return table.rows.some(row=>row.cells[1]?.replaceAll('*','')===record.name)
 }catch{return false}
}
export function validateValuableResaleSources(state:GameState){
 const issues:string[]=[]
 for(const offer of Object.values(state.dmTools?.merchantResales?.offers??{}))if(offer.valuation==='registered_valuable_full')
  for(const provenance of offer.valuableProvenance??[])if(!valuableResaleSourceMatches(provenance.record,state))issues.push('A registered gem/art full-value resale must retain its exact original canonical DMG identity table/hash/value, never a reclassified name or new price.')
 return issues
}
