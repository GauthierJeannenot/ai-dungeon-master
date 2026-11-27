// Exact supplied PHB2014 Adventuring Gear table and entries. These definitions
// identify existing physical equipment; importing them grants no item or kit.
export const GROUND_GEAR={
  ball_bearings:{label:'Sac de 1 000 billes',units:1000,weightLb:2,priceCp:100,coveredSideFeet:10,saveAbility:'dex',saveDc:10,
    sourceLine:4253,source:'PHB2014 Ball Bearings; table Ball bearings (bag of1,000).'},
  caltrops:{label:'Sac de 20 chausse-trappes',units:20,weightLb:2,priceCp:100,coveredSideFeet:5,saveAbility:'dex',saveDc:15,
    sourceLine:4259,source:'PHB2014 Caltrops; table Caltrops (bag of20).'},
  hunting_trap:{label:'Piège de chasse',units:1,weightLb:25,priceCp:500,placementCells:1,saveAbility:'dex',saveDc:13,
    sourceLine:4289,source:'PHB2014 Hunting Trap. The5foot cell locates the actual central pressure plate, not an invented area-wide trigger.'},
} as const
export type GroundGearKind=keyof typeof GROUND_GEAR
export const isGroundGearKind=(id:string):id is GroundGearKind=>Object.hasOwn(GROUND_GEAR,id)
