import { assertGreaterBrewingIdAvailable } from '../toolkit'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ToolkitCellSchema, ToolkitDescriptionSchema, ToolkitIdSchema } from '../../lib/dm-tool-state'
import { copperValue } from '../../lib/srd/currency'
import { HOARD_BANDS, prepareHoardSource, drawHoard } from '../hoards'
import { toolkitState, toolkitTransaction, toolkitError, toolkitResult, toolkitLocation, assertToolkitReach } from '../toolkit'
import { balance, addCoins } from '../currency'
import { afterInventoryChange } from '../equipment'
import { assertCarryingAcquisition } from '../carrying'
import { valuablePhysicalItem } from '../../lib/carrying-state'
import * as gs from '../game-state'
import * as rules from '../rules'

function outsideCombat(){
  if(gs.getState().hero?.pending)toolkitError('REACTION_PENDING','Resolve the pending reaction before another mutation.')
  if(gs.getState().phase==='combat')toolkitError('HOARD_OUTSIDE_COMBAT','Prepare or collect a whole treasure hoard outside combat; handling many separate valuables is not compressed into one combat interaction.')
}
function hoardSnapshot(id:string){
  const state=gs.getState(),{creation:_creation,...record}=state.dmTools!.hoards![id]
  return {...record,valuables:record.valuableIds.map(id=>state.dmTools!.valuables![id])}
}
export function registerHoardTools(server:McpServer){
  server.registerTool('create_treasure_hoard',{
    description:'Confidential MJ preparation outside combat: roll ONE actual DMG 2014 Treasure Hoard table (explicit challengeBand), its fixed coin dice/multipliers, d100 branch, gem/art quantity and source identity for each physical valuable. Exact cell/name/description/unique hoardId required. No discovery, wallet credit or item grant. Identical retries never reroll or refill, including after collection. Optional actual prepared container at same cell gates collection. Magic-table requests return source table IDs and rolled counts ONLY, never unimplemented active items; reading/rolling a reference never creates them. At most 64 hoards and 1024 valuable records. HoardId maximum 60 characters leaves room for stable valuable IDs.',
    inputSchema:{hoardId:ToolkitIdSchema.max(60),name:z.string().trim().min(1).max(80),description:ToolkitDescriptionSchema,
      cell:ToolkitCellSchema,challengeBand:z.enum(HOARD_BANDS),containerId:ToolkitIdSchema.optional()},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async input=>toolkitTransaction(()=>{
    outsideCombat()
    const data=toolkitState(),location=toolkitLocation(input.cell),creation=JSON.stringify(input),existing=data.hoards?.[input.hoardId]
    if(existing){
      if(existing.creation!==creation||existing.mapId!==location.mapId)toolkitError('HOARD_ID_CONFLICT','This hoard ID already has another immutable definition or map.')
      return toolkitResult({success:true,alreadyCreated:true,hoard:hoardSnapshot(input.hoardId)})
    }
    if(Object.keys(data.hoards??{}).length>=64)toolkitError('HOARD_LIMIT_REACHED','At most 64 hoards per session.')
    if(Object.keys(data.valuables??{}).length+18>1024)toolkitError('VALUABLE_LIMIT_REACHED','Reserve room for the source maximum of 18 valuables; existing records are never evicted.')
    if(input.containerId){
      const container=data.objects[input.containerId]
      if(!container||container.kind!=='container'||container.mapId!==location.mapId||container.roomId!==location.roomId||container.cell.x!==input.cell.x||container.cell.y!==input.cell.y)
        toolkitError('TREASURE_CONTAINER_INVALID','Choose an existing container at this exact hoard cell/map.')
    }
    for(let i=1;i<=18;i++){
      const id=`${input.hoardId}:valuable:${i}`
      assertGreaterBrewingIdAvailable(id)
      if(data.valuables?.[id]||gs.getPlayer().inventory.some(item=>item.id===id)||gs.getState().droppedItems?.[id]||gs.getEntity(id)||gs.getNpc(id))
        toolkitError('VALUABLE_ID_CONFLICT','A reserved physical valuable ID is already used; choose another hoardId.')
    }
    // Read and validate every branch and all referenced identity tables first.
    // No rejected input or unsupported source can consume a preparation die.
    const prepared=prepareHoardSource(input.challengeBand),drawn=drawHoard(prepared,input.hoardId)
    data.hoards??={};data.valuables??={}
    for(const value of drawn.valuables)data.valuables[value.id]=value
    const {valuables,...outcome}=drawn
    data.hoards[input.hoardId]={id:input.hoardId,name:input.name,description:input.description,...location,cell:{...input.cell},
      ...(input.containerId?{containerId:input.containerId}:{}),challengeBand:input.challengeBand,...outcome,
      valuableIds:valuables.map(value=>value.id),collected:false,creation}
    return toolkitResult({success:true,hoard:hoardSnapshot(input.hoardId),
      notice:'Preparation only: no discovery/acquisition. Magic draws are unresolved documentary requests; use consult_rules/roll_table, then explicitly prepare supported physical items. No unsupported power is invented.'})
  }))
  server.registerTool('collect_treasure_hoard',{
    description:'Outside combat, collect one exact prepared hoard ONCE at unobstructed touch range in its actual room/map. A linked container must already be open/destroyed. Transfers its real coins to the shared wallet and exact source gems/art to inventory, preserving reference value; no sale, spell component identity or magic effect is inferred. Active standard carrying requires real masses for these prepared valuable IDs before collection (declare_physical_weight); unknown weights are not zero. No search/open/trap trigger/discovery or handling duration is automatic. Identical retries never grant again. Magic-table requests remain unresolved MJ references without physical items.',
    inputSchema:{hoardId:ToolkitIdSchema.max(60)},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async({hoardId})=>toolkitTransaction(()=>{
    outsideCombat()
    const state=gs.getState(),data=toolkitState(),hoard=data.hoards?.[hoardId]
    if(!hoard)toolkitError('HOARD_NOT_FOUND','Select an exact prepared hoard ID.')
    if(hoard!.collected)return toolkitResult({success:true,alreadyCollected:true,wallet:balance(),valuableIds:hoard!.valuableIds})
    rules.validateActionUse('player');assertToolkitReach(hoard!)
    if(hoard!.containerId){
      const container=data.objects[hoard!.containerId]
      if(!container||!['open','destroyed'].includes(container.state))toolkitError('TREASURE_CONTAINER_CLOSED','Open/destroy the actual linked container using its dedicated tool first.')
    }
    const wallet=addCoins(balance(),hoard!.coins)
    const valuables=hoard!.valuableIds.map(id=>{
      const record=data.valuables?.[id]
      if(!record||record.hoardId!==hoardId||state.player.inventory.some(item=>item.id===id)||state.droppedItems?.[id])
        toolkitError('VALUABLE_STATE_CONFLICT','The hoard valuable reservation is missing or already materialized; no partial collection.')
      return record!
    })
    const items=valuables.map(valuablePhysicalItem)
    assertCarryingAcquisition({additionalItems:items,walletAfter:wallet})
    data.wallet=wallet;hoard!.collected=true
    state.player.inventory.push(...items)
    afterInventoryChange()
    const valuableValueGp=valuables.reduce((sum,value)=>sum+value.valueGp,0),mechanicalSummary=`Trésor de repaire collecté une fois : pièces ${JSON.stringify(hoard!.coins)}, ${valuables.length} pierre(s)/objet(s) d’art (valeur de référence ${valuableValueGp} po, conservés comme objets).`
    gs.addLogEntry({round:state.round,turn:'player',action:'collect_treasure_hoard',mechanicalDetail:mechanicalSummary})
    return toolkitResult({success:true,collectedCoins:hoard!.coins,wallet,walletValueCp:copperValue(wallet),valuableIds:hoard!.valuableIds,valuableValueGp,
      magicDraws:hoard!.magicDraws,mechanicalSummary,notice:'Valuables are physical items, not currency. Magic requests are still unresolved references, not player acquisition or knowledge.'})
  }))
  server.registerTool('inspect_valuables',{
    description:'Read source identities and DMG reference values of actual OWNED gem/art instances. Exact itemId reads one; otherwise page through the owned records (20 maximum). Ownership is checked against current physical inventory; dropped/uncollected hoard entries are not owned. No appraisal roll, sale, monetary credit, material-component substitution, magic identification or invented price is performed.',
    inputSchema:{itemId:ToolkitIdSchema.optional(),offset:z.number().int().min(0).max(1024).default(0)},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async({itemId,offset})=>toolkitTransaction(()=>{
    const state=gs.getState(),owned=Object.values(state.dmTools?.valuables??{}).filter(value=>state.player.inventory.some(item=>item.id===value.id))
    if(itemId){const value=owned.find(value=>value.id===itemId);if(!value)toolkitError('VALUABLE_NOT_OWNED','Choose an actual owned registered gem/art item ID.');return toolkitResult({valuable:value})}
    return toolkitResult({valuables:owned.slice(offset,offset+20),total:owned.length,offset,nextOffset:offset+20<owned.length?offset+20:null,
      totalReferenceValueGp:owned.reduce((sum,value)=>sum+value.valueGp,0),notice:'Source reference value only; no money or sale has been created.'})
  }))
}
