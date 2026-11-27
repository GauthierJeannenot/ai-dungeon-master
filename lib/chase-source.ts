/** Immutable targeted DMG2014 chase references, not an activated table or world event. */
export const CHASE_SOURCE = {
 book: 'dmg-2014', beginning: [8173,8177], dashing: [8185,8189],
 opportunity: [8191,8197], escape: [8199,8220], complications: [8222,8241],
 customTables: [8258,8260], splitAndRoleReversal: [8262,8276],
} as const
export const URBAN_CHASE_COMPLICATIONS = {
 1:{kind:'obstacle',roll:'check',dc:15,choices:['acrobatics'],failureTerrainFeet:10},
 2:{kind:'crowd',roll:'check',dc:10,choices:['athletics','acrobatics'],failureTerrainFeet:10},
 3:{kind:'barrier',roll:'save',dc:10,ability:'str',failureProne:true},
 4:{kind:'maze',roll:'check',dc:10,choices:['acrobatics','int'],failureTerrainFeet:10},
 5:{kind:'slippery',roll:'save',dc:10,ability:'dex',failureProne:true},
 6:{kind:'dogs',roll:'check',dc:10,choices:['acrobatics'],failureTerrainFeet:5,failureDamage:'1d4',damageType:'piercing'},
 7:{kind:'brawl',roll:'check',dc:15,choices:['athletics','acrobatics','intimidation'],failureTerrainFeet:10,failureDamage:'2d4',damageType:'bludgeoning'},
 8:{kind:'beggar',roll:'check',dc:10,choices:['athletics','acrobatics','intimidation'],failureTerrainFeet:5,coinBypass:true},
 9:{kind:'guard',triggerMovementFeet:20,attackBonus:3,damage:'1d6+1',damageType:'piercing'},
 10:{kind:'sharp_turn',roll:'save',dc:10,ability:'dex',failureDamage:'1d4',damageType:'bludgeoning'},
} as const
/** No clamp: DMG says exactly three plus the actual Constitution modifier. */
export function chaseFreeDashThreshold(constitutionModifier:number){return 3+constitutionModifier}
export function urbanChaseComplication(d20:number){
 if(!Number.isInteger(d20)||d20<1||d20>20)throw new Error('A chase table uses one retained actual d20,1-20.')
 return d20>10?null:URBAN_CHASE_COMPLICATIONS[d20 as keyof typeof URBAN_CHASE_COMPLICATIONS]
}

/** Targeted supplied DMG table; deferred rows retain their actual d20. */
export const WILDERNESS_CHASE_SOURCE = {book:'dmg-2014',sha256:'fa75462a6ef96ef0f86fbfd2d433c624ce926ff630a43d1fcaea6a2c1249b0d1',startLine:8243,endLine:8257} as const
export const WILDERNESS_CHASE_COMPLICATIONS = {
 1:{kind:'brush',roll:'check',dc:10,choices:['athletics','acrobatics'],failureTerrainFeet:5},
 2:{kind:'uneven_ground',roll:'check',dc:10,choices:['acrobatics'],failureTerrainFeet:10},
 3:{kind:'insect_swarm',deferred:true},
 4:{kind:'impediment',roll:'check',dc:10,choices:['athletics','acrobatics'],failureTerrainFeet:10},
 5:{kind:'blowing_particles',roll:'save',dc:10,ability:'con',failureBlindSpeedHalf:true},
 6:{kind:'sudden_drop',deferred:true},
 7:{kind:'hunters_snare',deferred:true},
 8:{kind:'stampede',roll:'save',dc:10,ability:'dex',failureDamageComponents:[{dice:'1d4',type:'bludgeoning'},{dice:'1d4',type:'piercing'}]},
 9:{kind:'razorvine',deferred:true},
 10:{kind:'indigenous_creature',deferred:true},
} as const
export function wildernessChaseComplication(d20:number){
 if(!Number.isInteger(d20)||d20<1||d20>20)throw new Error('A chase table uses one retained actual d20,1-20.')
 return d20>10?null:WILDERNESS_CHASE_COMPLICATIONS[d20 as keyof typeof WILDERNESS_CHASE_COMPLICATIONS]
}

/** Each actual Dash contributes at most one end-turn check, even for a negative signed threshold. */
export function chaseExcessDashCount(priorActualDashes:number,thisTurnActualDashes:number,constitutionModifier:number){
 if(!Number.isInteger(priorActualDashes)||priorActualDashes<0||!Number.isInteger(thisTurnActualDashes)||thisTurnActualDashes<0)throw new Error('Actual source Dash counts must be nonnegative integers.')
 let checks=0
 for(let i=1;i<=thisTurnActualDashes;i++)if(priorActualDashes+i>chaseFreeDashThreshold(constitutionModifier))checks++
 return checks
}
