import { ConfigureCampaignCalendarSchema,RecordCalendarReferenceSchema,calendarConfigurationCommand,calendarReferenceCommand,calendarProjection,validateCalendarState } from '../lib/calendar-state'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import { readCampaignCalendarSource } from './rules-library'
import { toolkitState,toolkitError } from './toolkit'
import * as gs from './game-state'
function ready(){if(gs.getState().phase==='combat')toolkitError('CALENDAR_BOOKKEEPING_OUTSIDE_COMBAT','Configure and record this bounded MJ bookkeeping outside combat; reading the calendar remains available.')}
function fact(id:string){const f=gs.getState().worldFacts?.find(f=>f.id===id);if(!f)toolkitError('CALENDAR_ACTUAL_FACT_REQUIRED','Choose the exact existing actual MJ calendar decision or reference fact. No date, world, cycle or consequence is inferred from prose.');return structuredClone(f!) as unknown as Record<string,unknown>}
export function validateCalendarSource(state:import('../lib/types').GameState){return state.dmTools?.calendar&&witness(state.dmTools.calendar.configuration.source)!==witness(readCampaignCalendarSource())?['Keep the exact original canonical DMG2014 Tracking Time/Harptos source.']:[]}
export function configureCampaignCalendar(raw:unknown){
 const input=ConfigureCampaignCalendarSchema.parse(raw),old=gs.getState().dmTools?.calendar
 if(old){if(witness(old.configuration.input)!==witness(input))toolkitError('CALENDAR_CONFIGURATION_IMMUTABLE','Retain the original explicit definition, date and engine anchor; no new nonce, calendar or date can reset/rebase campaign time.');return{success:true,configured:true,replayed:true,seconds:0,actionSpent:false}}
 ready();const configuration={input,decisionFact:fact(input.decisionFactId),source:readCampaignCalendarSource(),at:gs.getState().worldTimeSeconds??0,command:''};configuration.command=calendarConfigurationCommand(configuration)
 const data={version:1 as const,configuration,references:{}},preview=structuredClone(gs.getState());preview.dmTools??={version:1,objects:{},traps:{},npcs:{},itemUses:{}};preview.dmTools.calendar=data
 const issues=validateCalendarState(preview);if(issues.length)toolkitError('CALENDAR_CONFIGURATION_INVALID',issues.join(' '))
 toolkitState().calendar=data;return{success:true,configured:true,seconds:0,actionSpent:false,anchorWorldTimeSeconds:configuration.at,notice:'Explicit MJ calendar labels only; existing clock, rests, survival, worked calendarDay and event debts unchanged.'}
}
export function recordCalendarReference(raw:unknown){
 const input=RecordCalendarReferenceSchema.parse(raw),data=gs.getState().dmTools?.calendar??toolkitError('CALENDAR_NOT_CONFIGURED','Choose and configure the actual MJ calendar and exact anchor first.'),old=data.references[input.referenceId]
 if(old){if(witness(old.input)!==witness(input))toolkitError('CALENDAR_REFERENCE_IMMUTABLE','Keep this exact original reference, date and period; references are never events or mutable clock labels.');return{success:true,referenceId:input.referenceId,replayed:true,seconds:0,consequencesApplied:false}}
 ready();if(data.configuration.input.eventId===input.eventId||Object.values(data.references).some(r=>r.input.eventId===input.eventId))toolkitError('CALENDAR_EVENT_CONFLICT','This original command ID is already used.')
 if(Object.values(data.references).some(r=>r.input.factId===input.factId))toolkitError('CALENDAR_REFERENCE_FACT_ALREADY_USED','The same original actual reference cannot be duplicated with another reference ID or command nonce.')
 if(Object.keys(data.references).length>=128)toolkitError('CALENDAR_REFERENCE_LIMIT','Calendar references are full; no existing reference is evicted.')
 const reference={input,fact:fact(input.factId),at:gs.getState().worldTimeSeconds??0,configurationCommand:data.configuration.command,command:''};reference.command=calendarReferenceCommand(reference)
 const preview=structuredClone(gs.getState());preview.dmTools!.calendar!.references[input.referenceId]=reference
 const issues=validateCalendarState(preview);if(issues.length)toolkitError('CALENDAR_REFERENCE_INVALID',issues.join(' '))
 data.references[input.referenceId]=reference;return{success:true,referenceId:input.referenceId,seconds:0,actionSpent:false,consequencesApplied:false,notice:'Reference only. Any actual event or mechanical consequence requires its own explicit appropriate procedure.'}
}
export function inspectCampaignCalendar(){return{readOnly:true,...calendarProjection(gs.getState()),seconds:0,consequencesApplied:false,notice:'Date projection from the real engine clock only. No automatic astronomy, weather, encounter, observance, event, recharge, rest, debt or resource change. One adopted display day is exactly86400engine seconds; existing worked calendarDay procedures remain independent.'}}
