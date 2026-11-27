'use client'

import Image from 'next/image'
import type { CSSProperties } from 'react'
import type { AdventureScene as SceneDefinition, SceneBounds } from '@/lib/adventures'
import type { GameState } from '@/lib/types'
import { discoveredMapRooms } from '@/lib/map-discovery'
import { explorationDestinationRooms } from '@/lib/exploration-navigation'
import styles from './AdventureScene.module.css'

function placement(bounds: SceneBounds): CSSProperties {
  return { left: `${bounds.x}%`, top: `${bounds.y}%`, width: `${bounds.width}%`, height: `${bounds.height}%` }
}

export default function AdventureScene({ scene, mapId, gameState, disabled, onAction }: {
  scene: SceneDefinition
  mapId: string
  gameState: GameState
  disabled: boolean
  onAction: (message: string) => void
}) {
  const destinations = new Set(explorationDestinationRooms(gameState, true).map(room => room.id))
  const discovered = new Set(discoveredMapRooms(gameState).map(room => room.id))
  const concealedRegions = scene.fogRegions?.filter(region => !discovered.has(region.roomId)) ?? []
  const isAvailable = (entry: { roomIds: string[]; requiresClueId?: string; destinationRoomId?: string }) =>
    entry.roomIds.includes(gameState.currentRoomId ?? '')
    && (!entry.destinationRoomId || destinations.has(entry.destinationRoomId))
    && (!entry.requiresClueId || gameState.worldFacts?.some(fact => fact.clueId === entry.requiresClueId))
  const hotspots = scene.hotspots.filter(isAvailable)
  const availableActions = [
    ...hotspots.filter(hotspot => hotspot.marker).map(({ label, message, marker }) => ({ label, message, marker, placement: undefined })),
    ...(scene.actions?.filter(isAvailable) ?? [])
      .map(action => ({ ...action, marker: undefined })),
  ]
  const actions = availableActions.filter(action => action.placement !== 'right')
  const sideActions = availableActions.filter(action => action.placement === 'right')
  const overlays = scene.npcOverlays.filter(overlay => {
    const npc = gameState.npcs?.[overlay.npcId]
    return npc?.visible && npc.mapId === mapId && npc.roomId === gameState.currentRoomId
  })

  return (
    <section className={styles.scene} aria-label={scene.alt}>
      <div className={styles.stage}>
      <div className={styles.viewport}>
        <div className={styles.frame} style={{ '--scene-ratio': scene.width / scene.height } as CSSProperties}>
          <Image src={scene.image} alt={scene.alt} width={scene.width} height={scene.height}
            className={styles.background} unoptimized preload />
          {concealedRegions.length > 0 && (
            <svg className={styles.fog} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {concealedRegions.map(region => <polygon key={region.roomId} data-fog-room={region.roomId}
                points={region.points.map(point => point.join(',')).join(' ')} fill="#090c13" />)}
            </svg>
          )}
          {overlays.map(overlay => (
            <div key={overlay.npcId} className={styles.apparition} style={placement(overlay.bounds)}>
              <Image src={overlay.image} alt={overlay.alt} fill sizes="20vw" unoptimized
                className={styles.spirit} />
            </div>
          ))}
          {hotspots.map(hotspot => (
            <button key={hotspot.id} type="button" className={`${styles.hotspot}${hotspot.marker ? ` ${styles.point}` : ''}${hotspot.appearance === 'button' ? ` ${styles.imageAction}` : ''}`}
              style={placement(hotspot.bounds)} disabled={disabled}
              aria-label={hotspot.label} title={hotspot.label}
              onClick={() => onAction(hotspot.message)}>
              {hotspot.marker && <span className={styles.pointMarker} aria-hidden="true">{hotspot.marker}</span>}
              <span className={styles.hotspotLabel}>{hotspot.label}</span>
            </button>
          ))}
        </div>
      </div>
      {sideActions.length > 0 && (
        <nav className={styles.sideActions} aria-label="Voyage">
          {sideActions.map(action => (
            <button key={action.label} type="button" disabled={disabled} onClick={() => onAction(action.message)}>
              {action.label} <span aria-hidden="true">→</span>
            </button>
          ))}
        </nav>
      )}
      </div>
      <div className={styles.caption}>
        <p>{scene.hint}</p>
        {actions.length > 0 && (
          <div className={styles.actions}>
            {actions.map(action => (
              <button key={action.label} type="button" disabled={disabled} onClick={() => onAction(action.message)}>
                {action.marker && <span className={styles.legendMarker} aria-hidden="true">{action.marker}</span>}
                {action.label} <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
