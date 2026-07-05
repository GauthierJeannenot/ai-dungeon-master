'use client'

import type { CharacterSheetData } from '@/lib/character-sheet-view'
import { formatModifier } from '@/lib/character-sheet-view'

// Fiche de personnage présentielle, alimentée par un CharacterSheetData
// normalisé (voir lib/character-sheet-view.ts). PARTAGÉE :
//  - variant "full"    → modale en jeu (état live : PV courants, emplacements…)
//  - variant "compact" → popover d'aperçu au survol sur la landing (catalogue).
// Aucun vocabulaire de module ici (composant global, verrouillé no-module-leaks).

const ITEM_TYPE_STYLES: Record<string, { icon: string; ring: string }> = {
  weapon: { icon: '⚔', ring: 'border-rose-800/50 bg-rose-950/20' },
  armor: { icon: '🛡', ring: 'border-sky-800/50 bg-sky-950/20' },
  potion: { icon: '⚗', ring: 'border-emerald-800/50 bg-emerald-950/20' },
  misc: { icon: '◆', ring: 'border-stone-700 bg-stone-800/40' },
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[10px] uppercase tracking-wider text-amber-500/80 font-semibold">{title}</h4>
      {children}
    </section>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded bg-stone-800/70 border border-stone-700 text-stone-200 text-[11px]">
      {children}
    </span>
  )
}

export default function CharacterSheet({
  data,
  variant = 'full',
}: {
  data: CharacterSheetData
  variant?: 'full' | 'compact'
}) {
  const compact = variant === 'compact'
  const gap = compact ? 'gap-3' : 'gap-4'

  return (
    <div className={`flex flex-col ${gap} text-stone-200`}>
      {/* En-tête : identité + PV / CA / vitesse / maîtrise */}
      <header className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className={`font-bold text-amber-300 ${compact ? 'text-base' : 'text-xl'}`}>{data.name}</h3>
          <span className="text-xs text-stone-400">
            {data.className}
            {data.level !== null ? ` · niv. ${data.level}` : ''}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 text-center">
          <div className="rounded border border-stone-700 bg-stone-800/50 py-1">
            <div className="text-[9px] uppercase tracking-wider text-stone-500">PV</div>
            <div className="font-mono text-sm text-stone-100">
              {data.hp.current !== null ? `${data.hp.current}/${data.hp.max}` : data.hp.max}
            </div>
          </div>
          <div className="rounded border border-stone-700 bg-stone-800/50 py-1">
            <div className="text-[9px] uppercase tracking-wider text-stone-500">CA</div>
            <div className="font-mono text-sm text-stone-100">{data.ac}</div>
          </div>
          <div className="rounded border border-stone-700 bg-stone-800/50 py-1">
            <div className="text-[9px] uppercase tracking-wider text-stone-500">Vitesse</div>
            <div className="font-mono text-sm text-stone-100">{data.speed}</div>
          </div>
          <div className="rounded border border-stone-700 bg-stone-800/50 py-1">
            <div className="text-[9px] uppercase tracking-wider text-stone-500">Maîtrise</div>
            <div className="font-mono text-sm text-stone-100">{formatModifier(data.proficiencyBonus)}</div>
          </div>
        </div>
      </header>

      {/* Conditions actives (jeu uniquement) */}
      {data.conditions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.conditions.map(c => (
            <span key={c} className="px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-200 text-[10px]">
              {c}
            </span>
          ))}
        </div>
      )}

      {/* Caractéristiques */}
      <Section title="Caractéristiques">
        <div className="grid grid-cols-6 gap-1.5">
          {data.abilities.map(ability => (
            <div key={ability.key} className="rounded border border-stone-700 bg-stone-800/40 py-1.5 text-center">
              <div className="text-[9px] uppercase tracking-wider text-stone-500">{ability.label}</div>
              <div className="font-mono text-sm text-stone-100">{ability.score}</div>
              <div className="font-mono text-[11px] text-amber-300/90">{formatModifier(ability.modifier)}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Jets de sauvegarde */}
      {data.savingThrows.length > 0 && (
        <Section title="Jets de sauvegarde">
          <div className="flex flex-wrap gap-1">
            {data.savingThrows.map(save => (
              <Pill key={save.key}>{save.label}</Pill>
            ))}
          </div>
        </Section>
      )}

      {/* Compétences maîtrisées */}
      {data.skills.length > 0 && (
        <Section title="Compétences">
          <div className="flex flex-wrap gap-1">
            {data.skills.map(skill => (
              <Pill key={skill.label}>
                {skill.label}
                {skill.expertise && <span className="ml-1 text-amber-400" title="Expertise (double maîtrise)">★</span>}
              </Pill>
            ))}
          </div>
        </Section>
      )}

      {/* Capacités de classe */}
      {data.features.length > 0 && (
        <Section title="Capacités">
          <div className="flex flex-wrap gap-1">
            {data.features.map(feature => (
              <Pill key={feature}>{feature}</Pill>
            ))}
          </div>
        </Section>
      )}

      {/* Ressources rechargeables */}
      {data.resources.length > 0 && (
        <Section title="Ressources">
          <div className="flex flex-wrap gap-1.5">
            {data.resources.map(res => (
              <span
                key={res.label}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-stone-800/70 border border-stone-700 text-[11px]"
              >
                <span className="text-stone-300">{res.label}</span>
                <span className="font-mono text-amber-300">{res.current}/{res.max}</span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Sorts */}
      {data.spellcasting && (
        <Section title={`Sorts (${data.spellcasting.abilityLabel})`}>
          <div className="space-y-1.5">
            {data.spellcasting.cantrips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-stone-500 mr-0.5">Tours&nbsp;:</span>
                {data.spellcasting.cantrips.map(spell => (
                  <Pill key={spell}>{spell}</Pill>
                ))}
              </div>
            )}
            {data.spellcasting.spells.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-stone-500 mr-0.5">
                  Niv.&nbsp;1
                  {data.spellcasting.slots && (
                    <span className="ml-1 font-mono text-amber-300">
                      (
                      {data.spellcasting.slots.current !== null
                        ? `${data.spellcasting.slots.current}/${data.spellcasting.slots.max}`
                        : `${data.spellcasting.slots.max}`}{' '}
                      empl.)
                    </span>
                  )}
                  &nbsp;:
                </span>
                {data.spellcasting.spells.map(spell => (
                  <Pill key={spell}>{spell}</Pill>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Équipement */}
      {data.inventory.length > 0 && (
        <Section title="Équipement">
          <ul className="space-y-1">
            {data.inventory.map(item => {
              const style = ITEM_TYPE_STYLES[item.type] ?? ITEM_TYPE_STYLES.misc
              return (
                <li
                  key={item.id}
                  className={`flex items-center gap-2 rounded border px-2 py-1 ${style.ring}`}
                >
                  <span className="text-sm leading-none">{style.icon}</span>
                  <span className="text-[12px] text-stone-100 font-medium">{item.name}</span>
                  {item.damage && <span className="font-mono text-[10px] text-rose-300">{item.damage}</span>}
                  {item.acBonus ? <span className="font-mono text-[10px] text-sky-300">CA +{item.acBonus}</span> : null}
                  {!compact && item.description && (
                    <span className="ml-auto text-[10px] text-stone-500 truncate max-w-[55%] text-right">
                      {item.description}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </Section>
      )}
    </div>
  )
}
