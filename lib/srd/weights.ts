// PHB 2014 pp.145,149–154: only explicit numeric table weights, in pounds.
// Exact equipment IDs select definitions. A dash or an absent row is unknown,
// never a fabricated zero. Variable provisions are resolved from actual state.
export const EQUIPMENT_WEIGHTS_LB: Readonly<Record<string,number>>={
  club:2,dagger:1,greatclub:10,handaxe:2,javelin:2,light_hammer:2,mace:4,quarterstaff:4,sickle:2,spear:3,
  'light-crossbow':5,dart:0.25,shortbow:2,battleaxe:4,flail:2,glaive:6,greataxe:7,greatsword:6,
  halberd:6,lance:6,longsword:3,maul:10,morningstar:4,pike:18,rapier:2,scimitar:3,shortsword:2,
  'light-hammer':2,'war-pick':2,
  trident:4,war_pick:2,warhammer:2,whip:3,blowgun:1,'hand-crossbow':3,'heavy-crossbow':18,longbow:2,net:3,
  padded_armor:8,leather:10,leather_armor:10,studded_leather:13,hide_armor:12,chain_shirt:20,scale_mail:45,
  breastplate:20,half_plate:40,ring_mail:40,chain_mail:55,splint:60,plate:65,shield:6,
  arrows:1/20,crossbow_bolts:1.5/20,sling_bullets:1.5/20,blowgun_needles:1/50,
  acid_vial:1,alchemists_fire_flask:1,holy_water_flask:1,oil_flask:1,
  ball_bearings:2,caltrops:2,hunting_trap:25,
  backpack:5,bedroll:7,blanket:3,book:5,component_pouch:2,crowbar:5,healers_kit:3,
  lamp:1,bullseye_lantern:2,hooded_lantern:2,potion_of_healing:0.5,pouch:1,quiver:1,
  spellbook:3,tinderbox:1,torch:1,hempen_rope_50_feet:10,silk_rope_50_feet:5,
  alchemists_supplies:8,brewers_supplies:9,calligraphers_supplies:5,
  carpenters_tools:6,cartographers_tools:6,cobblers_tools:5,cooks_utensils:8,glassblowers_tools:5,
  jewelers_tools:2,leatherworkers_tools:5,masons_tools:8,painters_supplies:5,potters_tools:3,
  smiths_tools:8,tinkers_tools:10,weavers_tools:5,woodcarvers_tools:5,disguise_kit:3,forgery_kit:5,
  dragonchess_set:0.5,herbalism_kit:3,bagpipes:6,drum:3,dulcimer:10,flute:1,lute:2,lyre:2,horn:2,
  pan_flute:2,shawm:1,viol:1,navigators_tools:2,poisoners_kit:2,thieves_tools:1,
}
export const COUNTED_AMMUNITION_WEIGHTS=new Set(['arrows','crossbow_bolts','sling_bullets','blowgun_needles'])
