import { DEFAULT_ADVENTURE_ID, isKnownAdventureId } from '../lib/adventure-map'

// ─────────────────────────────────────────────────────────────────────────────
// Module d'aventure ACTIF de ce process moteur. Un process MCP = une session =
// une aventure : l'id est fixé à l'unique lecture de ADVENTURE_ID au spawn
// (lib/mcp-client.ts). Ne change jamais pendant la vie du process.
// ─────────────────────────────────────────────────────────────────────────────

function resolveActiveAdventureId(): string {
  const fromEnv = process.env.ADVENTURE_ID?.trim()
  if (fromEnv && isKnownAdventureId(fromEnv)) return fromEnv
  return DEFAULT_ADVENTURE_ID
}

export const ACTIVE_ADVENTURE_ID = resolveActiveAdventureId()
