import type { DungeonLayout } from '@/lib/dungeon-layout'

// Artwork is decorative; navigation/sight use the shared procedural stencil.
export default function DungeonFloor({layout}:{layout:DungeonLayout}) {
  return <div className="absolute inset-0 bg-stone-200" aria-hidden="true" data-dungeon-floor="graphite">
    {layout.tiles.map(tile=><div key={`${tile.x},${tile.y}`} className="absolute"
      style={{left:`${tile.x/layout.width*100}%`,top:`${tile.y/layout.height*100}%`,width:`${100/layout.width}%`,height:`${100/layout.height}%`,
        backgroundImage:`url(/dungeon-tiles/${tile.tileId}.png)`,backgroundSize:'100% 100%',transform:`rotate(${tile.rotation}deg)`}} />)}
  </div>
}
