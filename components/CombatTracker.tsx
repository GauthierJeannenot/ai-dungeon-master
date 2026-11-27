'use client'

import { useState } from 'react'
import { GameState } from '@/lib/types'
import { complexTrapSlot } from '@/lib/complex-trap-initiative'
import { combatParticipants } from '@/lib/combat-participants'
import { combatAttackOptions } from '@/lib/combat-attack-options'

interface CombatTrackerProps {
  gameState: GameState
  onAttack?: (message: string) => void
  disabled?: boolean
}

function HPBar({ current, max }: { current: number; max: number }) {
  const ratio = current / max
  const color = ratio > 0.6 ? 'bg-green-500' : ratio > 0.3 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-stone-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.max(0, ratio * 100)}%` }}
        />
      </div>
      <span className="text-xs font-mono text-stone-300 min-w-[3rem] text-right">
        {current}/{max}
      </span>
    </div>
  )
}

export default function CombatTracker({ gameState, onAttack, disabled = false }: CombatTrackerProps) {
  // Le panneau de combat est repliable : replié, il libère de la place verticale
  // pour le journal de l'aventure tout en gardant les PV et le tour courant visibles.
  const [expanded, setExpanded] = useState(true)
  const [attackTarget, setAttackTarget] = useState<string | null>(null)

  if (gameState.phase !== 'combat') return null

  const { round, player, monsters } = gameState
  const { active, defeated, currentTurn, hostileCount, playerStatus } = combatParticipants(gameState)
  const playerMovementMax = Math.floor(player.speed / 5)
  const playerMovementUsed = gameState.movementUsed.player ?? 0
  const playerMovementLeft = Math.max(0, playerMovementMax - playerMovementUsed)
  const playerActionUsed = Boolean(gameState.actionUsed.player)
  const isPlayerTurn = currentTurn === 'player'

  function getEntityName(id: string): string {
    if (id === 'player') return player.name
    const hazard=complexTrapSlot(gameState,id)
    return hazard ? `Piège complexe · initiative ${hazard.count}` : monsters[id]?.name ?? id
  }

  const currentName = currentTurn ? getEntityName(currentTurn) : null
  const playerHpLow = player.hp.current < player.hp.max * 0.3

  return (
    <div className="bg-stone-900/80 border border-red-900/50 rounded-lg p-3 space-y-3">
      {/* En-tête repliable */}
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 text-left cursor-pointer"
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
          <span className="text-red-400 font-bold text-sm uppercase tracking-wider flex-shrink-0">Combat</span>
          <span className="text-stone-500 text-xs font-mono flex-shrink-0">Round {round}</span>
          <span className="text-stone-400 text-xs">{hostileCount} adversaire{hostileCount > 1 ? 's' : ''}</span>
        </span>
        <span className="flex items-center gap-2 min-w-0">
          {!expanded && (
            <span className="flex items-center gap-1.5 text-xs truncate">
              <span className="font-mono text-stone-400">
                <span className={playerHpLow ? 'text-red-400' : 'text-stone-300'}>{player.hp.current}</span>
                /{player.hp.max} PV
              </span>
              {currentName && (
                <span className={`truncate ${isPlayerTurn ? 'text-amber-300' : 'text-stone-500'}`}>
                  · {isPlayerTurn ? playerStatus ?? 'À toi de jouer' : currentName}
                </span>
              )}
            </span>
          )}
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className={`w-4 h-4 flex-shrink-0 text-stone-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          >
            <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </span>
      </button>

      {expanded && (
        <>
          {/* Player HP prominently */}
          <div className="bg-stone-800/60 rounded p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-blue-400 font-semibold text-sm">{player.name}</span>
              <span className="text-stone-500 text-xs">CA {player.ac}</span>
            </div>
            <HPBar current={player.hp.current} max={player.hp.max} />
            {playerStatus && <div className="text-amber-300 text-xs mt-1">{playerStatus}</div>}
          </div>

          {isPlayerTurn && !playerStatus && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className={`rounded border px-2 py-1.5 ${
                playerActionUsed
                  ? 'border-stone-700 bg-stone-800/40 text-stone-400'
                  : 'border-amber-700/50 bg-amber-950/30 text-amber-200'
              }`}>
                <div className="text-[10px] uppercase tracking-wider text-stone-500">Action</div>
                <div className="font-semibold">{playerActionUsed ? 'Utilisee' : 'Disponible'}</div>
              </div>
              <div className="rounded border border-blue-800/40 bg-blue-950/20 px-2 py-1.5 text-blue-100">
                <div className="text-[10px] uppercase tracking-wider text-stone-500">Mouvement</div>
                <div className="font-semibold">{playerMovementLeft}/{playerMovementMax} cases</div>
              </div>
            </div>
          )}

          {/* Initiative order */}
          <div className="space-y-1">
            <div className="text-stone-500 text-xs uppercase tracking-wider mb-1">Initiative · actifs</div>
            {active.map((id, idx) => {
              const isCurrent = id === currentTurn
              const isPlayer = id === 'player'
              const attackOptions = onAttack ? combatAttackOptions(gameState, id) : []
              const canAttack = attackOptions.some(option => !option.disabledReason)
              const attackOpen = attackTarget === id
              const attackPanelId = `attack-options-${id}`

              return (
                <div
                  key={id}
                  className={`flex flex-wrap items-center gap-2 p-1.5 rounded transition-colors ${
                    isCurrent
                      ? 'bg-amber-900/40 border border-amber-700/50'
                      : 'bg-stone-800/30'
                  }`}
                >
                  {/* Turn indicator */}
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    isPlayer ? 'bg-blue-700 text-blue-100' : 'bg-red-800 text-red-100'
                  }`}>
                    {idx + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-xs font-medium truncate ${
                        isCurrent ? 'text-amber-300' : isPlayer ? 'text-blue-300' : 'text-red-300'
                      }`}>
                        {getEntityName(id)}
                      </span>
                      {isCurrent && (
                        <span className="text-amber-400 text-[10px] flex-shrink-0">← TOUR</span>
                      )}
                    </div>
                    {attackOptions.length > 0 && !canAttack && (
                      <p className="text-[10px] text-stone-400">{attackOptions[0].disabledReason}</p>
                    )}
                  </div>
                  {attackOptions.length > 0 && (
                    <>
                      <button
                        type="button"
                        aria-label={`Attaquer ${getEntityName(id)}`}
                        aria-expanded={attackOpen}
                        aria-controls={attackPanelId}
                        disabled={disabled || (!canAttack && !attackOpen)}
                        title={disabled ? 'Action indisponible pendant le traitement du tour' : canAttack ? 'Choisir une arme ou un sort' : attackOptions[0].disabledReason ?? undefined}
                        onClick={() => setAttackTarget(attackOpen ? null : id)}
                        className="min-h-9 rounded border border-red-700/60 bg-red-950/60 px-2 text-xs font-semibold text-red-100 hover:bg-red-900/60 focus-visible:outline-2 focus-visible:outline-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Attaquer
                      </button>
                      {attackOpen && (
                        <div id={attackPanelId} className="w-full space-y-1 border-t border-stone-700 pt-2">
                          <p className="text-[11px] text-stone-400">Choisis ton attaque. Portée sur la carte ; le MJ vérifie les obstacles et les règles.</p>
                          <div className="max-h-48 space-y-1 overflow-y-auto">
                            {attackOptions.map(option => (
                              <button key={option.id} type="button"
                                disabled={disabled || Boolean(option.disabledReason)}
                                onClick={() => {
                                  if (disabled || option.disabledReason) return
                                  setAttackTarget(null)
                                  onAttack?.(option.message)
                                }}
                                className="block min-h-10 w-full rounded border border-stone-700 bg-stone-900 px-2 py-1.5 text-left text-xs text-amber-100 hover:border-amber-700 focus-visible:outline-2 focus-visible:outline-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <span className="block font-medium">{option.label}</span>
                                <span className="block text-[11px] text-stone-400">{option.disabledReason ?? option.detail}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
          {defeated.length > 0 && (
            <details className="text-xs text-stone-500 border-t border-stone-800 pt-2">
              <summary className="cursor-pointer">Vaincus ({defeated.length})</summary>
              <ul className="mt-1 space-y-1">
                {defeated.map(id => <li key={id}>{getEntityName(id)} · {id === 'player' ? 'mort' : 'vaincu'}</li>)}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}
