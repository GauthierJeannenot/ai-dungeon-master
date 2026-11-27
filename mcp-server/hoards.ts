import { COIN_IDS, emptyCoins } from '../lib/srd/currency'
import type { ValuableRecord } from '../lib/hoard-state'
import { readDmgTreasureSource, readRollableTable } from './rules-library'
import { rollDice } from './dice'
import { toolkitError } from './toolkit'

export const HOARD_BANDS=['0-4','5-10','11-16','17+'] as const
const comma=(value:number)=>value.toLocaleString('en-US')
function coinFormula(value:string){
  if(value==='—')return null
  const match=/^(\d{1,2})d6\s*×\s*([\d,]+)\s*\([\d,]+\)$/.exec(value)
  const multiplier=Number(match?.[2].replaceAll(',',''))
  if(!match||Number(match[1])<1||Number(match[1])>20||![10,100,1000].includes(multiplier))toolkitError('HOARD_SOURCE_UNSUPPORTED','Unsupported source coin formula; no dice consumed.')
  return {notation:`${match![1]}d6`,multiplier}
}
function valuableFormula(value:string){
  if(value==='—')return null
  const match=/^(\d+)d(4|6|8|10)\s*\(\d+\)\s*([\d,]+) gp (gems|art objects)$/.exec(value)
  if(!match||Number(match[1])>3)toolkitError('HOARD_SOURCE_UNSUPPORTED','Unsupported source valuable formula; no dice consumed.')
  const valueGp=Number(match![3].replaceAll(',','')),kind=match![4]==='gems'?'gem' as const:'art' as const
  const source=readDmgTreasureSource(`${comma(valueGp)} gp ${kind==='gem'?'Gemstones':'Art Objects'}`)
  const table=readRollableTable(source.tableId)
  if(table.columns.length!==2)toolkitError('HOARD_SOURCE_UNSUPPORTED','Unsupported identity table; no dice consumed.')
  return {notation:`${match![1]}d${match![2]}`,kind,valueGp,table,source:source.source}
}
function magicFormula(value:string){
  if(value==='—')return []
  const parts=value.replace(/^Roll /,'').replace(/\.$/,'').split(' and ')
  const parsed=parts.map(part=>{
    const match=/^(once|1d[468] times) on Magic Item Table ([A-I])$/.exec(part)
    if(!match)toolkitError('HOARD_SOURCE_UNSUPPORTED','Unsupported magic table instructions; no dice consumed.')
    return {notation:match![1]==='once'?null:match![1].split(' ')[0],source:readDmgTreasureSource(`Magic Item Table ${match![2]}`).source,instruction:part}
  })
  if(parsed.length>2)toolkitError('HOARD_SOURCE_UNSUPPORTED','Too many magic subtables; no dice consumed.')
  return parsed
}
export function prepareHoardSource(band:typeof HOARD_BANDS[number]){
  const title=`Treasure Hoard: Challenge ${band.replace('-','—')}`,coins=readDmgTreasureSource(title),main=readDmgTreasureSource(title,1)
  const cells=(line:string)=>line.trim().slice(1,-1).split('|').map(c=>c.trim())
  const lines=coins.text.trimEnd().split(/\r?\n/),header=cells(lines[0]),values=cells(lines[2])
  if(header.slice(1).join(',').toLowerCase()!=='cp,sp,ep,gp,pp'||values[0]!=='**Coins**'||values.length!==6)toolkitError('HOARD_SOURCE_UNSUPPORTED','Unsupported hoard coin source columns; no dice consumed.')
  const formulas=COIN_IDS.map((id,i)=>({id,formula:coinFormula(values[i+1])})),table=readRollableTable(main.tableId)
  if(table.columns.length!==3)toolkitError('HOARD_SOURCE_UNSUPPORTED','Unsupported hoard columns; no dice consumed.')
  const rows=table.rows.map(row=>({row,valuables:valuableFormula(row.cells[1]),magic:magicFormula(row.cells[2])}))
  return {coins,main,formulas,rows}
}
export function drawHoard(source:ReturnType<typeof prepareHoardSource>,hoardId:string){
  const rolls:ReturnType<typeof rollDice>[]=[],coins=emptyCoins(),valuables:ValuableRecord[]=[]
  for(const entry of source.formulas)if(entry.formula){const roll=rollDice(entry.formula.notation);rolls.push(roll);coins[entry.id]=roll.total*entry.formula.multiplier}
  const selection=rollDice('1d100');rolls.push(selection)
  const selected=source.rows.find(entry=>entry.row.low<=selection.total&&selection.total<=entry.row.high)!
  if(selected.valuables){
    const spec=selected.valuables,quantity=rollDice(spec.notation);rolls.push(quantity)
    if(quantity.total>18)toolkitError('HOARD_SOURCE_UNSUPPORTED','Source valuable quantity exceeds its supported bound.')
    for(let i=0;i<quantity.total;i++){
      const identity=rollDice(spec.table.notation);rolls.push(identity)
      const row=spec.table.rows.find(row=>row.low<=identity.total&&identity.total<=row.high)!
      valuables.push({id:`${hoardId}:valuable:${i+1}`,hoardId,kind:spec.kind,name:row.cells[1].replaceAll('*',''),valueGp:spec.valueGp,source:spec.source})
    }
  }
  const magicDraws=selected.magic.map(request=>{const count=request.notation?rollDice(request.notation):undefined;if(count)rolls.push(count)
    return {count:count?.total??1,source:request.source,instruction:request.instruction}})
  return {coins,valuables,rolls,magicDraws,source:source.main.source,coinSource:source.coins.source}
}
