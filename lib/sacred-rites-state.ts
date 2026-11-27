import { z } from 'zod';
import type { GameState } from './types';
import { sharedDowntimeIntervalIssues } from './downtime-ledger';
export const SACRED_RITES_SOURCE = { book: 'dmg-2014', sha256: 'fa75462a6ef96ef0f86fbfd2d433c624ce926ff630a43d1fcaea6a2c1249b0d1', startLine: 5217, endLine: 5223 } as const;
const Id = z.string().min(1).max(60).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/).refine(id => !['__proto__', 'constructor', 'prototype'].includes(id)), Text = z.string().trim().min(1).max(800), Value = z.record(z.string(), z.unknown()), Time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const StartSacredRitesSchema = z.object({ eventId: Id, projectId: Id.refine(id => id.length <= 40), deityName: z.string().trim().min(1).max(120), templeFactId: Id, devotionFactId: Id, accessFactId: Id, roleFactId: Id, role: z.enum(['temple_priest', 'lay_assistant']), priestId: Id.optional(), actualPiousCharacterConfirmed: z.literal(true), actualTempleAffiliatedWithReveredGodConfirmed: z.literal(true), actualAccessAndRoleConfirmed: z.literal(true) }).strict();
export const WorkSacredRitesSchema = z.object({ eventId: Id, projectId: Id, activitySource: Text }).strict();
export const AbandonSacredRitesSchema = z.object({ eventId: Id, projectId: Id, reason: Text }).strict();
const Site = z.object({ mapId: Id, roomId: Id, cell: z.object({ x: z.number().int(), y: z.number().int() }).strict(), zFeet: z.number().finite() }).strict();
const Source = z.object({ book: z.literal('dmg-2014'), sha256: z.string(), startLine: z.literal(5217), endLine: z.literal(5223) }).strict();
const Start = z.object({ input: StartSacredRitesSchema, at: Time, site: Site, facts: z.array(Value).length(4), source: Source, command: z.string() }).strict();
const Segment = z.object({ input: WorkSacredRitesSchema, from: Time, to: Time, day: z.number().int().nonnegative(), command: z.string() }).strict();
const Award = z.object({ day: z.number().int().nonnegative(), at: Time, eventId: Id, reason: z.string().min(1).max(300), outcome: z.enum(['granted', 'capped']), command: z.string() }).strict();
const Benefit = z.object({ roll: Value, fromDay: z.number().int().nonnegative(), lastDay: z.number().int().nonnegative(), at:Time,workEventId:Id,command:z.string(),awards: z.array(Award).max(12) }).strict();
export const SacredRitesStateSchema = z.object({ version: z.literal(1), projects: z.array(z.object({ start: Start, segments: z.array(Segment).max(10), benefit: Benefit.optional(), abandonment: z.object({ input: AbandonSacredRitesSchema, at: Time, command: z.string() }).strict().optional() }).strict()).max(16) }).strict();
export type SacredRitesProject = z.infer<typeof SacredRitesStateSchema>['projects'][number];
export const sacredRitesWitness = (value: unknown): string => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export const sacredRiteGrantId = (projectId: string, day: number) => `sacred:${projectId}:${day}`;
export const sacredRiteGrantReason = (projectId: string, day: number) => `DMG2014 sacred rites: actual beginning of engine date ${day}, completed project ${projectId}.`;
export function sacredRiteDueAwards(state: GameState, until: number) {
    return (state.dmTools?.sacredRites?.projects ?? []).flatMap(project => project.benefit && project.benefit.lastDay - project.benefit.fromDay >= 1 && project.benefit.lastDay - project.benefit.fromDay <= 11 ? Array.from({ length: project.benefit.lastDay - project.benefit.fromDay + 1 }, (_, i) => project.benefit!.fromDay + i).filter(day => day * 86400 <= until && !project.benefit!.awards.some(a => a.day === day)).map(day => ({ project, day, at: day * 86400 })) : []).sort((a, b) => a.at - b.at || a.project.start.input.projectId.localeCompare(b.project.start.input.projectId));
}
export function validateSacredRitesState(state: GameState) {
    const data = state.dmTools?.sacredRites;
    if (!data)
        return [];
    if (!SacredRitesStateSchema.safeParse(data).success)
        return ['Invalid original sacred-rites projects or dated Inspiration awards.'];
    const issues: string[] = [], ids = new Set<string>(), projectIds = new Set<string>(), clock = state.worldTimeSeconds ?? 0;
    const event = (input: {
        eventId: string;
    }, body: Record<string, unknown>, command: string) => { if (ids.has(input.eventId) || sacredRitesWitness(body) !== command)
        issues.push('Every rite command has one original unique event and immutable witness.'); ids.add(input.eventId); };
    for (const p of data.projects) {
        const s = p.start, { command, ...startBody } = s;
        event(s.input, startBody, command);
        if (projectIds.has(s.input.projectId) || s.at > clock || sacredRitesWitness(s.source) !== sacredRitesWitness(SACRED_RITES_SOURCE))
            issues.push('A real sacred-rites project retains its exact source and creation time.');
        projectIds.add(s.input.projectId);
        if (data.projects.slice(0, data.projects.indexOf(p)).some(other => other.benefit && other.benefit.lastDay * 86400 > s.at))
            issues.push('This bounded source cycle cannot replace or overlap earlier future benefit date beginnings.');
        if (new Set([s.input.templeFactId, s.input.devotionFactId, s.input.accessFactId, s.input.roleFactId]).size !== 4 || s.facts.some((f, i) => f.id !== [s.input.templeFactId, s.input.devotionFactId, s.input.accessFactId, s.input.roleFactId][i] || f.expires !== 'never' || f.source !== 'record_scene_fact' || f.mapId !== s.site.mapId || f.roomId !== s.site.roomId))
            issues.push('Keep the four original actual local temple, devotion, access and role facts, without inferred class or faith.');
        if (s.input.role === 'lay_assistant' ? !s.input.priestId : s.input.priestId !== undefined)
            issues.push('Only actual lay assistance selects its real existing priest.');
        let previous = s.at;
        const days = new Set<number>();
        for (const segment of p.segments) {
            const { command, ...body } = segment;
            event(segment.input, body, command);
            if (segment.input.projectId !== s.input.projectId || segment.to - segment.from !== 28800 || segment.from < previous || segment.to > clock || segment.day !== Math.floor(segment.from / 86400) || segment.to > (segment.day + 1) * 86400 || days.has(segment.day))
                issues.push('Rites require ten distinct actual eight-hour dates, without overlap, backdating or overnight credit.');
            previous = segment.to;
            days.add(segment.day);
        }
        if (Boolean(p.benefit) !== (p.segments.length === 10) || p.benefit && p.abandonment)
            issues.push('Only the tenth actual worked date creates its original bounded benefit.');
        if (p.benefit) {
            const b = p.benefit, roll = b.roll, rolls = roll.rolls as number[] | undefined, first = p.segments.at(-1)!.day + 1;
            const {awards,command,...originalBenefit}=b
            if(command!==sacredRitesWitness(originalBenefit)||b.at!==p.segments.at(-1)!.to||b.workEventId!==p.segments.at(-1)!.input.eventId)issues.push('The duration remains the exact original consequence of the tenth actual effort, not a revised roll or calendar renewal.')
            if (roll.notation !== '2d6' || roll.modifier !== 0 || !Array.isArray(rolls) || rolls.length !== 2 || rolls.some(d => !Number.isInteger(d) || d < 1 || d > 6) || roll.total !== rolls.reduce((n, d) => n + d, 0) || b.fromDay !== first || b.lastDay !== first + Number(roll.total) - 1)
                issues.push('The ten-date benefit keeps its one actual original 2d6 duration and following calendar boundaries.');
            if (new Set(b.awards.map(a => a.day)).size !== b.awards.length)
                issues.push('One original award only at each actual source beginning of day.');
            for (const a of b.awards) {
                const { command, ...receipt } = a;
                if (a.day < b.fromDay || a.day > b.lastDay || a.at !== a.day * 86400 || a.at > clock || a.eventId !== sacredRiteGrantId(s.input.projectId, a.day) || a.reason !== sacredRiteGrantReason(s.input.projectId, a.day) || command !== sacredRitesWitness(receipt))
                    issues.push('Daily rite awards retain their original dated source receipt and actual one-token acquisition outcome, including capped awards.');
            }
        }
        if (p.abandonment) {
            const { command, ...body } = p.abandonment;
            event(p.abandonment.input, body, command);
            if (p.abandonment.input.projectId !== s.input.projectId || p.abandonment.at < previous || p.abandonment.at > clock)
                issues.push('Abandonment preserves past effort and creates no inspiration.');
        }
    }
    if (data.projects.filter(p => !p.benefit && !p.abandonment).length > 1 || sacredRiteDueAwards(state, clock).length)
        issues.push('One unfinished project and all actual past day boundaries must remain represented; no retroactive catch-up from altered SQL.');
    return [...issues, ...sharedDowntimeIntervalIssues(state)];
}
