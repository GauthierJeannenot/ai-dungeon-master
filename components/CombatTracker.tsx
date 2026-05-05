'use client'

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
  if (gameState.phase !== 'combat') return null

  const { initiativeOrder, currentTurn, round, player, monsters } = gameState

  function getEntityName(id: string): string {
    if (id === 'player') return player.name
    return monsters[id]?.name ?? id
  }

  function getEntityHP(id: string): { current: number; max: number } | null {
    if (id === 'player') return player.hp
    return monsters[id]?.hp ?? null
  }

  function isAlive(id: string): boolean {
    if (id === 'player') return player.hp.current > 0
    return monsters[id]?.isAlive ?? false
  }

  return (
    <div className="bg-stone-900/80 border border-red-900/50 rounded-lg p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-red-400 font-bold text-sm uppercase tracking-wider">Combat</span>
        </div>
        <span className="text-stone-400 text-xs font-mono">Round {round}</span>
      </div>

      {/* Player HP prominently */}
      <div className="bg-stone-800/60 rounded p-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-blue-400 font-semibold text-sm">{player.name}</span>
          <span className="text-stone-500 text-xs">CA {player.ac}</span>
        </div>
        <HPBar current={player.hp.current} max={player.hp.max} />
      </div>

      {/* Initiative order */}
      <div className="space-y-1">
        <div className="text-stone-500 text-xs uppercase tracking-wider mb-1">Initiative</div>
        {initiativeOrder.map((id, idx) => {
          const alive = isAlive(id)
          const isCurrent = id === currentTurn
          const hp = getEntityHP(id)
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
    </div>
  )
}
