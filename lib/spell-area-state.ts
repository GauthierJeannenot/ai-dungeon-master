import { z } from 'zod'
import { unit3,cross3,dot3,type SpellAreaVolume,type Point3 } from './spell-area-geometry'

const Feet=z.number().finite().min(-100000).max(100000)
const Vector=z.object({x:Feet,y:Feet,z:Feet}).strict().refine(v=>Math.hypot(v.x,v.y,v.z)>1e-8,'Choose an explicit nonzero spatial direction.')
export const SpellAreaSelectionSchema=z.object({
 origin:z.object({x:z.number().finite().min(-.5).max(100000),y:z.number().finite().min(-.5).max(100000),zFeet:Feet}).strict(),
 direction:Vector.optional(),faceU:Vector.optional(),
 faceOffset:z.object({uFeet:z.number().finite().nonnegative(),vFeet:z.number().finite().nonnegative()}).strict().optional(),
 verticalDirection:z.enum(['up','down']).optional(),surfaceId:z.string().min(1).max(180).optional(),includeOrigin:z.boolean().optional(),
}).strict()
export type SpellAreaSelection=z.infer<typeof SpellAreaSelectionSchema>
export interface SpellAreaProfile{spellId:string;shape:SpellAreaVolume['shape'];originKind:'caster'|'point';rangeFeet:number;
 lengthFeet?:number;widthFeet?:number;sideFeet?:number;radiusFeet?:number;heightFeet?:number;aroundCorners?:boolean;
 source:{book:'phb-2014';section:string;file:string}}
const source=(section:string)=>({book:'phb-2014' as const,section,file:'rules/books/phb-2014.md'})
// Literal, reviewed source dimensions. Nothing is inferred from player text or
// selected freely by a caller, and preview never grants a known spell/scroll.
export const SPELL_AREA_PROFILES:Readonly<Record<string,SpellAreaProfile>>={
 'burning-hands':{spellId:'burning-hands',shape:'cone',originKind:'caster',rangeFeet:0,lengthFeet:15,source:source('Burning Hands; Areas of Effect / Cone')},
 thunderwave:{spellId:'thunderwave',shape:'cube',originKind:'caster',rangeFeet:0,sideFeet:15,source:source('Thunderwave; Areas of Effect / Cube')},
 'lightning-bolt':{spellId:'lightning-bolt',shape:'line',originKind:'caster',rangeFeet:0,lengthFeet:100,widthFeet:5,source:source('Lightning Bolt; Areas of Effect / Line')},
 shatter:{spellId:'shatter',shape:'sphere',originKind:'point',rangeFeet:60,radiusFeet:10,source:source('Shatter; Areas of Effect / Sphere')},
 fireball:{spellId:'fireball',shape:'sphere',originKind:'point',rangeFeet:150,radiusFeet:20,aroundCorners:true,source:source('Fireball; Areas of Effect / Sphere')},
 'flame-strike':{spellId:'flame-strike',shape:'cylinder',originKind:'point',rangeFeet:60,radiusFeet:10,heightFeet:40,source:source('Flame Strike; Areas of Effect / Cylinder')},
}
export const pointFromAreaOrigin=(value:SpellAreaSelection['origin']):Point3=>({x:value.x*5,y:value.y*5,z:value.zFeet})
export function makeSpellAreaVolume(profile:SpellAreaProfile,input:SpellAreaSelection):SpellAreaVolume{
 const origin=pointFromAreaOrigin(input.origin),mandatoryOrigin=profile.shape==='sphere'||profile.shape==='cylinder'
 if(mandatoryOrigin&&input.includeOrigin===false)throw Error('The source includes a sphere/cylinder origin; it cannot be removed.')
 const includeOrigin=mandatoryOrigin||Boolean(input.includeOrigin)
 if(profile.shape==='sphere'){
  if(input.direction||input.faceU||input.faceOffset||input.verticalDirection||input.surfaceId)throw Error('A sourced sphere requires its actual origin only, without an invented orientation or supporting surface.')
  return{shape:'sphere',origin,includeOrigin,radius:profile.radiusFeet!}
 }
 if(profile.shape==='cylinder'){
  if(!input.verticalDirection||input.direction||input.faceU||input.faceOffset)throw Error('A sourced cylinder requires its real base/top origin and explicit up/down direction, not a free axis.')
  return{shape:'cylinder',origin,includeOrigin,radius:profile.radiusFeet!,height:profile.heightFeet!,verticalDirection:input.verticalDirection}
 }
 if(!input.direction||input.verticalDirection||input.surfaceId)throw Error('This source requires an explicit direction and does not accept a cylinder surface/direction.')
 const direction=unit3(input.direction)
 if(profile.shape==='cube'){
  if(!input.faceU||!input.faceOffset)throw Error('Choose the cube face orientation and both offsets of its actual origin on that face.')
  const faceU=unit3(input.faceU)
  if(Math.abs(dot3(direction,faceU))>1e-8)throw Error('The cube face axis must be perpendicular to its inward direction.')
  if(input.faceOffset.uFeet>profile.sideFeet!||input.faceOffset.vFeet>profile.sideFeet!)throw Error('The origin must lie on the sourced cube face, including its boundary.')
  return{shape:'cube',origin,includeOrigin,direction,faceU,faceV:unit3(cross3(direction,faceU)),side:profile.sideFeet!,offsetU:input.faceOffset.uFeet,offsetV:input.faceOffset.vFeet}
 }
 if(input.faceU||input.faceOffset)throw Error('Only a sourced cube has face axes and offsets.')
 return{shape:profile.shape,origin,includeOrigin,direction,length:profile.lengthFeet!,...(profile.shape==='line'?{width:profile.widthFeet!}:{})}
}
