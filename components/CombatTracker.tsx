'use client'

import { useState } from 'react'
import { GameState } from '@/lib/types'

interface CombatTrackerProps {
  gameState: GameState
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

export default function CombatTracker({ gameState }: CombatTrackerProps) {
  // Le panneau de combat est repliable : replié, il libère de la place verticale
  // pour le journal de l'aventure tout en gardant les PV et le tour courant visibles.
  const [expanded, setExpanded] = useState(true)

  if (gameState.phase !== 'combat') return null

  const { initiativeOrder, currentTurn, round, player, monsters } = gameState
  const playerMovementMax = Math.floor(player.speed / 5)
  const playerMovementUsed = gameState.movementUsed.player ?? 0
  const playerMovementLeft = Math.max(0, playerMovementMax - playerMovementUsed)
  const playerActionUsed = Boolean(gameState.actionUsed.player)
  const isPlayerTurn = currentTurn === 'player'

  function getEntityName(id: string): string {
    if (id === 'player') return player.name
    return monsters[id]?.name ?? id
  }

  function isAlive(id: string): boolean {
    if (id === 'player') return player.hp.current > 0
    return monsters[id]?.isAlive ?? false
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
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
          <span className="text-red-400 font-bold text-sm uppercase tracking-wider flex-shrink-0">Combat</span>
          <span className="text-stone-500 text-xs font-mono flex-shrink-0">Round {round}</span>
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
                  · {isPlayerTurn ? 'À toi de jouer' : currentName}
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
          </div>

          {isPlayerTurn && (
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
            <div className="text-stone-500 text-xs uppercase tracking-wider mb-1">Initiative</div>
            {initiativeOrder.map((id, idx) => {
              const alive = isAlive(id)
              const isCurrent = id === currentTurn
              const isPlayer = id === 'player'

              return (
                <div
                  key={id}
                  className={`flex items-center gap-2 p-1.5 rounded transition-colors ${
                    isCurrent
                      ? 'bg-amber-900/40 border border-amber-700/50'
                      : 'bg-stone-800/30'
                  } ${!alive ? 'opacity-30' : ''}`}
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
                      {!alive && (
                        <span className="text-stone-500 text-[10px] flex-shrink-0">✗ mort</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
