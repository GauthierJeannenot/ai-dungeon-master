import { NextResponse } from 'next/server'
import { logEvent } from '@/lib/server-logger'

// Endpoint de healthcheck utilisé par Railway, Render, Koyeb
// pour vérifier que le service est up avant de router le trafic
export async function GET(): Promise<NextResponse> {
  logEvent('debug', 'health.ok', {
    version: process.env.npm_package_version ?? '0.1.0',
  })

  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.1.0',
    },
    { status: 200 }
  )
}
