import { z } from 'zod'
import type { GameState } from './types'
import { groundGearPhysicalWitness } from './ground-gear-recovery-state'
export const pitWitness=groundGearPhysicalWitness

const Id=z.string().min(1).max(180).refine(id=>!['__proto__','constructor','prototype'].includes(id))
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
const Value=z.record(z.string(),z.unknown())
export const PitGeometryInputSchema=z.object({eventId:Id,trapId:Id,coverSurfaceId:Id,bottomSurfaceId:Id,
  escapeSurfaceId:Id,climbMediumId:Id,factId:Id,actualPitGeometryConfirmed:z.literal(true),source:z.string().trim().min(1).max(1000)}).strict()
export const PitGeometrySchema=z.object({input:PitGeometryInputSchema,command:z.string(),at:z.number().nonnegative(),
  source:z.object({book:z.literal('xge'),sha256:z.string(),startLine:z.literal(1496),endLine:z.literal(1506)}).strict(),
  cover:Value,bottom:Value,escape:Value,medium:Value,open:z.boolean(),
  migration:z.object({input:Value,command:z.string(),pendingId:Id,at:z.number().nonnegative(),trapCreation:z.string(),originalPending:Value,originalPendingWitness:z.string(),adoptedPendingWitness:z.string(),bodyWitness:z.string()}).strict().optional(),
  attempt:z.object({targetId:Id,successCell:Cell,definition:z.string(),targetPosition:Cell,
    startingSupport:Value,status:z.enum(['save_pending','resolved']),heldWitness:z.string().optional(),save:Value.optional(),outcome:z.enum(['bottom','edge']).optional()}).strict().optional(),
}).strict()
export type PitGeometry=z.infer<typeof PitGeometrySchema>
export type PitGeometryInput=z.infer<typeof PitGeometryInputSchema>
export const PIT_SOURCE={book:'xge' as const,sha256:'519584ec7fc7da6fea056c182a22254bc807db5d077c2fc205801bd872d761bf',startLine:1496 as const,endLine:1506 as const}
export function pendingPitSave(state:GameState){
  const command=state.hero?.pending?.command as Record<string,unknown>|undefined
  const resolution=command?.toolkitResolution as {domain?:unknown;command?:Record<string,unknown>}|undefined
  return resolution?.domain==='trap-save'&&Object.hasOwn(resolution.command??{},'pitDefinition')?resolution.command:undefined
}
export function validatePitTraps(state:GameState){
  const issues:string[]=[],pending=pendingPitSave(state)
  const traps=state.dmTools?.traps??{}
  for(const trap of Object.values(traps)){
    if(!Object.hasOwn(trap,'pitGeometry'))continue
    const geometry=trap.pitGeometry
    if(trap.template!=='pit'||!PitGeometrySchema.safeParse(geometry).success){issues.push('Only a sourced pit retains valid physical qualification.');continue}
    const g=geometry!,j=state.dmTools?.jumping
    if(g.input.trapId!==trap.id||g.command!==pitWitness(g.input)||pitWitness(g.source)!==pitWitness(PIT_SOURCE))issues.push('Retain the exact original sourced pit qualification.')
    if(!g.open){
      for(const[key,id]of [['cover',g.input.coverSurfaceId],['bottom',g.input.bottomSurfaceId],['escape',g.input.escapeSurfaceId]] as const)
        if(pitWitness(j?.surfaces[id])!==pitWitness(g[key]))issues.push('The pit retains its real measured support geometry.')
      if(pitWitness(j?.locomotion?.media[g.input.climbMediumId])!==pitWitness(g.medium))issues.push('The pit retains its exact measured climbing face.')
    }
    const definition=pitWitness({input:g.input,source:g.source,cover:g.cover,bottom:g.bottom,escape:g.escape,medium:g.medium})
    const qualification=j?.receipts[`\u0000pit-geometry:${trap.id}`]
    if(qualification?.command!==g.command||qualification.result.pitGeometry!==true||qualification.result.trapId!==trap.id||qualification.result.definition!==definition)issues.push('The physical qualification keeps its independent original receipt.')
    const migration=g.migration,marker=qualification?.result.pitMigrationWitness
    if(migration){
      const original=migration.originalPending as {id?:unknown;kind?:unknown;sourceId?:unknown;targetId?:unknown;continuation?:unknown;command?:{type?:unknown;result?:{entityId?:unknown;ability?:unknown;dc?:unknown};toolkitResolution?:{domain?:unknown;command?:Record<string,unknown>}}}
      const saved=original.command?.result,source=original.command?.toolkitResolution
      const adopted=structuredClone(migration.originalPending) as {command:{toolkitResolution:{command:Record<string,unknown>}}}
      const actualCommand=source?.command&&typeof source.command==='object'&&!Array.isArray(source.command)
      if(actualCommand)adopted.command.toolkitResolution.command.pitDefinition=g.attempt?.definition
      if(!g.attempt||!saved||!actualCommand||migration.command!==pitWitness(migration.input)||migration.pendingId!==original.id||original.kind!=='save'||original.command?.type!=='save'||original.continuation!==undefined
        ||source?.domain!=='trap-save'||source.command?.trapId!==trap.id||source.command?.targetId!==g.attempt?.targetId||Object.hasOwn(source.command??{},'pitDefinition')
        ||saved?.entityId!==g.attempt?.targetId||saved.ability!=='dex'||saved.dc!==10||original.sourceId!==g.attempt?.targetId||original.targetId!==g.attempt?.targetId
        ||migration.at!==g.at||migration.at>(state.worldTimeSeconds??0)||migration.trapCreation!==trap.creation||migration.originalPendingWitness!==pitWitness(original)
        ||migration.adoptedPendingWitness!==pitWitness(adopted)||migration.adoptedPendingWitness!==g.attempt?.heldWitness||marker!==pitWitness(migration))
        issues.push('The explicit old pit migration retains the exact original held save and reciprocal current-geometry adoption, never a reroll or a reconstructed past.')
    }else if(marker!==undefined)issues.push('A pit migration receipt cannot lose its original legacy window owner.')
    if(g.open!==Boolean(g.attempt?.status==='resolved')||g.attempt&&trap.status!=='triggered')issues.push('Only the resolved original pit consequence opens its canvas.')
    const a=g.attempt
    if(a&&a.definition!==pitWitness({geometry:definition,targetId:a.targetId,successCell:a.successCell,startingSupport:a.startingSupport}))issues.push('The original pit decision retains its exact selected body and safe destination.')
    if(a?.status==='save_pending'&&(!pending||pending.trapId!==trap.id||pending.targetId!==a.targetId||pending.pitDefinition!==a.definition))issues.push('An unresolved pit save retains its exact held source owner.')
    if(a?.status==='save_pending'&&(!a.heldWitness||a.heldWitness!==pitWitness(state.hero?.pending)))issues.push('The original pit save retains its complete exact held window.')
    if(a?.status==='save_pending'){
      const body=a.targetId==='player'?state.player:state.monsters[a.targetId]
      if(!body||body.position.x!==a.targetPosition.x||body.position.y!==a.targetPosition.y||pitWitness(j?.supports[a.targetId])!==pitWitness(a.startingSupport))issues.push('The held pit body cannot leave its original physical source before the save.')
    }
    if(a?.status==='resolved'){
      const save=a.save as {entityId?:unknown;ability?:unknown;dc?:unknown;success?:unknown;roll?:{notation?:unknown;total?:unknown}}|undefined
      const receipt=j?.receipts[`\u0000pit-result:${trap.id}`]
      if(!save||save.entityId!==a.targetId||save.ability!=='dex'||save.dc!==10||typeof save.success!=='boolean'
        ||typeof save.roll?.total!=='number'||save.success!==(save.roll.notation!=='automatic-failure'&&save.roll.total>=10)
        ||a.outcome!==(save.success?'edge':'bottom')||receipt?.command!==a.definition||receipt.result.pitResult!==true
        ||receipt.result.trapId!==trap.id||pitWitness(receipt.result.save)!==pitWitness(save)||receipt.result.outcome!==a.outcome)
        issues.push('The actual pit result retains its original save and independent landing receipt.')
    }
  }
  if(pending){const g=traps[String(pending.trapId)]?.pitGeometry
    if(!g||g.attempt?.status!=='save_pending'||g.attempt.definition!==pending.pitDefinition||g.attempt.targetId!==pending.targetId)issues.push('A retained pit save cannot lose its original geometry/attempt.')}
  for(const[key,receipt]of Object.entries(state.dmTools?.jumping?.receipts??{})){
    if(key.startsWith('\u0000pit-geometry:')){const id=key.slice('\u0000pit-geometry:'.length);if(!traps[id]?.pitGeometry||receipt.result.trapId!==id)issues.push('A pit qualification receipt cannot lose its original trap geometry.')}
    if(key.startsWith('\u0000pit-result:')){const id=key.slice('\u0000pit-result:'.length);if(traps[id]?.pitGeometry?.attempt?.status!=='resolved'||receipt.result.trapId!==id)issues.push('A pit landing receipt cannot lose its original resolved physical event.')}
  }
  return issues
}
