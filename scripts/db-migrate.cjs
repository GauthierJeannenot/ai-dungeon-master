#!/usr/bin/env node
'use strict'

// Applique le schéma Postgres (idempotent — CREATE TABLE IF NOT EXISTS).
// Usage :  DATABASE_URL=postgres://... node scripts/db-migrate.cjs
// Le schéma est aussi appliqué paresseusement au premier accès de l'app ;
// ce script sert à migrer explicitement (CI/CD, premier déploiement).

const path = require('node:path')

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL manquante. Exemple :')
  console.error('  DATABASE_URL=postgres://user:pass@host:5432/db node scripts/db-migrate.cjs')
  process.exit(1)
}

// Hook require pour charger les modules TS de lib/ (même mécanique que tests/).
const { installTsRequireWithAliases } = require('../tests/helpers/ts-require.cjs')
installTsRequireWithAliases()

async function main() {
  const { ensureSchema, getPool } = require(path.join(process.cwd(), 'lib/db.ts'))
  await ensureSchema()

  const tables = await getPool().query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`
  )
  console.log('Schéma appliqué. Tables présentes :')
  for (const row of tables.rows) console.log(`  - ${row.table_name}`)

  await getPool().end()
}

main().catch(err => {
  console.error('Échec de la migration :', err.message)
  process.exit(1)
})
