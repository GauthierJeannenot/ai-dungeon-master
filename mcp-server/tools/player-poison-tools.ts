import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { playerPoisonCatalogue } from '../../lib/srd/player-poisons'
import { playerPoisonStateOf } from '../../lib/player-poison-state'
import { SpellAreaSelectionSchema } from '../../lib/spell-area-state'
import { preparePlayerPoison } from '../player-poison-preparation'
import { exposePlayerPoison,registerPlayerPoisonSaveResolutions } from '../player-poison-exposure'
import { releaseInhaledPoison,registerPlayerPoisonCloudResolution } from '../player-poison-cloud'
import { washPlayerPoison } from '../player-poison-washing'
import { toolkitResult,toolkitTransaction } from '../toolkit'
import * as gs from '../game-state'
const Id=z.string().min(1).max(180).refine(value=>!['constructor','prototype','__proto__'].includes(value)),Text=z.string().trim().min(1).max(1000)
const EventId=z.string().min(1).max(80).refine(value=>!['constructor','prototype','__proto__'].includes(value))
export function registerPlayerPoisonTools(server:McpServer){
 registerPlayerPoisonSaveResolutions()
 registerPlayerPoisonCloudResolution()
 server.registerTool('wash_player_poison',{
  description:'Actually wash one still-potent contact/injury DMG preparation from its exact reachable physical surface, using and consuming explicitly counted water in a real possessed registered container. The MJ explicitly confirms complete washing and adjudicates sufficient quantity; no universal printed amount, purification, automatic underwater washing, water or vessel is invented. Actual full action/six-second manipulation, hands and activity boundaries apply. Replays retain the single water debit.',
  inputSchema:{eventId:Id,preparationId:Id,waterContainerItemId:Id,quarterPints:z.number().int().min(1).max(100000),physicalFactId:Id,completeWashingConfirmed:z.literal(true),adjudication:Text},
 },async input=>toolkitTransaction(()=>toolkitResult(washPlayerPoison(input))))
 server.registerTool('inspect_player_poisons',{
  description:'Confidential MJ read-only actual possessed DMG poison preparations, spent doses and delivery receipts, plus the14published poison profiles and suggested single-dose prices. No vial, dealer, proficiency, stock, skin contact, ingestion, wound, exposure or identification is granted. Timing and initial one-surface coverage are announced engine adjudications, never a RAW one-projectile maximum.',
  inputSchema:{},annotations:{readOnlyHint:true,idempotentHint:true},
 },async()=>toolkitTransaction(()=>toolkitResult({catalogue:playerPoisonCatalogue(),state:playerPoisonStateOf(gs.getState())??null})))
 server.registerTool('prepare_player_poison',{
  description:'Spend one exact owned canonical DMG poison dose on one explicitly chosen actual physical surface. Initial one-object/projectile, one-delivery coverage is an announced engine adjudication; no RAW quantity ceiling is asserted and no partial potency/distribution is silently invented. Contact/ingested preparations require an actual public physical scene fact and the selected coated area or real food/liquid. Injury uses a true piercing/slashing weapon/projectile or the actual hunting-trap jaws, never a launcher coating that freely coats ammunition. One full combat action or6actual seconds outside combat is a timing convention; real hands/activity boundaries apply. Potency persists until source delivery/washing; no Basic Poison one-minute expiry is imported. Inhaled poisons must instead be actually released into their source cube.',
  inputSchema:{eventId:Id,doseItemId:Id,surfaceKind:z.enum(['weapon','ammunition','loaded_projectile','item','object','hunting_trap']),surfaceId:Id,
   physicalFactId:Id.optional(),foodOrLiquidConfirmed:z.literal(true).optional(),surfaceDescription:Text},
 },async input=>toolkitTransaction(()=>toolkitResult(preparePlayerPoison(input))))
 server.registerTool('expose_player_poison',{
  description:'Explicit MJ actual-event resolution for one previously applied real contact/ingested DMG dose, never a free player attack or forced feeding. Requires the exact physical surface, actual nearby affected body and a public physical event fact. Contact explicitly confirms the true touch and exposed/protected skin; true touch ends this application, effects require exposed skin, no glove/tool transfer is invented. Ingestion requires the entire dose actually swallowed; no partial potency, food, liquid, nutrition or unwilling ingestion is created. Injury cannot be asserted by a fact: it must follow the registered actual piercing/slashing wound. Source CON, damage, duration and recurring afflictions are fixed; original held Inspiration survives persistence without another dose or save. Midnight Tears uses the actual next midnight timestamp. Quantified provisions and water use consume_provisions to preserve their real debit/intake together with the original whole-dose CON; this scene-event tool cannot bypass those resources.',
  inputSchema:{eventId:Id,preparationId:Id,targetId:Id,physicalFactId:Id,actualTouchConfirmed:z.literal(true).optional(),exposedSkinConfirmed:z.boolean().optional(),entireDoseSwallowedConfirmed:z.literal(true).optional(),midnightAt:z.number().int().nonnegative().optional()},
 },async input=>toolkitTransaction(()=>exposePlayerPoison(input)))
 server.registerTool('release_inhaled_poison',{
  description:'Actually release one exact owned canonical inhaled DMG poison dose into the explicitly selected real five-foot cube. Uses shared physical3D body/barrier primitives, includes every actual exposed body (including hidden NPCs and the user when in the cube), preserves sequential CON saves and all original targets through hydration/Inspiration. No arbitrary target list, distant throw range, guessed height, wall passage, spell, slot or free gas is granted. Five-foot origin manipulation and full action/six actual seconds are announced engine conventions. Cloud dissipates immediately after this real exposure; it never becomes a persistent terrain hazard. Holding breath does not protect against this source poison.',
  inputSchema:{eventId:EventId,doseItemId:Id,area:SpellAreaSelectionSchema},
 },async input=>toolkitTransaction(()=>releaseInhaledPoison(input)))
}
