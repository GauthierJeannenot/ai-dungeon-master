'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { GameState, MonsterState, PlayerState, WorldNpcDisposition } from '@/lib/types'

interface BattlemapProps {
  gameState: GameState
  cellSize?: number
  // Battlemap du module actif (toujours fournie par la page de jeu depuis la
  // définition du module) ; dimensions de grille par défaut 17×15.
  image: string
  cols?: number
  rows?: number
}

interface TooltipState {
  entity: PlayerState | MonsterState | MapNpcToken
  x: number
  y: number
}

interface MapNpcToken {
  id: string
  name: string
  disposition: WorldNpcDisposition
  kind?: string
  roomId: string | null
  position: { x: number; y: number }
}

function getHPColor(current: number, max: number): string {
  const ratio = current / max
  if (ratio > 0.6) return '#22c55e'   // green
  if (ratio > 0.3) return '#f59e0b'   // amber
  return '#ef4444'                     // red
}

function getHPDescription(current: number, max: number): string {
  const ratio = current / max
  if (ratio > 0.75) return 'Vigoureux'
  if (ratio > 0.5) return 'Légèrement blessé'
  if (ratio > 0.25) return 'Sérieusement blessé'
  return 'À l\'agonie'
}

function hpPercent(current: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(100, Math.max(0, (current / max) * 100))
}

export default function Battlemap({
  gameState,
  cellSize = 48,
  image,
  cols = 17,
  rows = 15,
}: BattlemapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [prevPositions, setPrevPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [animating, setAnimating] = useState<Set<string>>(new Set())

  // Track position changes for animation
  useEffect(() => {
    const newPositions: Record<string, { x: number; y: number }> = {
      player: gameState.player.position,
    }
    Object.entries(gameState.monsters).forEach(([id, m]) => {
      newPositions[id] = m.position
    })
    const npcTokens = deriveNpcTokens(gameState)
    npcTokens.forEach(npc => {
      newPositions[`npc:${npc.id}`] = npc.position
    })

    const newAnimating = new Set<string>()
    Object.entries(newPositions).forEach(([id, pos]) => {
      const prev = prevPositions[id]
      if (prev && (prev.x !== pos.x || prev.y !== pos.y)) {
        newAnimating.add(id)
      }
    })

    if (newAnimating.size > 0) {
      setAnimating(newAnimating)
      setTimeout(() => setAnimating(new Set()), 400)
    }

    setPrevPositions(newPositions)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.player.position, gameState.monsters, gameState.npcs, gameState.currentRoomId])

  const handleTokenClick = useCallback((
    e: React.MouseEvent,
    entity: PlayerState | MonsterState | MapNpcToken
  ) => {
    e.stopPropagation()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltip({
      entity,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }, [])

  const aliveMonsters = Object.values(gameState.monsters).filter(m => m.isAlive)
  const npcTokens = deriveNpcTokens(gameState)

  // Taille de la carte : dimensions du module actif (défaut 17×15).
  const gridCols = Math.max(cols, ...aliveMonsters.map(m => m.position.x + 2), ...npcTokens.map(npc => npc.position.x + 2), gameState.player.position.x + 2)
  const gridRows = Math.max(rows, ...aliveMonsters.map(m => m.position.y + 2), ...npcTokens.map(npc => npc.position.y + 2), gameState.player.position.y + 2)

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-auto bg-stone-900 rounded-lg border border-amber-900/40 cursor-default"
      onClick={() => setTooltip(null)}
    >
      {/* Zone scrollable — toujours aux dimensions complètes de la carte */}
      <div
        className="relative"
        style={{
          width: gridCols * cellSize,
          height: gridRows * cellSize,
        }}
      >
        {/* Image de la battlemap — pixel art généré (17×15 cases exactes, voir
            scripts/generate-battlemap.cjs). backgroundSize 100% garde chaque case
            image alignée sur chaque case de la grille ; imageRendering pixelated
            préserve les pixels nets à l'agrandissement. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${image})`,
            backgroundSize: '100% 100%',   // étire l'image pour couvrir toute la grille
            backgroundRepeat: 'no-repeat',
            backgroundColor: '#3a2d1a',    // fallback si image absente
            imageRendering: 'pixelated',
          }}
        />

        {/* Grid overlay — léger, non-intrusif */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={gridCols * cellSize}
          height={gridRows * cellSize}
        >
          <defs>
            <pattern id="grid" width={cellSize} height={cellSize} patternUnits="userSpaceOnUse">
              <path
                d={`M ${cellSize} 0 L 0 0 0 ${cellSize}`}
                fill="none"
                stroke="rgba(180,140,60,0.2)"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Monster tokens */}
        {aliveMonsters.map(monster => (
          <TokenMonster
            key={monster.id}
            monster={monster}
            cellSize={cellSize}
            isCurrentTurn={gameState.currentTurn === monster.id}
            isAnimating={animating.has(monster.id)}
            onClick={(e) => handleTokenClick(e, monster)}
          />
        ))}

        {/* NPC tokens */}
        {npcTokens.map(npc => (
          <TokenNpc
            key={npc.id}
            npc={npc}
            cellSize={cellSize}
            isAnimating={animating.has(`npc:${npc.id}`)}
            onClick={(e) => handleTokenClick(e, npc)}
          />
        ))}

        {/* Player token */}
        <TokenPlayer
          player={gameState.player}
          cellSize={cellSize}
          isCurrentTurn={gameState.currentTurn === 'player' || gameState.phase !== 'combat'}
          isAnimating={animating.has('player')}
          onClick={(e) => handleTokenClick(e, gameState.player)}
        />

        {/* Tooltip */}
        {tooltip && (
          <EntityTooltip
            entity={tooltip.entity}
            x={tooltip.x}
            y={tooltip.y}
          />
        )}
      </div>
    </div>
  )
}

function deriveNpcTokens(gameState: GameState): MapNpcToken[] {
  if (!gameState.npcs) return []

  const currentRoomId = gameState.currentRoomId
  // PNJ devenus combattants : on évite le doublon token PNJ + token monstre.
  const occupiedMonsterNames = new Set(
    Object.values(gameState.monsters)
      .filter(monster => monster.isAlive)
      .map(monster => monster.name.toLowerCase())
  )

  return Object.values(gameState.npcs)
    .filter(npc => npc.visible)
    .filter(npc => npc.roomId === null || npc.roomId === currentRoomId)
    .filter(npc => !occupiedMonsterNames.has(npc.name.toLowerCase()))
    .map(npc => ({
      id: npc.id,
      name: npc.name,
      disposition: npc.disposition,
      kind: npc.kind,
      roomId: npc.roomId,
      position: { x: npc.position.x, y: npc.position.y },
    }))
}

function npcTokenStyle(disposition: WorldNpcDisposition): { background: string; shadow: string; ring: string; label: string } {
  if (disposition === 'helpful') {
    return {
      background: 'radial-gradient(circle at 35% 35%, #86efac, #15803d)',
      shadow: 'shadow-green-900/60',
      ring: 'ring-emerald-300',
      label: 'Allie',
    }
  }
  if (disposition === 'hostile') {
    return {
      background: 'radial-gradient(circle at 35% 35%, #fb7185, #9f1239)',
      shadow: 'shadow-rose-900/60',
      ring: 'ring-rose-300',
      label: 'Hostile',
    }
  }
  return {
    background: 'radial-gradient(circle at 35% 35%, #d1d5db, #4b5563)',
    shadow: 'shadow-stone-900/60',
    ring: 'ring-stone-300',
    label: disposition === 'wary' ? 'Mefiant' : disposition === 'offended' ? 'Froisse' : 'Neutre',
  }
}

function TokenPlayer({
  player, cellSize, isCurrentTurn, isAnimating, onClick
}: {
  player: PlayerState
  cellSize: number
  isCurrentTurn: boolean
  isAnimating: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  const px = player.position.x * cellSize + cellSize / 2
  const py = player.position.y * cellSize + cellSize / 2
  const r = cellSize * 0.38

  return (
    <div
      className="absolute pointer-events-auto cursor-pointer"
      style={{
        left: px - r,
        top: py - r,
        width: r * 2,
        height: r * 2,
        transition: isAnimating ? 'left 0.4s ease, top 0.4s ease' : undefined,
      }}
      onClick={onClick}
    >
      <div className={`relative w-full h-full rounded-full flex items-center justify-center font-bold text-white select-none
        ${isCurrentTurn ? 'ring-2 ring-yellow-300 ring-offset-1 ring-offset-transparent' : ''}
        shadow-lg shadow-blue-900/60`}
        style={{ background: 'radial-gradient(circle at 35% 35%, #60a5fa, #1d4ed8)' }}
      >
        <span style={{ fontSize: cellSize * 0.3 }}>
          {player.name.slice(0, 2).toUpperCase()}
        </span>
        {isCurrentTurn && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
        )}
      </div>

      {/* HP bar under player token */}
      <div className="absolute -bottom-2 left-0 right-0 h-1 bg-stone-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${hpPercent(player.hp.current, player.hp.max)}%`,
            backgroundColor: getHPColor(player.hp.current, player.hp.max),
          }}
        />
      </div>
    </div>
  )
}

function TokenMonster({
  monster, cellSize, isCurrentTurn, isAnimating, onClick
}: {
  monster: MonsterState
  cellSize: number
  isCurrentTurn: boolean
  isAnimating: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  const px = monster.position.x * cellSize + cellSize / 2
  const py = monster.position.y * cellSize + cellSize / 2
  const r = cellSize * 0.38
  const abbrev = monster.name.slice(0, 2).toUpperCase()

  return (
    <div
      className="absolute pointer-events-auto cursor-pointer"
      style={{
        left: px - r,
        top: py - r,
        width: r * 2,
        height: r * 2,
        transition: isAnimating ? 'left 0.4s ease, top 0.4s ease' : undefined,
      }}
      onClick={onClick}
    >
      <div className={`relative w-full h-full rounded-full flex items-center justify-center font-bold text-white select-none
        ${isCurrentTurn ? 'ring-2 ring-orange-300 ring-offset-1' : ''}
        shadow-lg shadow-red-900/60`}
        style={{ background: 'radial-gradient(circle at 35% 35%, #f87171, #991b1b)' }}
      >
        <span style={{ fontSize: cellSize * 0.28 }}>{abbrev}</span>
        {isCurrentTurn && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-400 rounded-full animate-pulse" />
        )}
      </div>

      {/* HP bar */}
      <div className="absolute -bottom-2 left-0 right-0 h-1 bg-stone-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${hpPercent(monster.hp.current, monster.hp.max)}%`,
            backgroundColor: getHPColor(monster.hp.current, monster.hp.max),
          }}
        />
      </div>

      {/* Name label */}
      <div
        className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-stone-200 font-medium"
        style={{ fontSize: Math.max(9, cellSize * 0.18) }}
      >
        {monster.name}
      </div>
    </div>
  )
}

function TokenNpc({
  npc, cellSize, isAnimating, onClick
}: {
  npc: MapNpcToken
  cellSize: number
  isAnimating: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  const px = npc.position.x * cellSize + cellSize / 2
  const py = npc.position.y * cellSize + cellSize / 2
  const r = cellSize * 0.34
  const abbrev = npc.name.slice(0, 2).toUpperCase()
  const style = npcTokenStyle(npc.disposition)

  return (
    <div
      className="absolute pointer-events-auto cursor-pointer"
      style={{
        left: px - r,
        top: py - r,
        width: r * 2,
        height: r * 2,
        transition: isAnimating ? 'left 0.4s ease, top 0.4s ease' : undefined,
      }}
      onClick={onClick}
    >
      <div className={`relative w-full h-full rounded-full flex items-center justify-center font-bold text-white select-none ring-1 ${style.ring} shadow-lg ${style.shadow}`}
        style={{ background: style.background }}
      >
        <span style={{ fontSize: cellSize * 0.24 }}>{abbrev}</span>
      </div>

      <div
        className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-stone-200 font-medium"
        style={{ fontSize: Math.max(9, cellSize * 0.17) }}
      >
        {npc.name}
      </div>
    </div>
  )
}

function EntityTooltip({
  entity, x, y
}: {
  entity: PlayerState | MonsterState | MapNpcToken
  x: number
  y: number
}) {
  const isMonster = 'isAlive' in entity
  const isNpc = 'disposition' in entity
  const stats = !isNpc ? entity.stats : null

  return (
    <div
      className="absolute z-50 bg-stone-900/95 border border-amber-800/60 rounded-lg p-3 shadow-xl text-sm pointer-events-none"
      style={{
        left: x + 12,
        top: Math.max(0, y - 10),
        minWidth: 200,
        maxWidth: 280,
      }}
    >
      <div className="font-bold text-amber-400 mb-1">{entity.name}</div>
      {isNpc && (
        <div className="text-stone-300 text-xs mb-2">
          PNJ {npcTokenStyle(entity.disposition).label.toLowerCase()}
          {entity.kind ? ` | ${entity.kind}` : ''}
        </div>
      )}
      {isMonster && (
        <div className="text-stone-400 text-xs mb-2">
          {getHPDescription(entity.hp.current, entity.hp.max)}
        </div>
      )}
      {!isMonster && !isNpc && (
        <div className="text-stone-300 text-xs mb-2">
          HP: {entity.hp.current}/{entity.hp.max} | CA: {entity.ac}
        </div>
      )}
      {stats && (
        <div className="grid grid-cols-3 gap-1 text-xs text-stone-300">
          {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(s => (
            <div key={s} className="text-center">
              <div className="text-stone-500 uppercase text-[10px]">{s}</div>
              <div className="font-mono">{stats[s]}</div>
            </div>
          ))}
        </div>
      )}
      {!isNpc && entity.conditions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {entity.conditions.map(c => (
            <span key={c} className="px-1.5 py-0.5 bg-purple-900/60 text-purple-300 rounded text-[10px]">
              {c}
            </span>
          ))}
        </div>
      )}
      <div className="mt-1 text-stone-500 text-[10px]">
        Position: ({entity.position.x}, {entity.position.y})
      </div>
    </div>
  )
}
