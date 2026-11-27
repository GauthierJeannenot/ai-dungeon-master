'use client'

import { useState, type ReactNode } from 'react'
import type { MiniatureId } from '@/lib/miniatures'

export default function Miniature({ model, image, children }: { model?: MiniatureId; image?: string; children: ReactNode }) {
  const fallback = model ? <Portrait key={model} model={model}>{children}</Portrait> : <>{children}</>
  return image ? <TokenImage key={image} src={image}>{fallback}</TokenImage> : fallback
}

function TokenImage({ src, children }: { src: string; children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  return <>
    {!ready && children}
    {!failed && <img src={src} alt="" aria-hidden="true" draggable={false} decoding="async"
      onLoad={() => setReady(true)} onError={() => { setReady(false); setFailed(true) }}
      className="absolute inset-0 h-full w-full rounded-full object-cover pointer-events-none select-none"
      style={{ objectPosition: '50% 20%', opacity: ready ? 1 : 0 }} />}
  </>
}

function Portrait({ model, children }: { model: MiniatureId; children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  return <>
    {!ready && children}
    {!failed && <img
      src={'/miniatures/' + model + '.png'}
      alt=""
      aria-hidden="true"
      draggable={false}
      loading="lazy"
      decoding="async"
      onLoad={() => setReady(true)}
      onError={() => { setReady(false); setFailed(true) }}
      className="absolute object-contain pointer-events-none select-none"
      style={{ left: '-12.5%', bottom: 0, width: '125%', height: '145%', opacity: ready ? 1 : 0 }}
    />}
  </>
}
