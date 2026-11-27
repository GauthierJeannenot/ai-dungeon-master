import { useId } from 'react'
import type { GameState } from '@/lib/types'
import { getAdventureMap, getMapSpec, firstMapId } from '@/lib/adventure-map'
import { discoveredMapRooms } from '@/lib/map-discovery'
import { hiddenDoorWallMasks } from '@/lib/door-discovery'

export default function MapFog({ gameState, width, height }: { gameState: GameState; width: number; height: number }) {
  const instance = useId().replace(/[^\w-]/g, '')
  const map = getMapSpec(gameState.currentMapId, gameState)
  const id = `fog-${map.id}-${instance}`
  const walls=hiddenDoorWallMasks(gameState)
  if (!map.fogOfWar&&!walls.length) return null
  const cellW = width / map.grid.cols, cellH = height / map.grid.rows
  const discovered = discoveredMapRooms(gameState)
  const maskedRooms = map.fogHiddenRoomIds
    ? getAdventureMap(gameState).rooms.filter(room =>
      (room.mapId ?? firstMapId(gameState)) === map.id
      && map.fogHiddenRoomIds!.includes(room.id) && !discovered.some(known => known.id === room.id))
    : discovered
  return <svg className="absolute inset-0 pointer-events-none" width={width} height={height} aria-hidden="true">
    <defs><mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
      <rect width={width} height={height} fill={map.fogHiddenRoomIds ? 'black' : 'white'} />
      {maskedRooms.flatMap(room => (room.areas ?? [room.zone]).map((area, i) =>
        <rect key={`${room.id}:${i}`} x={area.minX * cellW} y={area.minY * cellH}
          width={(area.maxX - area.minX + 1) * cellW} height={(area.maxY - area.minY + 1) * cellH} fill={map.fogHiddenRoomIds ? 'white' : 'black'} />))}
    </mask></defs>
    {map.fogOfWar&&<rect width={width} height={height} fill="#090c13" mask={`url(#${id})`} />}
    {walls.map((wall,index)=><line key={`wall-${index}`} x1={wall.from.x*cellW} y1={wall.from.y*cellH}
      x2={wall.to.x*cellW} y2={wall.to.y*cellH} stroke="#090c13" strokeWidth={Math.min(cellW,cellH)*.8} strokeLinecap="butt" />)}
  </svg>
}
