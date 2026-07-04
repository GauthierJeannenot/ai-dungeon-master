import { logEvent } from './server-logger'

// ─────────────────────────────────────────────────────────────────────────────
// Validation de la configuration au démarrage du serveur (instrumentation.ts).
// Objectif : une erreur d'environnement doit être lisible dans les logs de boot,
// pas découverte en 500 au premier message d'un joueur.
//   - fatal : configuration qui casserait TOUTES les requêtes → on refuse de démarrer
//   - warn  : configuration douteuse mais fonctionnelle → log explicite
// ─────────────────────────────────────────────────────────────────────────────

const NUMERIC_ENV_VARS = [
  'GUEST_MESSAGE_LIMIT',
  'SIGNUP_BONUS_TOKENS',
  'DM_RATE_LIMIT_PER_MINUTE',
  'DM_DAILY_GLOBAL_MESSAGE_LIMIT',
  'DM_MAX_STORED_HISTORY_TURNS',
  'DATABASE_POOL_MAX',
  'LLM_MAX_CALLS_PER_REQUEST',
  'LLM_MAX_TOKENS',
  'LLM_HISTORY_KEEP_RECENT',
  'LLM_HISTORY_COMPRESS_THRESHOLD_CHARS',
  'LLM_COMBAT_LOG_TAIL',
]

export function validateServerConfig(): void {
  const isProduction = process.env.NODE_ENV === 'production'
  const monetizationEnabled = process.env.MONETIZATION_ENABLED !== 'false'
  const fatals: string[] = []
  const warnings: string[] = []

  // Auth : sans AUTH_SECRET, NextAuth lève une erreur sur CHAQUE auth() en prod
  // → tous les /api/dm répondraient 500. On refuse de démarrer.
  if (isProduction && monetizationEnabled && !process.env.AUTH_SECRET?.trim()) {
    fatals.push(
      'AUTH_SECRET manquante alors que la monétisation est active : chaque message DM échouerait. ' +
      'Générer avec `npx auth secret`, ou définir MONETIZATION_ENABLED=false en connaissance de cause.'
    )
  }

  // LLM : en prod, mode live sans clé = aucune narration possible.
  const llmMode = process.env.LLM_MODE === 'mock' ? 'mock' : 'live'
  if (isProduction && llmMode === 'live' && !process.env.ANTHROPIC_API_KEY?.trim()) {
    fatals.push('ANTHROPIC_API_KEY manquante en mode LLM live : aucun message DM ne peut aboutir.')
  }

  // Stripe : un checkout sans webhook encaisse SANS créditer les tokens.
  if (process.env.STRIPE_SECRET_KEY?.trim() && !process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
    warnings.push(
      'STRIPE_SECRET_KEY définie sans STRIPE_WEBHOOK_SECRET : les paiements seraient encaissés ' +
      'mais les tokens jamais crédités (le webhook est le seul chemin de crédit).'
    )
  }

  // Postgres est le SEUL backend de persistance (auth, sessions, crédits,
  // disjoncteur journalier). Sans DATABASE_URL, aucune de ces opérations ne peut
  // aboutir → fatal en prod, erreur claire en dev pointant vers docker compose.
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    warnings.push(`DATABASE_URL ne ressemble pas à une URL Postgres (schéma attendu postgres://) : "${databaseUrl.slice(0, 24)}..."`)
  }
  if (!databaseUrl) {
    if (isProduction) {
      fatals.push(
        'DATABASE_URL manquante : Postgres est le seul backend de persistance ' +
        '(auth, sessions de jeu, crédits). Aucun message DM ne peut aboutir. ' +
        'Définir DATABASE_URL sur le Postgres du service.'
      )
    } else {
      warnings.push(
        'Pas de DATABASE_URL : la persistance (sessions, crédits, auth) est indisponible. ' +
        'En dev : `docker compose up -d` puis DATABASE_URL=postgres://postgres:postgres@localhost:5432/ai_dm dans .env.local.'
      )
    }
  }

  for (const name of NUMERIC_ENV_VARS) {
    const value = process.env[name]
    if (value && !Number.isFinite(Number.parseInt(value, 10))) {
      warnings.push(`${name}="${value}" n'est pas un entier — la valeur par défaut sera utilisée.`)
    }
  }

  for (const warning of warnings) {
    logEvent('warn', 'config.check.warning', { warning })
  }

  if (fatals.length > 0) {
    for (const fatal of fatals) {
      logEvent('error', 'config.check.fatal', { fatal })
    }
    throw new Error(`Configuration invalide :\n- ${fatals.join('\n- ')}`)
  }

  logEvent('info', 'config.check.ok', {
    production: isProduction,
    monetizationEnabled,
    llmMode,
    databaseEnabled: Boolean(databaseUrl),
    paymentsEnabled: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    warnings: warnings.length,
  })
}
