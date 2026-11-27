'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { GamePresenceState } from '@/lib/use-game-presence'
import type { DmStartupProgress } from '@/lib/runpod-startup-progress'
import styles from './DmStartupModal.module.css'

const STARTUP_DURATION_MS = 15 * 60 * 1000

const CANDIDATES = [
  'MJ trop sévère',
  'MJ pas assez marrant',
  'MJ beaucoup trop bavard',
  'MJ allergique aux dragons',
  'MJ qui oublie les règles',
  'MJ trop fan des pièges',
  'MJ qui dit toujours non',
  'MJ qui a perdu ses dés',
  'MJ beaucoup trop théâtral',
  'MJ un peu trop généreux',
  'MJ obsédé par les portes',
  'MJ qui fait parler les chaises',
  'MJ qui rit avant le piège',
  'MJ qui compte de travers',
  'MJ toujours en retard',
  'MJ fan des monologues',
  'MJ qui imite mal les orcs',
  'MJ qui invente des taxes',
  'MJ distrait par son chat',
  'MJ qui a mangé la carte',
  'MJ trop sûr de lui',
  'MJ payé en pièces de cuivre',
  'MJ qui négocie avec les dés',
  'MJ qui vouvoie les gobelins',
  'MJ qui tutoie les dieux',
  'MJ en pause entre deux pièges',
  'MJ qui spoile la prophétie',
  'MJ qui improvise les prophéties',
  'MJ sponsorisé par les mimics',
  'MJ qui suspecte chaque coffre',
  'MJ qui fait payer les indices',
  'MJ qui égare le grand méchant',
  'MJ qui donne raison au dragon',
  'MJ qui prend les murs en grippe',
  'MJ qui rate son entrée',
  'MJ qui lance un dé à deux mains',
  'MJ qui confond nord et trésor',
  'MJ qui a peur de ses monstres',
  'MJ qui fait grève du destin',
  'MJ qui réclame un pourboire',
  'MJ qui salue chaque squelette',
  'MJ qui nomme tous les PNJ Bob',
  'MJ qui recycle les tavernes',
  'MJ qui chante les dégâts',
  'MJ qui danse sur les critiques',
  'MJ qui boude sur un 20 naturel',
  'MJ qui applaudit les échecs',
  'MJ qui repasse sa cape',
  'MJ qui polit son rire maléfique',
  'MJ qui révise son air innocent',
  'MJ qui répète « vous êtes sûrs ? »',
  'MJ qui murmure trop fort',
  'MJ qui rugit en sourdine',
  'MJ qui ronfle en draconique',
  'MJ qui bégaie en elfique',
  'MJ qui fait des accents douteux',
  'MJ qui double tous les gardes',
  'MJ qui protège ses figurines',
  'MJ qui peint encore le boss',
  'MJ qui dessine les escaliers',
  'MJ qui perd le fil du donjon',
  'MJ qui oublie le rez-de-chaussée',
  'MJ qui cache la sortie de secours',
  'MJ qui piège même les toilettes',
  'MJ qui facture les résurrections',
  'MJ qui assure les aventuriers',
  'MJ qui vend des dés d’occasion',
  'MJ qui lit le manuel à l’envers',
  'MJ qui annote les parchemins',
  'MJ qui plastifie les malédictions',
  'MJ qui range les sorts par taille',
  'MJ qui arrose les potions',
  'MJ qui goûte le poison',
  'MJ qui soigne son mal de crâne',
  'MJ qui cherche le bouton épique',
  'MJ qui recharge la boule de cristal',
  'MJ qui capte mal le plan astral',
  'MJ qui a oublié le mot magique',
  'MJ qui invoque le service client',
  'MJ qui attend un signe des dés',
  'MJ qui met le destin en attente',
  'MJ qui sous-traite aux kobolds',
  'MJ qui syndique les morts-vivants',
  'MJ qui motive les sbires',
  'MJ qui offre un stage au boss',
  'MJ qui fête le départ de la liche',
  'MJ qui tutoie son familier',
  'MJ qui promène son golem',
  'MJ qui nourrit les gargouilles',
  'MJ qui borde les morts-vivants',
  'MJ qui compte les dents du mimic',
  'MJ qui tricote une cotte de mailles',
  'MJ qui cire les bottes du destin',
  'MJ battu par son propre dé',
  'MJ qui bluffe son propre écran',
  'MJ qui se cache derrière le scénario',
  'MJ qui improvise depuis mille ans',
  'MJ qui prépare un plan B au plan B',
  'MJ qui oublie pourquoi on lance un dé',
  'MJ qui trouve le dragon trop petit',
]

function shuffleCandidates() {
  const candidates = [...CANDIDATES]
  for (let index = candidates.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[candidates[index], candidates[other]] = [candidates[other], candidates[index]]
  }
  return candidates
}

type Stage = 'hidden' | 'loading' | 'success' | 'leaving'

export default function DmStartupModal({ state, message, progress, onRetry }: {
  state: GamePresenceState
  message: string
  progress?: DmStartupProgress | null
  onRetry: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [stage, setStage] = useState<Stage>('hidden')
  const [candidates, setCandidates] = useState(CANDIDATES)
  const [candidate, setCandidate] = useState(0)
  const [estimatedPercent, setEstimatedPercent] = useState(0)
  const visible = stage !== 'hidden'
  const success = stage === 'success' || stage === 'leaving'
  const failed = state === 'error' && !success
  const percent = success ? 100 : failed ? undefined : estimatedPercent
  const progressLabel = success ? 'Le MJ est prêt.' : failed ? 'Préparation interrompue' : progress?.label ?? 'Connexion au MJ…'

  useEffect(() => {
    if (state === 'idle') {
      setStage('hidden')
      return
    }
    if (state === 'ready') {
      if (stage === 'loading') setStage('success')
      if (stage === 'success') {
        const timer = setTimeout(() => setStage('leaving'), 1200)
        return () => clearTimeout(timer)
      }
      if (stage === 'leaving') {
        const timer = setTimeout(() => setStage('hidden'), 240)
        return () => clearTimeout(timer)
      }
      return
    }
    // Already-warm and unmanaged models skip the casting altogether.
    if (stage === 'hidden') {
      const timer = setTimeout(() => {
        setCandidates(shuffleCandidates())
        setCandidate(0)
        setStage('loading')
      }, 350)
      return () => clearTimeout(timer)
    }
    if (stage !== 'loading') setStage('loading')
  }, [state, stage])

  useEffect(() => {
    if (stage !== 'loading') return
    const startedAt = performance.now()
    setEstimatedPercent(0)
    const timer = setInterval(() => {
      // Reserve 100% for actual readiness, even if startup takes longer.
      const elapsed = performance.now() - startedAt
      setEstimatedPercent(Math.min(99, Math.floor(elapsed / STARTUP_DURATION_MS * 99)))
      if (elapsed >= STARTUP_DURATION_MS) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [stage])

  useEffect(() => {
    if (!visible) return
    const dialog = dialogRef.current!
    const previousOverflow = document.body.style.overflow
    const preventDismiss = (event: Event) => event.preventDefault()
    const preventEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') event.preventDefault()
    }
    document.body.style.overflow = 'hidden'
    // Native modal dialogs make the rest of the page inert, including keyboard
    // navigation. Escape and backdrop clicks cannot dismiss the loading state.
    dialog.addEventListener('cancel', preventDismiss)
    dialog.addEventListener('keydown', preventEscape)
    dialog.showModal()
    dialog.focus()
    return () => {
      dialog.removeEventListener('cancel', preventDismiss)
      dialog.removeEventListener('keydown', preventEscape)
      dialog.close()
      document.body.style.overflow = previousOverflow
    }
  }, [visible])

  useEffect(() => {
    if (stage !== 'loading' || failed || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setCandidate(index => (index + 1) % candidates.length), 1900)
    return () => clearInterval(timer)
  }, [stage, failed, candidates.length])

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${stage === 'leaving' ? styles.leaving : ''}`}
      aria-labelledby="dm-startup-title"
      aria-describedby="dm-startup-description"
      tabIndex={-1}
      onCancel={event => event.preventDefault()}
      data-stage={stage}
    >
      <div className={styles.card}>
        <div className={styles.eyebrow}><span />{success ? 'Le casting est terminé' : 'Invocation du maître du jeu'}</div>

        <div className={`${styles.sigil} ${success ? styles.sigilReady : ''}`} aria-hidden="true">
          <div className={styles.orbit} />
          <svg viewBox="0 0 80 88" fill="none">
            {success ? <path d="m22 44 13 13 25-28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : <>
              <path d="M40 5 73 25v38L40 83 7 63V25L40 5Z" />
              <path d="m40 5 18 28 15-8M7 25l15 8L40 5M7 63l15-30h36l15 30M7 63l33-4 33 4M22 33l18 26 18-26M40 59v24" />
            </>}
          </svg>
        </div>

        <h2 id="dm-startup-title" className={styles.title}>
          {success ? 'Votre aventure vous attend.' : failed ? 'Petit contretemps dans les coulisses.' : 'On recrute votre MJ…'}
        </h2>
        <p id="dm-startup-description" className={styles.description}>
          {success ? 'Les dés sont prêts. À vous de jouer.' : failed ? 'Le casting reprendra dès que la connexion sera rétablie.' : 'Un peu de patience. Le casting est… exigeant.'}
        </p>

        <div className={`${styles.reel} ${success ? styles.reelReady : ''}`} aria-hidden="true">
          <div className={styles.selection} />
          {success ? <div className={styles.perfect}>MJ parfait <span>✦</span></div> : <div key={candidate} className={failed ? styles.still : styles.candidates}>
            <div className={styles.ghost}>{candidates[(candidate + 1) % candidates.length]}</div>
            <div className={styles.candidate}>{candidates[candidate]}</div>
            <div className={styles.ghost}>{candidates[(candidate - 1 + candidates.length) % candidates.length]}</div>
          </div>}
        </div>

        <div className={`${styles.progress} ${success ? styles.progressReady : ''}`}>
          <div className={styles.progressHeading} aria-live="polite">
            <span>{progressLabel}</span>
            <span>{percent === undefined ? '' : `${percent} %`}</span>
          </div>
          <div
            className={`${styles.progressTrack} ${percent === undefined && !failed ? styles.indeterminate : ''}`}
            role="progressbar"
            aria-label={success ? 'Préparation du maître du jeu terminée' : progressLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={percent === undefined || success ? progressLabel : `${progressLabel} Progression estimée : ${percent} %`}
          >
            <div className={styles.progressFill} style={{ width: `${percent ?? 0}%` }} />
          </div>
          {!success && !failed && <p className={styles.progressNote}>Progression estimée sur 15 minutes. Le jeu sera accessible dès que le MJ sera prêt.</p>}
        </div>

        <div className={styles.footer} role={failed ? 'alert' : 'status'} aria-live="polite">
          {success ? <span className={styles.readyLabel}>MJ parfait. Que l’aventure commence !</span>
            : failed ? <span className={styles.error}>{message}</span>
              : <><span className={styles.dots} aria-hidden="true"><i /><i /><i /></span><span>Votre maître du jeu se prépare</span></>}
        </div>
        {failed ? <div className={styles.actions}>
          <button type="button" onClick={onRetry}>Réessayer</button>
          <Link href="/">Retour à l’accueil</Link>
        </div> : <p className={styles.footnote}>{success ? 'Promis, il sait où il a rangé ses dés.' : 'Les bonnes histoires méritent le bon narrateur.'}</p>}
      </div>
    </dialog>
  )
}
