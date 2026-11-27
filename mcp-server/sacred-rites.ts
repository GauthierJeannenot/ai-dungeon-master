import { AbandonSacredRitesSchema, StartSacredRitesSchema, WorkSacredRitesSchema, SACRED_RITES_SOURCE, sacredRitesWitness, sacredRiteDueAwards, sacredRiteGrantId, sacredRiteGrantReason, type SacredRitesProject } from '../lib/sacred-rites-state';
import { downtimeIntervalIssue } from '../lib/downtime-ledger';
import { entityGroundContact, entityVerticalContext } from '../lib/jumping-state';
import { fullyImmersedInWater } from '../lib/underwater-rules';
import { breathingActivityIssue } from '../lib/activity-preflight';
import { groundGearRecoveryActivityIssue } from '../lib/ground-gear-recovery-state';
import { AFFLICTIONS } from '../lib/srd/afflictions';
import { available, advanceHeroTime, now } from './hero-rules';
import { assertGameTimeAdvance } from './time-preflight';
import { assertNoRecordedRest } from './resting';
import { assertToolkitReach, toolkitState, toolkitError } from './toolkit';
import { grantSourceDmInspiration } from './dm-inspiration';
import { readSacredRitesSource } from './rules-library';
import { rollDice } from './dice';
import * as gs from './game-state';
const stamp = <T extends object>(body: T) => ({ ...body, command: sacredRitesWitness(body) });
const projects = () => gs.getState().dmTools?.sacredRites?.projects ?? [];
const summary = (p: SacredRitesProject, replayed = false) => ({ success: true, replayed, projectId: p.start.input.projectId, completedDays: p.segments.length, requiredDays: 10, completed: Boolean(p.benefit), project: p, actionSpent: false });
function replay(input: {
    eventId: string;
}) { for (const p of projects()) {
    const e = [p.start, ...p.segments, p.abandonment].find(e => e?.input.eventId === input.eventId);
    if (e) {
        if (sacredRitesWitness(e.input) !== sacredRitesWitness(input))
            toolkitError('SACRED_RITES_EVENT_CONFLICT', 'Retain the exact original rite command.');
        return summary(p, true);
    }
} }
function ready() { available(); if (gs.getState().phase === 'combat')
    toolkitError('SACRED_RITES_EXPLORATION_REQUIRED', 'Choose actual downtime outside initiative.'); if (gs.getPlayer().hp.current <= 0 || gs.getPlayer().conditions.some(c => ['incapacitated', 'stunned', 'paralyzed', 'petrified', 'unconscious'].includes(c)))
    toolkitError('SACRED_RITES_ACTOR_UNAVAILABLE', 'The actual character must be able to perform these rites.'); assertNoRecordedRest(); }
function fact(id: string) { const s = gs.getState(), f = s.worldFacts?.find(f => f.id === id); if (!f || f.source !== 'record_scene_fact' || f.expires !== 'never' || f.clueId || f.subjectItemId || f.mapId !== s.currentMapId || f.roomId !== s.currentRoomId || sacredRitesWitness(f.narrativeEffect?.cell) !== sacredRitesWitness(s.player.position))
    toolkitError('SACRED_RITES_FACT_REQUIRED', 'Select one actual durable public local temple/devotion/access/role fact at this measured site.'); return structuredClone(f) as unknown as Record<string, unknown>; }
function priest(p: Pick<SacredRitesProject, 'start'>) {
  const input = p.start.input
  if (input.role === 'temple_priest') {
    if (input.priestId) toolkitError('SACRED_RITES_PRIEST_NOT_APPLICABLE', 'The actual player temple-priest role does not select another priest.')
    return
  }
  const target = input.priestId ? gs.getPhysicalCreature(input.priestId) : undefined
  const npc = input.priestId ? gs.getNpc(input.priestId) : undefined, s = gs.getState()
  if (!target || input.priestId === 'player' || npc?.group || target.hp.current <= 0
    || target.conditions.some(c => ['incapacitated','stunned','paralyzed','petrified','unconscious'].includes(c))
    || npc && (!npc.visible || !gs.npcOnCurrentMap(npc))
    || Math.max(Math.abs(target.position.x-s.player.position.x),Math.abs(target.position.y-s.player.position.y)) > 1)
    toolkitError('SACRED_RITES_ACTUAL_PRIEST_REQUIRED', 'Lay assistance requires its actual existing available adjacent priest and real role fact; no priest is created.')
  const vertical = entityVerticalContext(s,target.id)
  if (!vertical.known || vertical.zFeet !== p.start.site.zFeet
    || !entityGroundContact(s,target.id,target.position,p.start.site.zFeet).contact
    || fullyImmersedInWater(s,{kind:'creature',entityId:target.id}) !== false)
    toolkitError('SACRED_RITES_PRIEST_SUPPORT_REQUIRED', 'This first assistance tranche needs the real priest at the same dry supported temple height.')
}
function atSite(site: SacredRitesProject['start']['site']) { const s = gs.getState(); if (s.currentMapId !== site.mapId || s.currentRoomId !== site.roomId || sacredRitesWitness(s.player.position) !== sacredRitesWitness(site.cell) || !entityGroundContact(s, 'player', site.cell, site.zFeet).contact || fullyImmersedInWater(s, { kind: 'creature', entityId: 'player' }) !== false)
    toolkitError('SACRED_RITES_SITE_REQUIRED', 'Return to the actual original dry supported temple worksite.'); assertToolkitReach({ ...site, surfaceZFeet: site.zFeet }); }
export function reconcileSacredRiteAwards() { const state = gs.getState(); for (const { project, day, at } of sacredRiteDueAwards(state, state.worldTimeSeconds ?? 0)) {
    const eventId = sacredRiteGrantId(project.start.input.projectId, day), result = grantSourceDmInspiration(), receipt = { day, at, eventId, reason: sacredRiteGrantReason(project.start.input.projectId, day), outcome: result.granted ? 'granted' as const : 'capped' as const };
    project.benefit!.awards.push(stamp(receipt));
} }
export function startSacredRites(raw: unknown) { const input = StartSacredRitesSchema.parse(raw), old = replay(input); if (old)
    return old; ready(); readSacredRitesSource(); const s = gs.getState(), v = entityVerticalContext(s, 'player'); if (projects().length >= 16 || projects().some(p => !p.benefit && !p.abandonment || p.benefit && p.benefit.lastDay * 86400 > now()))
    toolkitError('SACRED_RITES_OPEN_CYCLE', 'This bounded tranche retains one unfinished cycle and waits for all earlier benefit date beginnings; actual religious practice itself is not forbidden.'); if (projects().some(p => p.start.input.projectId === input.projectId))
    toolkitError('SACRED_RITES_PROJECT_ID_CONFLICT', 'The retained original project identity cannot be reused.'); if (new Set([input.templeFactId, input.devotionFactId, input.accessFactId, input.roleFactId]).size !== 4)
    toolkitError('SACRED_RITES_DISTINCT_FACTS_REQUIRED', 'Retain distinct actual temple, devotion, access and role qualifications.'); if (!v.known || v.zFeet === null || !s.currentMapId || !s.currentRoomId)
    toolkitError('SACRED_RITES_SITE_REQUIRED', 'A measured actual temple site is required.'); const site = { mapId: s.currentMapId, roomId: s.currentRoomId, cell: { ...s.player.position }, zFeet: v.zFeet }; atSite(site); const start = stamp({ input, at: now(), site, facts: [input.templeFactId, input.devotionFactId, input.accessFactId, input.roleFactId].map(fact), source: { ...SACRED_RITES_SOURCE } }), p: SacredRitesProject = { start, segments: [] }; priest(p); (toolkitState().sacredRites ??= { version: 1, projects: [] }).projects.push(p); return summary(p); }
export function workSacredRites(raw: unknown) { const input = WorkSacredRitesSchema.parse(raw), old = replay(input); if (old)
    return old; ready(); const p = projects().find(p => p.start.input.projectId === input.projectId); if (!p || p.benefit || p.abandonment)
    toolkitError('SACRED_RITES_UNFINISHED_PROJECT_REQUIRED', 'Choose the actual unfinished rite cycle.'); readSacredRitesSource(); atSite(p.start.site); priest(p); p.start.facts.forEach(f => { if (sacredRitesWitness(fact(String(f.id))) !== sacredRitesWitness(f))
    toolkitError('SACRED_RITES_FACT_CHANGED', 'Retain the original actual temple, devotion, access and role qualifications.'); }); const from = now(), to = from + 28800, day = Math.floor(from / 86400); if (to > (day + 1) * 86400 || p.segments.some(s => s.day === day))
    toolkitError('SACRED_RITES_DISTINCT_WORKDAY_REQUIRED', 'Choose one distinct real date with eight continuous hours remaining.'); const issue = downtimeIntervalIssue(gs.getState(), from, 28800, true); if (issue)
    toolkitError('DOWNTIME_SHARED_DAY_REQUIRED', issue); const physical = breathingActivityIssue(gs.getState(), 'player', 28800) ?? groundGearRecoveryActivityIssue(gs.getState(), 28800); if (physical)
    toolkitError(physical.code, physical.message); if (Object.values(gs.getState().dmTools?.afflictions?.records ?? {}).some(r => r.targetId === 'player' && AFFLICTIONS[r.templateId].kind === 'poison' && ['active', 'pending'].includes(r.status) && !r.petrificationPause && r.nextAt !== undefined && r.nextAt < to))
    toolkitError('SACRED_RITES_AFFLICTION_BOUNDARY', 'Resolve the actual earlier poison event before this uninterrupted rite date.'); assertGameTimeAdvance(28800); const segment = stamp({ input, from, to, day }); advanceHeroTime(28800); p.segments.push(segment); if (p.segments.length === 10) {
    const roll = rollDice('2d6'), fromDay = day + 1;
    p.benefit = { ...stamp({roll: roll as unknown as Record<string, unknown>, fromDay, lastDay: fromDay + roll.total - 1,at:to,workEventId:input.eventId}), awards: [] };
    reconcileSacredRiteAwards();
} return { ...summary(p), seconds: 28800 }; }
export function abandonSacredRites(raw: unknown) { const input = AbandonSacredRitesSchema.parse(raw), old = replay(input); if (old)
    return old; ready(); const p = projects().find(p => p.start.input.projectId === input.projectId); if (!p || p.benefit || p.abandonment)
    toolkitError('SACRED_RITES_UNFINISHED_PROJECT_REQUIRED', 'Only an actual unfinished cycle can be abandoned; past effort and awarded Inspiration remain.'); p.abandonment = stamp({ input, at: now() }); return summary(p); }
export function inspectSacredRites() { return { readOnly: true, source: SACRED_RITES_SOURCE, state: gs.getState().dmTools?.sacredRites ?? null, limitation: 'Actual player temple-priest or lay assistance; no sacrifice producer, faith/class inference, XGE service credit, practice ban or retroactive award.' }; }
