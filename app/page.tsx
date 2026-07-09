import Link from 'next/link'
import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import { getUserCredits, getGuestUsage, GUEST_MESSAGE_LIMIT } from '@/lib/credits-store'
import { getOwnedModules } from '@/lib/module-access'
import { GUEST_COOKIE_NAME } from '@/lib/entitlements'
import { ADVENTURES } from '@/lib/adventures'
import { TOKEN_PACKAGES } from '@/lib/token-packages'
import { isStripeConfigured } from '@/lib/stripe'
import AuthControls from '@/components/landing/AuthControls'
import BuyTokensPanel from '@/components/landing/BuyTokensPanel'
import BuyModuleButton from '@/components/landing/BuyModuleButton'
import CharacterPicker from '@/components/landing/CharacterPicker'
import MyGamesPanel from '@/components/landing/MyGamesPanel'

function formatEur(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`
}

// Landing page — choix du module d'aventure, connexion OAuth et achat de tokens.
// Server Component : l'état (session, solde, quota invité) est lu côté serveur.
// Lecture SEULE ici — le cookie invité n'est créé que par les Route Handlers.

export const dynamic = 'force-dynamic'

const ACCENT_STYLES = {
  amber: {
    border: 'border-amber-800/60 hover:border-amber-600',
    badge: 'bg-amber-900/50 text-amber-300 border-amber-800/60',
    glow: 'from-amber-950/60',
  },
  emerald: {
    border: 'border-emerald-800/60 hover:border-emerald-600',
    badge: 'bg-emerald-900/50 text-emerald-300 border-emerald-800/60',
    glow: 'from-emerald-950/60',
  },
  purple: {
    border: 'border-purple-800/60',
    badge: 'bg-purple-900/50 text-purple-300 border-purple-800/60',
    glow: 'from-purple-950/60',
  },
} as const

export default async function LandingPage() {
  const session = await auth()

  let balance: number | undefined
  let guestRemaining = GUEST_MESSAGE_LIMIT
  let ownedModules: string[] = []
  if (session?.userId) {
    balance = (await getUserCredits(session.userId)).balance
    ownedModules = await getOwnedModules(session.userId)
  } else {
    const guestId = (await cookies()).get(GUEST_COOKIE_NAME)?.value
    if (guestId) {
      const usage = await getGuestUsage(guestId)
      guestRemaining = Math.max(0, GUEST_MESSAGE_LIMIT - usage.messagesUsed)
    }
  }
  const authenticated = Boolean(session?.userId)
  const paymentsEnabled = isStripeConfigured()

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      {/* Header */}
      <header className="border-b border-amber-900/40 bg-stone-900">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <span className="font-display font-semibold text-amber-500 tracking-wider text-sm">⚔ AI DUNGEON MASTER</span>
          <div className="ml-auto">
            <AuthControls
              authenticated={Boolean(session?.userId)}
              userName={session?.user?.name}
              userImage={session?.user?.image}
              balance={balance}
            />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4">
        {/* Hero */}
        <section className="py-14 sm:py-20 text-center">
          <h1 className="font-display text-3xl sm:text-5xl font-semibold text-amber-400 tracking-tight">
            Un Dungeon Master IA, une table toujours ouverte
          </h1>
          <p className="mt-4 text-stone-400 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            Jeu de rôle D&D 5e en ligne, narré par une IA et arbitré par un moteur de règles
            déterministe. Battlemap interactive, combats tactiques, PNJ qui se souviennent de
            vos frasques — sans attendre que le MJ soit disponible un jeudi soir.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/game"
              className="px-6 py-3 bg-amber-800 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors"
            >
              Jouer maintenant
            </Link>
            {!session?.userId && (
              <span className="text-xs text-stone-500">
                {guestRemaining > 0
                  ? `${guestRemaining} message${guestRemaining > 1 ? 's' : ''} d'essai gratuit${guestRemaining > 1 ? 's' : ''} — sans compte`
                  : 'Essai gratuit épuisé — connectez-vous pour continuer'}
              </span>
            )}
          </div>
        </section>

        {/* Mes parties en cours (masqué s'il n'y en a aucune) */}
        <MyGamesPanel />

        {/* Modules d'aventure */}
        <section className="pb-14">
          <h2 className="font-display text-xl font-semibold text-stone-200 mb-1">Modules d&apos;aventure</h2>
          <p className="text-sm text-stone-500 mb-6">Choisissez votre prochaine table.</p>
          <div className="grid gap-5 md:grid-cols-2">
            {ADVENTURES.map(adventure => {
              const accent = ACCENT_STYLES[adventure.accent]
              const owned = ownedModules.includes(adventure.id)
              // Module payant non encore débloqué : accès à acheter (connexion +
              // paiement). Un module possédé se joue normalement.
              const needsPurchase = adventure.available && adventure.requiresEntitlement && !owned
              const badgeLabel = !adventure.available
                ? 'Bientôt'
                : needsPurchase && adventure.priceCents
                  ? formatEur(adventure.priceCents)
                  : owned
                    ? 'Débloqué'
                    : 'Disponible'
              return (
                <article
                  key={adventure.id}
                  className={`relative rounded-xl border bg-gradient-to-b ${accent.glow} to-stone-900/80 p-6 flex flex-col gap-3 transition-colors ${accent.border} ${adventure.available ? '' : 'opacity-70'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-lg font-semibold text-stone-100">{adventure.title}</h3>
                    <span className={`flex-shrink-0 text-[10px] uppercase tracking-wider border px-2 py-0.5 rounded ${accent.badge}`}>
                      {badgeLabel}
                    </span>
                  </div>
                  <p className="text-amber-200/80 text-sm italic">{adventure.tagline}</p>
                  <p className="text-stone-400 text-sm leading-relaxed">{adventure.description}</p>
                  {needsPurchase && (
                    <p className="text-xs text-amber-300/80">
                      🔒 Module payant — connectez-vous et débloquez l&apos;accès définitif.
                    </p>
                  )}
                  <div className="mt-auto pt-3 flex items-center gap-3 text-xs text-stone-400">
                    <span>{adventure.level}</span>
                    <span className="w-1 h-1 rounded-full bg-stone-700" />
                    <span>{adventure.duration}</span>
                  </div>
                  <div className="pt-1">
                    {!adventure.available || !adventure.playPath ? (
                      <span
                        aria-disabled="true"
                        className="inline-block px-4 py-2 bg-stone-800 text-stone-500 text-sm font-semibold rounded cursor-not-allowed select-none"
                      >
                        🔒 Verrouillé
                      </span>
                    ) : needsPurchase && adventure.priceCents ? (
                      <BuyModuleButton
                        moduleId={adventure.id}
                        priceCents={adventure.priceCents}
                        authenticated={authenticated}
                        paymentsEnabled={paymentsEnabled}
                      />
                    ) : (
                      <CharacterPicker playPath={adventure.playPath} />
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        {/* Tarifs */}
        <section className="pb-16">
          <h2 className="font-display text-xl font-semibold text-stone-200 mb-1">Messages</h2>
          <p className="text-sm text-stone-500 mb-6">
            Chaque message envoyé au Dungeon Master est décompté de votre solde. Les nouveaux
            comptes reçoivent des messages de bienvenue ; les visiteurs anonymes disposent
            de {GUEST_MESSAGE_LIMIT} messages d&apos;essai, quel que soit le module.
          </p>
          <BuyTokensPanel
            authenticated={Boolean(session?.userId)}
            paymentsEnabled={isStripeConfigured()}
            packages={TOKEN_PACKAGES}
          />
        </section>
      </main>

      <footer className="border-t border-stone-900 py-6 text-center text-xs text-stone-400">
        AI Dungeon Master — propulsé par Claude · D&D 5e
      </footer>
    </div>
  )
}
