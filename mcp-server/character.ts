import { DEFAULT_CHARACTER_ID, isKnownCharacterId } from '../lib/character-registry'

// ─────────────────────────────────────────────────────────────────────────────
// Personnage ACTIF de ce process moteur. Miroir exact de adventure.ts : un
// process MCP = une session = une aventure + UN personnage. L'id est fixé à
// l'unique lecture de CHARACTER_ID au spawn (lib/mcp-client.ts). Ne change
// jamais pendant la vie du process. Voir docs/playable-characters.md.
// ─────────────────────────────────────────────────────────────────────────────

function resolveActiveCharacterId(): string {
  const fromEnv = process.env.CHARACTER_ID?.trim()
  if (fromEnv && isKnownCharacterId(fromEnv)) return fromEnv
  return DEFAULT_CHARACTER_ID
}

export const ACTIVE_CHARACTER_ID = resolveActiveCharacterId()
