import { createHash } from 'node:crypto'
import { RegisterSpellbookSchema,SpellbookLossSchema,PersonalSpellCopySchema,spellbooksStateOf,ownedPersonalSpellbooks,
  type SpellbooksState,type CopyMaterials,type PersonalSpellCopyInput } from '../lib/spellbooks-state'
import { CoinsSchema,copperValue,emptyCoins,type Coins } from '../lib/srd/currency'
import { getSpell } from '../lib/srd/spells'
import { spellRules } from '../lib/srd/hero-spells'
import { getCharacterTemplate } from '../lib/character-registry'
import { playerHandOccupancy } from '../lib/hand-occupancy'
import { visualPerceptionAt,lightingRay } from '../lib/lighting'
import { breathingActivityIssue } from '../lib/activity-preflight'
import type { GameState,Item,AbilityCheckResult } from '../lib/types'
import * as gs from './game-state'
import * as rules from './rules'
import { available,feature,hero,now,advanceHeroTime } from './hero-rules'
import { toolkitError,toolkitState,toolkitResult } from './toolkit'
import { balance,addCoins,debitCoins } from './currency'
import { afterInventoryChange } from './equipment'
import { assertGameTimeAdvance } from './time-preflight'
import { preflightRestStrenuousInterval,recordRestMeasuredActivityInterval } from './resting'
import { ownedScroll,consumeScroll,validateScrollCast } from './spell-scrolls'
import { supportedScrollSpell } from '../lib/srd/spell-scrolls'
import { checkedResolution,registerCheckedResolution } from './toolkit-checks'
import { weatherDueIssue } from '../lib/weather-state'
import { travelDueIssue } from '../lib/travel-state'
import { isSurvivalDayDue } from './survival'

type Job=SpellbooksState['jobs'][string]
type Activity='light'|'strenuous'
const ledger=()=>spellbooksStateOf(gs.getState())
const data=():SpellbooksState=>toolkitState().spellbooks??={version:1,books:{},losses:{},jobs:{},materials:{},receipts:{}}
const owned=(id:string)=>gs.getPlayer().inventory.find(item=>item.id===id)
function oldReceipt(eventId:string,command:string){const old=ledger()?.receipts[eventId];if(old&&old.command!==command)toolkitError('SPELL_COPY_EVENT_CONFLICT','This retained event already records another exact physical copying operation.');return old?{...structuredClone(old.result),replayed:true}:undefined}
function room(){if(Object.keys(ledger()?.receipts??{}).length>=2048)toolkitError('SPELLBOOK_HISTORY_LIMIT','The retained copy history is full; no actual book, payment or work is discarded.')}
function remember(eventId:string,command:string,result:Record<string,unknown>){data().receipts[eventId]={command,result:structuredClone(result)};return result}
function wizard(){available();if(gs.getPlayer().characterId!=='wizard'||!feature('spellcasting'))toolkitError('SPELL_COPY_WIZARD_REQUIRED','Only the actual wizard may use their source spellbook procedure.');if(gs.getState().phase==='combat')toolkitError('SPELL_COPY_IN_COMBAT','Copy through real work outside combat; no rounds or actions are skipped.');rules.validateActionUse('player')}
function reader(scroll=false){wizard();const state=gs.getState();if(!visualPerceptionAt(state,state.player,state.player.position).canSee)toolkitError(scroll?'SPELL_SCROLL_UNREADABLE':'SPELLBOOK_UNREADABLE','The actual scribe must see the real source/destination; no writing through blindness, unconsciousness, darkness or opaque fog.');if(playerHandOccupancy(state).free<1)toolkitError('SPELLBOOK_WRITING_HAND_REQUIRED','Release an actual hand for writing; no held object is automatically unequipped.')}
function bookItem(id:string){const item=owned(id);if(!item||item.type!=='misc'||item.magical||item.quantity!==undefined&&item.quantity!==1)toolkitError('SPELLBOOK_ITEM_REQUIRED','Choose one exact actually owned ordinary physical book or established collection of notes, never a missing volume or stack.');return item!}
function ensureLegacyBook(id='spellbook'){
  const old=ledger()?.books[id];if(old)return old
  const item=owned(id)
  if(id!=='spellbook'||!item||gs.getPlayer().characterId!=='wizard'||!gs.getPlayer().spellbook)toolkitError('SPELLBOOK_REGISTRATION_REQUIRED','Establish the exact real book and its actual contents/notation before using it. A spell array never supplies a physical book.')
  if(Object.keys(ledger()?.books??{}).length>=128)toolkitError('SPELLBOOK_LIMIT','The retained physical-book registry is full.')
  const spells=[...(item.spellIds??gs.getPlayer().spellbook!)]
  data().books[id]={itemId:id,personalNotation:true,spellIds:spells,declaredAt:now(),source:'Legacy actual owned canonical wizard spellbook, preserving its existing source contents.',initialItem:structuredClone(item) as unknown as Record<string,unknown>,legacy:true}
  item.spellIds=[...spells]
  return data().books[id]
}
export function reconcileSpellbooks(){
  if(!ledger()||gs.getPlayer().characterId!=='wizard')return
  gs.getPlayer().spellbook=[...new Set(ownedPersonalSpellbooks(gs.getState()).flatMap(book=>book.spellIds))]
}
export function inspectSpellbooks(){return{tracked:!!ledger(),books:Object.values(ledger()?.books??{}).map(book=>({...structuredClone(book),owned:Boolean(owned(book.itemId))})),
  accessiblePersonalBooks:ownedPersonalSpellbooks(gs.getState()),losses:ledger()?.losses??{},jobs:ledger()?.jobs??{},materials:ledger()?.materials??{},diceRolled:false,bookCreated:false}}
export function registerSpellbook(raw:unknown){
  const input=RegisterSpellbookSchema.parse(raw),command=JSON.stringify({kind:'register-book',input}),old=oldReceipt(input.eventId,command);if(old)return old
  wizard();room();const item=bookItem(input.itemId)
  if(input.itemId!=='spellbook'&&owned('spellbook')&&!ledger()?.books.spellbook)ensureLegacyBook()
  if(ledger()?.books[input.itemId])toolkitError('SPELLBOOK_ALREADY_REGISTERED','This physical book already has its actual contents/notation. Another nonce cannot replace or reset them.')
  if(Object.keys(ledger()?.books??{}).length>=128)toolkitError('SPELLBOOK_LIMIT','The retained physical-book registry is full.')
  const contents=input.kind==='blank'?[]:item.spellIds??(item.id==='spellbook'?gs.getPlayer().spellbook:undefined)
  if(!contents||input.kind==='blank'&&(item.spellIds?.length??0)>0)toolkitError('SPELLBOOK_CONTENTS_REQUIRED','Use the actual existing content list, or an explicitly confirmed truly blank owned book. Unknown contents are not blank.')
  if(new Set(contents).size!==contents.length)toolkitError('SPELLBOOK_CONTENTS_INVALID','The real book content list contains duplicate spell identities.')
  if(input.kind==='personal'&&item.id!=='spellbook'){
    const known=new Set([...ownedPersonalSpellbooks(gs.getState()).flatMap(book=>book.spellIds),...(gs.getPlayer().knownSpells??[])])
    if(contents.some(id=>!known.has(id)))toolkitError('SPELLBOOK_PERSONAL_HISTORY_REQUIRED','Initial personal notation must agree with actually established wizard knowledge. Unknown foreign spells require their real ordinary copy; ownership or a nonce does not grant the cheap personal rate.')
  }
  data().books[item.id]={itemId:item.id,personalNotation:input.kind!=='foreign',spellIds:[...contents],declaredAt:now(),source:input.source,initialItem:structuredClone(item) as unknown as Record<string,unknown>,legacy:item.id==='spellbook'}
  item.spellIds=[...contents];reconcileSpellbooks()
  return remember(input.eventId,command,{success:true,book:structuredClone(data().books[item.id]),bookCreated:false,spellPrepared:false})
}
function physicalBookUnavailable(id:string){
  if(owned(id))return false
  const dropped=gs.getState().droppedItems?.[id]
  if(!dropped||dropped.mapId!==gs.getState().currentMapId)return true
  const player=gs.getPlayer()
  return Math.max(Math.abs(player.position.x-dropped.position.x),Math.abs(player.position.y-dropped.position.y))>1||!lightingRay(gs.getState(),player.position,dropped.position)
}
export function recordSpellbookLoss(raw:unknown){
  const input=SpellbookLossSchema.parse(raw),command=JSON.stringify({kind:'book-loss',input}),old=oldReceipt(input.eventId,command);if(old)return old
  wizard();room();let book=ledger()?.books[input.itemId]
  if(!book&&input.itemId==='spellbook'){
    const dropped=gs.getState().droppedItems?.[input.itemId],spells=dropped?.item.spellIds
    if(dropped&&spells&&gs.getPlayer().spellbook){
      data().books[input.itemId]={itemId:input.itemId,personalNotation:true,spellIds:[...spells],declaredAt:now(),source:'Actual dropped legacy personal book; retained physical identity, no replacement generated.',initialItem:structuredClone(dropped.item) as unknown as Record<string,unknown>,legacy:true};book=data().books[input.itemId]
    }
    if(!book&&!dropped&&!owned(input.itemId)){
      const player=gs.getPlayer(),template=getCharacterTemplate(player.characterId!,player.level),original=template.inventory.find(item=>item.id===input.itemId)
      if(original&&template.spellbook){
        const initialItem={id:original.id,name:original.name,type:original.type,provenance:'character_template',characterId:player.characterId,templateLevel:player.level,originalContentsRestored:false}
        data().books[input.itemId]={itemId:input.itemId,personalNotation:true,spellIds:[],declaredAt:now(),legacy:true,provenance:'character_template',historicalIdentityOnly:true,initialItem,
          source:'Announced legacy migration: original personal book identity proved by the fixed character template; actual absence and MJ loss confirmed now. No past date, former contents or physical volume created.'}
        book=data().books[input.itemId]
      }
    }
  }
  if(!book?.personalNotation)toolkitError('SPELLBOOK_LOSS_IDENTITY_REQUIRED','Select an actual previously established personal book, not a free invented lost volume.')
  if(!physicalBookUnavailable(input.itemId))toolkitError('SPELLBOOK_STILL_ACCESSIBLE','This real book is still owned or physically within reach; pick it up or copy its real source instead of declaring it lost.')
  const dropped=gs.getState().droppedItems?.[input.itemId]
  data().losses[input.itemId]={itemId:input.itemId,eventId:input.eventId,source:input.source,at:now(),physicalWitness:dropped?structuredClone(dropped) as unknown as Record<string,unknown>:{previouslyEstablishedItem:structuredClone(book!.initialItem)}}
  reconcileSpellbooks()
  return remember(input.eventId,command,{success:true,loss:structuredClone(data().losses[input.itemId]),preparedSpells:[...(gs.getPlayer().knownSpells??[])],otherSpellsRestored:false,bookCreated:false})
}
/** A selected group of physical books may jointly supply prepared spells. */
export function spellbookStudySources(bookIds?:string[],state:GameState=gs.getState()){
  const books=ownedPersonalSpellbooks(state)
  if(!books.length)toolkitError('SPELLBOOK_REQUIRED','An actual owned personal spellbook is required; old global knowledge or a lost volume does not supply it.')
  if(bookIds!==undefined){if(!bookIds.length||new Set(bookIds).size!==bookIds.length||bookIds.some(id=>!books.some(book=>book.itemId===id)))toolkitError('SPELLBOOK_SELECTION_INVALID','Select distinct actually owned personal books; foreign or lost books cannot supply wizard preparation.');return books.filter(book=>bookIds.includes(book.itemId))}
  if(books.length>1)toolkitError('SPELLBOOK_SELECTION_REQUIRED','Select the real personal book IDs explicitly; multiple books can jointly supply this preparation.')
  return books
}
export function ritualSpellbookSource(spellId:string,itemId?:string,state=gs.getState()){
  const books=ownedPersonalSpellbooks(state).filter(book=>book.spellIds.includes(spellId)),selected=itemId?books.find(book=>book.itemId===itemId):books.length===1?books[0]:undefined
  if(!selected)toolkitError(books.length>1&&!itemId?'SPELLBOOK_SELECTION_REQUIRED':'SPELLBOOK_RITUAL_SOURCE_REQUIRED','Select an actual owned personally written book containing this exact ritual; lost global knowledge is insufficient.')
  return selected!
}
function spellForCopy(id:string){const spell=getSpell(id),highest=Math.max(0,...Object.entries(gs.getPlayer().spellSlots??{}).filter(([,pool])=>pool.max>0).map(([key])=>Number(key.slice(5))))
  if(!spell||spell.level===0||spell.level>highest||!spellRules(id).classes.some(value=>value.index==='wizard'))toolkitError('SPELL_COPY_INVALID','Choose one supported non-cantrip wizard spell of a level this actual wizard can prepare.')
  return spell!
}
function destination(id?:string){const selected=id??(ownedPersonalSpellbooks(gs.getState()).length===1?ownedPersonalSpellbooks(gs.getState())[0].itemId:undefined)
  if(!selected)toolkitError('SPELLBOOK_SELECTION_REQUIRED','Choose the exact real destination book explicitly.')
  const item=bookItem(selected!),book=ledger()?.books[selected!]??ensureLegacyBook(selected!)
  if(!book.personalNotation)toolkitError('SPELLBOOK_DESTINATION_NOT_PERSONAL','Use an actual blank/personal destination; this tool never overwrites a foreign book or invents blank pages.')
  return{item,book}
}
function materialPreflight(materials:CopyMaterials,paid:Coins,costCp:number,involved:string[]){
  if(materials.mode==='paid_supply'){
    if(copperValue(paid)!==costCp)toolkitError('SPELL_COPY_PAYMENT_INVALID','Pay the exact source fine-ink/component cost with explicit actual denominations; no implicit change.')
    addCoins(balance(),emptyCoins(),paid);return undefined
  }
  if(copperValue(paid)!==0)toolkitError('SPELL_COPY_DOUBLE_PAYMENT','The actual already-owned material batch is consumed once; do not also pay cash for these same components.')
  const item=owned(materials.itemId)
  if(!item||item.type!=='misc'||item.magical||item.spellIds||involved.includes(item.id)||item.quantity!==undefined&&item.quantity!==1)
    toolkitError('SPELL_COPY_MATERIAL_BATCH_REQUIRED','Select one actual owned nonmagical fine-ink/component batch, not a book, scroll, weapon, stack or missing material.')
  const stock=ledger()?.materials[item!.id]
  if(stock&&materials.declaredValueCp!==stock.remainingValueCp)toolkitError('SPELL_COPY_MATERIAL_HISTORY_CONFLICT','This exact acquired stock retains its actual already-spent remainder; no declaration or nonce refills it.')
  if(materials.declaredValueCp<costCp)toolkitError('SPELL_COPY_MATERIAL_BATCH_VALUE','The actual remaining fine-ink/component stock must cover this exact source cost; no missing materials are granted.')
  if(!stock&&Object.keys(ledger()?.materials??{}).length>=512)toolkitError('SPELL_COPY_MATERIAL_LIMIT','The acquired-material history is full; earlier spent stocks are retained.')
  return structuredClone(item!) as unknown as Record<string,unknown>
}
function validateJobSource(job:Job,readingCompleted=false){
  const{book}=destination(job.destinationBookId)
  if(book.spellIds.includes(job.spellId)&&job.status!=='completed')toolkitError('SPELL_ALREADY_IN_BOOK','The exact destination already contains this spell; work cannot overwrite it or charge again.')
  if(job.mode==='replacement'){
    if(!job.lostBookId||!ledger()?.losses[job.lostBookId]||!physicalBookUnavailable(job.lostBookId))toolkitError('SPELLBOOK_LOSS_REQUIRED','The retained real old book must still actually be lost/unavailable for a prepared-only replacement.')
    if(!gs.getPlayer().knownSpells?.includes(job.spellId))toolkitError('SPELL_NOT_PREPARED','Only the spell actually prepared now can be transcribed from memory; lost unprepared spells are not restored.')
  }else if(job.mode==='scroll'){
    const record=ownedScroll(job.sourceItemId!);if(record.spellId!==job.spellId)toolkitError('SPELL_SCROLL_SPELL_MISMATCH','The same real scroll must retain this exact copied spell.')
    if(!readingCompleted)validateScrollCast(job.sourceItemId!,job.spellId)
  }else{
    const source=owned(job.sourceItemId!)
    if(!source?.spellIds?.includes(job.spellId))toolkitError('SPELL_COPY_SOURCE_UNAVAILABLE','The same actual owned source must still contain the selected spell before each real work segment.')
    if(job.mode==='backup'&&!ledger()?.books[job.sourceItemId!]?.personalNotation)toolkitError('SPELLBOOK_PERSONAL_SOURCE_REQUIRED','The cheap backup requires the actual personally written source, not ownership of foreign notation.')
  }
}
function finish(job:Job,check?:AbilityCheckResult){
  if(job.status==='completed')return toolkitResult({...job.result,replayed:true})
  validateJobSource(job,true)
  const scroll=job.mode==='scroll'?consumeScroll(job.sourceItemId!,check):undefined
  const succeeded=job.mode!=='scroll'||Boolean(check?.success)
  if(succeeded){const{item,book}=destination(job.destinationBookId);book.spellIds.push(job.spellId);item.spellIds=[...book.spellIds];reconcileSpellbooks();hero().preparedAtRest=false}
  job.status='completed';job.result={success:succeeded,jobId:job.jobId,spellId:job.spellId,destinationBookId:job.destinationBookId,mode:job.mode,
    elapsedWorkSeconds:job.workedSeconds,seconds:job.requiredSeconds,costGold:job.costCp/100,paid:job.paid,materials:job.materials,check:check??null,spellScrollUse:scroll??null,
    spellbook:[...(gs.getPlayer().spellbook??[])],preparedSpellsUnchanged:true,bookCreated:false,wallet:balance()}
  for(const eventId of new Set([job.jobId,job.segments.at(-1)?.eventId]))if(eventId&&data().receipts[eventId])data().receipts[eventId].result=structuredClone(job.result)
  return toolkitResult(structuredClone(job.result))
}
export function registerSpellbookContinuations(){registerCheckedResolution('spellbook-scroll-copy',(command,checked)=>{
  const job=ledger()?.jobs[String(command.jobId)]
  if(!job||job.status!=='held_scroll'||command.skill!=='arcana'||!('ability'in checked)||checked.ability!=='int'||checked.dc!==10+getSpell(job.spellId)!.level||checked.entityId!=='player')toolkitError('SPELL_COPY_CONTINUATION_MISMATCH','Resume only this exact completed work and its original Arcana die; no second scroll check is rolled.')
  return finish(job!,checked as AbilityCheckResult)
})}
export function resolveSpellCopy(jobId:string){
  const job=ledger()?.jobs[jobId];if(!job)toolkitError('SPELL_COPY_JOB_REQUIRED','Choose a real persisted copy job.')
  if(job!.status==='completed')return toolkitResult({...job!.result,replayed:true})
  if(job!.status==='held_scroll')return toolkitResult({pendingReaction:hero().pending,jobId})
  wizard();if(job!.workedSeconds!==job!.requiredSeconds)toolkitError('SPELL_COPY_WORK_INCOMPLETE','Perform only the actual remaining measured work first; no knowledge exists yet.')
  validateJobSource(job!,true)
  if(job!.mode!=='scroll')return finish(job!)
  job!.status='held_scroll'
  return checkedResolution({entityId:'player',ability:'int',skill:'arcana',dc:10+getSpell(job!.spellId)!.level,label:'Copie du parchemin'},
    {domain:'spellbook-scroll-copy',command:{jobId,skill:'arcana'}})
}
function work(job:Job,eventId:string,seconds:number,activity:Activity,source:string){
  reader(job.mode==='scroll');validateJobSource(job)
  if(!Number.isInteger(seconds)||seconds<=0||seconds>job.requiredSeconds-job.workedSeconds)toolkitError('SPELL_COPY_WORK_DURATION','Choose a positive real duration no greater than the exact remaining copy work.')
  if(job.segments.length>=1024)toolkitError('SPELL_COPY_SEGMENT_LIMIT','The real work-segment history is full; no earlier time or costs are discarded.')
  assertGameTimeAdvance(seconds);preflightRestStrenuousInterval()
  assertReadingInterval(seconds)
  const from=now(),state=gs.getState(),mapId=state.currentMapId!,cell={...state.player.position}
  advanceHeroTime(seconds);job.workedSeconds+=seconds;job.segments.push({eventId,from,to:now(),mapId,cell,activity,source})
  job.status=job.workedSeconds===job.requiredSeconds?'awaiting_completion':'working'
  recordRestMeasuredActivityInterval({eventId:`spell-copy:${eventId}`,from,to:now(),activity,reason:source.slice(0,600)})
  if(job.status==='awaiting_completion'&&!weatherDueIssue(state)&&!travelDueIssue(state)&&!isSurvivalDayDue()&&state.player.hp.current>0&&!state.player.conditions.some(value=>['incapacitated','unconscious','petrified','paralyzed','stunned'].includes(value)))return resolveSpellCopy(job.jobId)
  return toolkitResult({success:true,jobId:job.jobId,status:job.status,completedWorkSeconds:job.workedSeconds,requiredWorkSeconds:job.requiredSeconds,remainingWorkSeconds:job.requiredSeconds-job.workedSeconds,
    spellLearned:false,bookCreated:false,paymentAlreadyConsumed:true,worldTimeSeconds:now()})
}
interface StartInput{eventId:string;mode:Job['mode'];spellId:string;destinationBookId?:string;sourceItemId?:string;lostBookId?:string;paid:Coins;materials:CopyMaterials;workSeconds?:number;restActivity:Activity;activitySource:string}
function assertReadingInterval(seconds:number){
  // Reading is needed throughout actual work, not again after the very instant
  // the complete written copy and a contemporaneous light expiry are reached.
  const state=gs.getState(),activity=breathingActivityIssue(state,'player',seconds)
  // Work may stop exactly at collapse; its final resolution still requires a
  // capable reader. Never credit a single second after that real boundary.
  if(activity&&activity.boundaryAt<now()+seconds)toolkitError('SPELL_COPY_ACTIVITY_BOUNDARY',activity.message)
  const future={...state,worldTimeSeconds:Math.max(now(),now()+seconds-0.000001)}
  if(!visualPerceptionAt(future,future.player,future.player.position).canSee)toolkitError('SPELL_COPY_READING_INTERVAL_REQUIRED','The actual light or vision expires before the chosen copying interval ends. Choose a shorter real segment or establish real continuing light before any material/payment/time cost.')
}
export function startSpellCopy(input:StartInput){
  const command=JSON.stringify({kind:'copy-work',input}),old=oldReceipt(input.eventId,command);if(old)return toolkitResult(old)
  reader(input.mode==='scroll');room();if(ledger()?.jobs[input.eventId])toolkitError('SPELL_COPY_JOB_CONFLICT','This actual job identifier is already retained.')
  if(Object.keys(ledger()?.jobs??{}).length>=512)toolkitError('SPELL_COPY_JOB_LIMIT','The real copying-job history is full.')
  const spell=spellForCopy(input.spellId),{book}=destination(input.destinationBookId)
  if(book.spellIds.includes(spell.id))toolkitError('SPELL_ALREADY_IN_BOOK','This exact destination already contains that spell; no payment, material, work or scroll is spent.')
  if(book.spellIds.length>=512)toolkitError('SPELLBOOK_CONTENT_LIMIT','The retained physical book content list is full; no old spell is silently erased.')
  if(Object.values(ledger()?.jobs??{}).some(job=>job.status!=='completed'&&job.destinationBookId===book.itemId&&job.spellId===spell.id))toolkitError('SPELL_COPY_ALREADY_IN_PROGRESS','Continue the actual existing paid copying job for this exact destination/spell; a nonce cannot restart its materials, work or roll.')
  if(input.sourceItemId===book.itemId)toolkitError('SPELL_COPY_SAME_BOOK','Choose distinct real source and destination; a book is not copied into itself.')
  if(input.mode==='ordinary'&&gs.getState().dmTools?.spellScrolls?.[input.sourceItemId!])toolkitError('SPELL_SCROLL_TOOL_REQUIRED','Use the real scroll-copy resolver with its one Arcana check and source destruction.')
  if(input.mode==='backup')ensureLegacyBook(input.sourceItemId)
  const savant=feature('evocation_savant')&&spellRules(spell.id).school.index==='evocation',personal=input.mode==='backup'||input.mode==='replacement'
  const requiredSeconds=spell.level*(personal?3600:7200)*(savant?0.5:1),costCp=spell.level*(personal?1000:5000)*(savant?0.5:1)
  const paid=CoinsSchema.parse(input.paid),job:Job={jobId:input.eventId,mode:input.mode,spellId:spell.id,destinationBookId:book.itemId,
    sourceItemId:input.sourceItemId,lostBookId:input.lostBookId,createdAt:now(),requiredSeconds,workedSeconds:0,costCp,savant,paid,materials:input.materials,status:'working',segments:[]}
  validateJobSource(job)
  const seconds=input.workSeconds??requiredSeconds
  if(seconds>requiredSeconds||seconds<=0||!Number.isInteger(seconds))toolkitError('SPELL_COPY_WORK_DURATION','Choose no more than the source total real work time.')
  const materialItemSnapshot=materialPreflight(input.materials,paid,costCp,[book.itemId,input.sourceItemId??'',input.lostBookId??''])
  assertGameTimeAdvance(seconds);preflightRestStrenuousInterval()
  assertReadingInterval(seconds)
  if(input.materials.mode==='paid_supply')debitCoins(paid)
  else{
    const materialId=input.materials.itemId;job.materialItemSnapshot=materialItemSnapshot
    const stock=data().materials[materialId]??={itemId:materialId,initialValueCp:input.materials.declaredValueCp,remainingValueCp:input.materials.declaredValueCp,establishedAt:now(),source:input.materials.source,itemSnapshot:materialItemSnapshot!}
    stock.remainingValueCp-=costCp
    if(!stock.remainingValueCp)gs.consumePlayerItem(item=>item.id===materialId)
    // Value does not imply mass. Tracked physical declarations include this
    // changed source context and require a real measurement after partial use.
    afterInventoryChange()
  }
  data().jobs[job.jobId]=job
  const response=work(job,input.eventId,seconds,input.restActivity,input.activitySource)
  // The MCP result contains JSON; keep the exact initial operation receipt even
  // while its original Arcana die is held. Inspection exposes current progress.
  const content=response.content.find(block=>block.type==='text')
  remember(input.eventId,command,content&&content.type==='text'?JSON.parse(content.text):{jobId:job.jobId,status:job.status})
  return response
}
export function copyPersonalSpell(raw:PersonalSpellCopyInput){const input=PersonalSpellCopySchema.parse(raw);return startSpellCopy({...input,mode:input.mode==='backup'?'backup':'replacement',sourceItemId:input.sourceBookId})}
export function continueSpellCopy(input:{eventId:string;jobId:string;seconds:number;restActivity:Activity;source:string}){
  const command=JSON.stringify({kind:'continue-copy',input}),old=oldReceipt(input.eventId,command);if(old)return toolkitResult(old)
  room();const job=ledger()?.jobs[input.jobId];if(!job)toolkitError('SPELL_COPY_JOB_REQUIRED','Choose the real prior copy job; another nonce cannot create paid progress.')
  if(job!.status==='completed')return toolkitResult({...job!.result,replayed:true})
  if(job!.status!=='working')toolkitError('SPELL_COPY_COMPLETION_DUE','The work is complete; resolve its actual final completion/Arcana rather than adding time or rerolling.')
  const response=work(job!,input.eventId,input.seconds,input.restActivity,input.source),content=response.content.find(block=>block.type==='text')
  remember(input.eventId,command,content&&content.type==='text'?JSON.parse(content.text):{jobId:job!.jobId,status:job!.status})
  return response
}
export const legacyCopyEventId=(kind:string,sourceId:string,destinationId:string,spellId:string)=>`copy:${createHash('sha256').update(JSON.stringify([kind,sourceId,destinationId,spellId])).digest('hex')}`
