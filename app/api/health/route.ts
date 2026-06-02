import { NextResponse } from 'next/server'

// Endpoint de healthcheck utilisé par Railway, Render, Koyeb
// pour vérifier que le service est up avant de router le trafic
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.1.0',
    },
    { status: 200 }
  )
}
