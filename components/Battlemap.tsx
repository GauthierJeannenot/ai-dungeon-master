'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { GameState, MonsterState, PlayerState, WorldNpcDisposition } from '@/lib/types'
import { DEFAULT_CELL_SIZE } from '@/lib/adventure-map'
import CharacterSheetModal from './CharacterSheetModal'

interface BattlemapProps {
  gameState: GameState
  // Taille de case MINIMALE en px. Si la map tient dans le conteneur, les cases
  // s'agrandissent pour le remplir (letterbox) ; sinon elles restent à cette
  // taille et la carte devient scrollable au cliquer-glisser. Défaut
  // DEFAULT_CELL_SIZE. Vient de la map courante (AdventureMapSpec.cellSize).
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// Distance (px) au-delà de laquelle un cliquer-glisser compte comme un pan et
// non comme un clic sur un token.
const DRAG_THRESHOLD_PX = 5

export default function Battlemap({
  gameState,
  cellSize = DEFAULT_CELL_SIZE,
  image,
  cols = 17,
  rows = 15,
}: BattlemapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Surface (carte translatée) — référentiel des coordonnées de tooltip.
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  // Fiche de personnage ouverte en modale (clic sur le pion joueur / son tooltip).
  const [sheetOpen, setSheetOpen] = useState(false)
  const [prevPositions, setPrevPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [animating, setAnimating] = useState<Set<string>>(new Set())
  // Dimensions réelles du conteneur — la carte remplit tout l'espace alloué au
  // lieu d'être figée à cols×cellSize. null tant qu'on n'a pas mesuré (1er rendu).
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  // Décalage de la carte (px, ≤ 0) quand elle déborde du conteneur. Clampé au
  // rendu (pas dans un effet) → resize et changement de map re-clampent gratis.
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  // État du drag en cours (mutable, hors cycle de rendu).
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null)
  // Un pan venant de se terminer : avale le clic natif émis après pointerup.
  const suppressClickRef = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
    // Clic issu d'un pan : ignorer (le clic natif suit pointerup).
    if (suppressClickRef.current) { suppressClickRef.current = false; return }
    // Coordonnées dans la SURFACE (translatée), pas le conteneur : le tooltip
    // est rendu dans la surface et doit rester ancré au token pendant un pan.
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltip({
      entity,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }, [])

  // Le pion joueur (et son tooltip de survol) ouvre la fiche complète en modale,
  // au lieu du tooltip d'aperçu réservé aux monstres/PNJ.
  const handleOpenSheet = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (suppressClickRef.current) { suppressClickRef.current = false; return }
    setTooltip(null)
    setSheetOpen(true)
  }, [])

  const aliveMonsters = Object.values(gameState.monsters).filter(m => m.isAlive)
  const npcTokens = deriveNpcTokens(gameState)

  // Taille de la grille : dimensions de la map courante (défaut 17×15), étendues
  // si une entité déborde (fail-safe : un token hors bornes reste visible).
  const gridCols = Math.max(cols, ...aliveMonsters.map(m => m.position.x + 2), ...npcTokens.map(npc => npc.position.x + 2), gameState.player.position.x + 2)
  const gridRows = Math.max(rows, ...aliveMonsters.map(m => m.position.y + 2), ...npcTokens.map(npc => npc.position.y + 2), gameState.player.position.y + 2)

  // Cases CARRÉES, cellSize = minimum. Si la grille tient dans le conteneur, la
  // case grandit pour le remplir ; sinon elle reste au minimum et la carte
  // déborde (scroll). Avant la 1re mesure, repli sur le minimum.
  const fitCell = dims ? Math.min(dims.w / gridCols, dims.h / gridRows) : cellSize
  const cell = Math.max(cellSize, fitCell)
  const mapW = gridCols * cell
  const mapH = gridRows * cell

  // Décalage de la surface : letterbox centré si la carte tient sur un axe,
  // scroll clampé si elle déborde. Sans mesure encore, pas de décalage.
  const offsetX = !dims ? 0 : mapW <= dims.w ? (dims.w - mapW) / 2 : clamp(pan.x, dims.w - mapW, 0)
  const offsetY = !dims ? 0 : mapH <= dims.h ? (dims.h - mapH) / 2 : clamp(pan.y, dims.h - mapH, 0)
  const overflowing = dims ? (mapW > dims.w || mapH > dims.h) : false

  // Changement de map : le pan précédent n'a plus de sens sur une autre grille.
  useEffect(() => {
    setPan({ x: 0, y: 0 })
  }, [image])

  // Auto-follow : recadre sur le pion joueur s'il sort (ou approche) du champ
  // visible. Jamais pendant un drag ; inutile en mode fit (tout est visible).
  useEffect(() => {
    if (!dims || dragRef.current) return
    if (mapW <= dims.w && mapH <= dims.h) return
    const px = (gameState.player.position.x + 0.5) * cell
    const py = (gameState.player.position.y + 0.5) * cell
    // Marge d'une case : on recadre dès que le pion approche du bord visible.
    const outX = mapW > dims.w && (px < -offsetX + cell || px > -offsetX + dims.w - cell)
    const outY = mapH > dims.h && (py < -offsetY + cell || py > -offsetY + dims.h - cell)
    if (outX || outY) {
      setPan({ x: dims.w / 2 - px, y: dims.h / 2 - py })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.player.position.x, gameState.player.position.y, cols, rows, image, dims])

  const handlePointerDown = (e: React.PointerEvent) => {
    // Nouvelle interaction : purge un éventuel flag resté armé (drag sans clic
    // de suivi, p. ex. relâché hors cible, ou carte redevenue non-scrollable).
    suppressClickRef.current = false
    // Bouton gauche uniquement, et seulement s'il y a de quoi scroller.
    if (e.button !== 0 || !overflowing) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: offsetX, panY: offsetY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    // Tant qu'on n'a pas franchi le seuil, on laisse le clic vivre (tooltip/fiche).
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    drag.moved = true
    if (!isDragging) setIsDragging(true)
    setPan({ x: drag.panX + dx, y: drag.panY + dy })
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    // Un vrai pan : avaler le clic natif qui suit pointerup (sinon il ferme le
    // tooltip ou ouvre la fiche).
    if (drag.moved) suppressClickRef.current = true
    dragRef.current = null
    setIsDragging(false)
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-stone-900 rounded-lg border border-amber-900/40 ${
        overflowing ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
      }`}
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={() => {
        if (suppressClickRef.current) { suppressClickRef.current = false; return }
        setTooltip(null)
      }}
    >
      {/* Surface de la carte — cases carrées, translatée (letterbox ou scroll) */}
      <div
        ref={surfaceRef}
        className="relative"
        style={{
          width: mapW,
          height: mapH,
          transform: `translate(${offsetX}px, ${offsetY}px)`,
          transition: isDragging ? undefined : 'transform 0.3s ease',
        }}
      >
        {/* Image de la battlemap du module actif (prop `image`, fournie par la
            page de jeu depuis la map courante). backgroundSize 100% aligne
            chaque case image sur chaque case de la grille ; imageRendering
            pixelated préserve les pixels nets à l'agrandissement. */}
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
          width={mapW}
          height={mapH}
        >
          <defs>
            <pattern id="grid" width={cell} height={cell} patternUnits="userSpaceOnUse">
              <path
                d={`M ${cell} 0 L 0 0 0 ${cell}`}
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
            cellW={cell}
            cellH={cell}
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
            cellW={cell}
            cellH={cell}
            isAnimating={animating.has(`npc:${npc.id}`)}
            onClick={(e) => handleTokenClick(e, npc)}
          />
        ))}

        {/* Player token */}
        <TokenPlayer
          player={gameState.player}
          cellW={cell}
          cellH={cell}
          isCurrentTurn={gameState.currentTurn === 'player' || gameState.phase !== 'combat'}
          isAnimating={animating.has('player')}
          onOpenSheet={handleOpenSheet}
        />

        {/* Tooltip */}
        {tooltip && (
          <EntityTooltip
            entity={tooltip.entity}
            x={tooltip.x}
            y={tooltip.y}
            mapW={mapW}
            mapH={mapH}
          />
        )}
      </div>

      {/* Fiche complète du personnage joueur (modale, position fixe) */}
      <CharacterSheetModal
        player={gameState.player}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  )
}

function deriveNpcTokens(gameState: GameState): MapNpcToken[] {
  if (!gameState.npcs) return []

  const currentRoomId = gameState.currentRoomId
  // PNJ devenus combattants : on évite le doublon token PNJ + token monstre.
  // Tous les monstres comptent, morts inclus : un PNJ dont le combattant homonyme
  // a été tué ne doit pas réapparaître (les désengagés — négociation, fuite —
  // sont retirés de l'état par end_combat, donc leur PNJ revient bien).
  const occupiedMonsterNames = new Set(
    Object.values(gameState.monsters)
      .map(monster => monster.name.toLowerCase())
  )

  return Object.values(gameState.npcs)
    .filter(npc => npc.visible)
    // Multi-map : un PNJ d'une autre map ne se dessine pas sur cette grille.
    // Champs absents (états legacy, modules 1-map) = pas de filtre.
    .filter(npc => !npc.mapId || !gameState.currentMapId || npc.mapId === gameState.currentMapId)
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
  player, cellW, cellH, isCurrentTurn, isAnimating, onOpenSheet
}: {
  player: PlayerState
  cellW: number
  cellH: number
  isCurrentTurn: boolean
  isAnimating: boolean
  onOpenSheet: (e: React.MouseEvent) => void
}) {
  const cell = Math.min(cellW, cellH)
  const px = player.position.x * cellW + cellW / 2
  const py = player.position.y * cellH + cellH / 2
  const r = cell * 0.38

  return (
    // `group` : le survol du pion révèle un aperçu cliquable (ouvre la fiche).
    // Un enfant en :hover compte comme survol du parent → pas de « trou » entre
    // le pion et l'aperçu même s'il déborde hors de la boîte du pion.
    <div
      className="group absolute pointer-events-auto cursor-pointer"
      style={{
        left: px - r,
        top: py - r,
        width: r * 2,
        height: r * 2,
        transition: isAnimating ? 'left 0.4s ease, top 0.4s ease' : undefined,
      }}
      onClick={onOpenSheet}
      title={`${player.name} — voir la fiche`}
    >
      <div className={`relative w-full h-full rounded-full flex items-center justify-center font-bold text-white select-none
        ${isCurrentTurn ? 'ring-2 ring-yellow-300 ring-offset-1 ring-offset-transparent' : ''}
        shadow-lg shadow-blue-900/60`}
        style={{ background: 'radial-gradient(circle at 35% 35%, #60a5fa, #1d4ed8)' }}
      >
        <span style={{ fontSize: cell * 0.3 }}>
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

      {/* Aperçu au survol : PV / CA + invite à ouvrir la fiche. Cliquable
          (pointer-events-auto) → même action que le clic sur le pion. */}
      <div
        className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-40 w-max max-w-[180px] pointer-events-auto cursor-pointer rounded-lg border border-amber-800/60 bg-stone-900/95 px-2.5 py-1.5 shadow-xl"
        onClick={onOpenSheet}
      >
        <div className="text-xs font-bold text-amber-300 whitespace-nowrap">{player.name}</div>
        <div className="text-[11px] text-stone-300 whitespace-nowrap">
          PV {player.hp.current}/{player.hp.max} · CA {player.ac}
        </div>
        <div className="mt-0.5 text-[10px] text-amber-400/80 whitespace-nowrap">📋 Voir la fiche</div>
      </div>
    </div>
  )
}

function TokenMonster({
  monster, cellW, cellH, isCurrentTurn, isAnimating, onClick
}: {
  monster: MonsterState
  cellW: number
  cellH: number
  isCurrentTurn: boolean
  isAnimating: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  const cell = Math.min(cellW, cellH)
  const px = monster.position.x * cellW + cellW / 2
  const py = monster.position.y * cellH + cellH / 2
  const r = cell * 0.38
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
        <span style={{ fontSize: cell * 0.28 }}>{abbrev}</span>
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
        style={{ fontSize: Math.max(9, cell * 0.18) }}
      >
        {monster.name}
      </div>
    </div>
  )
}

function TokenNpc({
  npc, cellW, cellH, isAnimating, onClick
}: {
  npc: MapNpcToken
  cellW: number
  cellH: number
  isAnimating: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  const cell = Math.min(cellW, cellH)
  const px = npc.position.x * cellW + cellW / 2
  const py = npc.position.y * cellH + cellH / 2
  const r = cell * 0.34
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
        <span style={{ fontSize: cell * 0.24 }}>{abbrev}</span>
      </div>

      <div
        className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-stone-200 font-medium"
        style={{ fontSize: Math.max(9, cell * 0.17) }}
      >
        {npc.name}
      </div>
    </div>
  )
}

// Largeur/hauteur approximatives du tooltip pour décider d'un flip près des
// bords de la carte (la carte est en overflow-hidden : sans flip, un tooltip
// ancré à droite/en bas serait coupé).
const TOOLTIP_W = 280
const TOOLTIP_EST_H = 170

function EntityTooltip({
  entity, x, y, mapW, mapH
}: {
  entity: PlayerState | MonsterState | MapNpcToken
  x: number
  y: number
  mapW: number
  mapH: number
}) {
  const isMonster = 'isAlive' in entity
  const isNpc = 'disposition' in entity
  const stats = !isNpc ? entity.stats : null

  // Flip horizontal si le tooltip déborderait à droite ; vertical s'il
  // déborderait en bas. Position clampée dans les bornes de la carte.
  const flipX = x + 12 + TOOLTIP_W > mapW
  const left = flipX ? Math.max(0, x - 12 - TOOLTIP_W) : x + 12
  const flipY = y - 10 + TOOLTIP_EST_H > mapH
  const top = flipY ? Math.max(0, y - TOOLTIP_EST_H) : Math.max(0, y - 10)

  return (
    <div
      className="absolute z-50 bg-stone-900/95 border border-amber-800/60 rounded-lg p-3 shadow-xl text-sm pointer-events-none"
      style={{
        left,
        top,
        minWidth: 200,
        maxWidth: TOOLTIP_W,
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
