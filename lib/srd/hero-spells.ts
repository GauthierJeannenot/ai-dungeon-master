import subclassSources from './subclass-sources.json'
import levelSources from './level7-sources.json'
import narrativeSources from './narrative-spell-sources.json'
import curseSources from './curse-spell-sources.json'
import areaSources from './spell-area-sources.json'

// Exact sourced spell actions supported for non-player casters. Their other
// source spells (including NPC reaction spells) remain reference-only.
export const CREATURE_SPELL_IDS:Record<string,string[]>={mage:[
  'fireball','magic-missile','mage-armor','misty-step','greater-invisibility','detect-magic',
]}

export interface SourceSpell { index:string;school:{index:string};casting_time:string;duration:string;concentration:boolean;ritual:boolean;
  components:string[];material?:string;classes:Array<{index:string}> }
const records={...levelSources.records,...subclassSources.records,...narrativeSources.records,...curseSources.records,...areaSources.records} as unknown as Record<string,{source:SourceSpell}>
export function spellRules(id:string):SourceSpell {
  const record=records[`spells/${id==='create-water'?'create-or-destroy-water':id}`]
  if(!record)throw new Error(`Missing pinned SRD spell: ${id}`)
  return record.source
}
export function durationSeconds(duration:string):number {
  const match=/(\d+)\s+(round|minute|hour|day)/i.exec(duration)
  return match?Number(match[1])*({round:6,minute:60,hour:3600,day:86400}[match[2].toLowerCase() as 'round'|'minute'|'hour'|'day']):0
}
