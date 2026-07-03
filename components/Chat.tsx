'use client'

import { useCallback, useEffect, useRef, useState, KeyboardEvent } from 'react'
import { ChatMessage, DMClientMeta, GameState } from '@/lib/types'

interface ChatProps {
  messages: ChatMessage[]
  isLoading: boolean
  gameState: GameState
  onSendMessage: (text: string, clientMeta?: DMClientMeta) => void
  inputValue: string
  onInputChange: (v: string) => void
  onClientEvent?: (event: string, payload: Record<string, unknown>) => void
  // Placeholders du champ de saisie par salle (clé 'default' = repli), fournis
  // par le module d'aventure actif.
  placeholders?: Record<string, string[]>
  // Indices de statut par salle (hors combat), fournis par le module actif.
  roomStatusHints?: Record<string, string>
}

interface BrowserSpeechRecognitionAlternative {
  transcript: string
  confidence?: number
}

interface BrowserSpeechRecognitionResult {
  isFinal: boolean
  length: number
  item?: (index: number) => BrowserSpeechRecognitionAlternative
  [index: number]: BrowserSpeechRecognitionAlternative
}

interface BrowserSpeechRecognitionResultList {
  length: number
  item?: (index: number) => BrowserSpeechRecognitionResult
  [index: number]: BrowserSpeechRecognitionResult
}

interface BrowserSpeechRecognitionEvent extends Event {
  resultIndex: number
  results: BrowserSpeechRecognitionResultList
}

interface BrowserSpeechRecognitionErrorEvent extends Event {
  error?: string
  message?: string
}

interface BrowserSpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onaudiostart: ((event: Event) => void) | null
  onstart: ((event: Event) => void) | null
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null
  onend: ((event: Event) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition

interface SpeechWindow extends Window {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
}

const VOICE_LANGUAGE = 'fr-FR'
const MAX_SPOKEN_SENTENCES = 7
const MAX_SPOKEN_CHARS = 650
const MAX_SPEECH_SEGMENT_CHARS = 320
const MAX_RECOGNITION_AUTO_RESTARTS = 20
const MAX_RECOGNITION_SESSION_MS = 120_000
const RECOGNITION_RESTART_DELAY_MS = 160

// Placeholders GÉNÉRIQUES, indépendants du module (états combat/agonie/dialogue,
// et repli d'exploration). Les invites propres à un module (par salle) viennent
// de sa définition (chatPlaceholders) — voir selectPlaceholder.
const PLACEHOLDERS = {
  combat: [
    'Frapper le plus proche, reculer vers la porte, tenter une intimidation...',
    'Lever le bouclier, viser le chef, renverser une table...',
  ],
  dying: [
    'Lancer le jet de mort, souffler un dernier mot, espérer un miracle...',
    'Tenir bon, compter les battements, défier le noir...',
  ],
  dialogue: [
    'Mentir avec aplomb, proposer un marché, demander le détail qui fâche...',
    'Sourire trop fort, négocier un passage, débusquer le mensonge...',
  ],
  exploration: [
    "Fouiller les lieux, écouter derrière une porte, suivre une piste...",
    "Avancer prudemment, tenter un plan bancal, se fier à son instinct...",
  ],
}

function pick(list: string[], index: number): string {
  return list[index % list.length]
}

function selectPlaceholder(
  gameState: GameState,
  messageCount: number,
  adventurePlaceholders?: Record<string, string[]>
): string {
  // États génériques (combat, agonie, dialogue) : indépendants du module.
  if (gameState.player.hp.current <= 0) return pick(PLACEHOLDERS.dying, messageCount)
  if (gameState.phase === 'combat') return pick(PLACEHOLDERS.combat, messageCount)
  if (gameState.phase === 'dialogue') return pick(PLACEHOLDERS.dialogue, messageCount)

  // Exploration : placeholders du module actif (par salle, puis 'default'),
  // avec repli sur les invites d'exploration génériques.
  const roomId = gameState.currentRoomId
  const fromAdventure = (roomId && adventurePlaceholders?.[roomId]) || adventurePlaceholders?.default
  if (fromAdventure && fromAdventure.length > 0) return pick(fromAdventure, messageCount)

  return pick(PLACEHOLDERS.exploration, messageCount)
}

function getSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const speechWindow = window as SpeechWindow
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

function getSpeechResult(
  results: BrowserSpeechRecognitionResultList,
  index: number
): BrowserSpeechRecognitionResult | null {
  return results.item?.(index) ?? results[index] ?? null
}

function getSpeechAlternative(
  result: BrowserSpeechRecognitionResult,
  index: number
): BrowserSpeechRecognitionAlternative | null {
  return result.item?.(index) ?? result[index] ?? null
}

function findLastDmMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'dm') return messages[index]
  }

  return null
}

function textForSpeech(text: string): string {
  const cleaned = text
    .replace(/\[[^\]]+\]/g, '')
    .replace(/[*_`#>]/g, '')
    .replace(/\bHP\b/gi, 'points de vie')
    .replace(/\bPV\b/gi, 'points de vie')
    .replace(/\bCA\b/g, "classe d'armure")
    .replace(/\bDD\b/g, 'degré de difficulté')
    .replace(/\b(\d+)d(\d+)\b/gi, (_, count: string, sides: string) =>
      `${count} de ${sides}`
    )
    .replace(/\b\d{2,}\b/g, match => match.split('').join(' '))
    .replace(/\s+/g, ' ')
    .trim()

  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map(sentence => sentence.trim())
    .filter(Boolean) ?? []

  if (cleaned.length <= MAX_SPOKEN_CHARS) {
    return cleaned
  }

  const selectedSentences = sentences.slice(0, MAX_SPOKEN_SENTENCES)
  let spokenText = selectedSentences.join(' ')
  if (!spokenText) return ''

  if (spokenText.length > MAX_SPOKEN_CHARS) {
    const clipped = spokenText.slice(0, MAX_SPOKEN_CHARS)
    spokenText = clipped.slice(0, Math.max(0, clipped.lastIndexOf(' '))).trim()
  }

  return spokenText
}

function voiceScore(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase()
  const lang = voice.lang.toLowerCase()
  let score = 0

  if (lang === 'fr-fr') score += 100
  else if (lang.startsWith('fr')) score += 70
  if (voice.localService === false) score += 8
  if (/natural|neural|online|premium|cloud/.test(name)) score += 45
  if (/google|apple|siri|microsoft/.test(name)) score += 25
  if (/denise|henri|vivienne|thomas|paul|julie/.test(name)) score += 15
  if (/desktop|mobile/.test(name)) score -= 10
  if (/hortense/.test(name)) score -= 60

  return score
}

function getSortedFrenchVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices
    .filter(voice => voice.lang.toLowerCase().startsWith('fr'))
    .sort((a, b) => voiceScore(b) - voiceScore(a))
}

function pickFrenchVoice(voices: SpeechSynthesisVoice[], selectedVoiceURI?: string): SpeechSynthesisVoice | null {
  if (selectedVoiceURI) {
    const selected = voices.find(voice => voice.voiceURI === selectedVoiceURI)
    if (selected) return selected
  }

  return getSortedFrenchVoices(voices)[0] ?? null
}

function splitSpeechSegments(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map(sentence => sentence.trim())
    .filter(Boolean) ?? [text]
  const segments: string[] = []

  for (const sentence of sentences) {
    if (sentence.length <= MAX_SPEECH_SEGMENT_CHARS) {
      segments.push(sentence)
      continue
    }

    const parts = sentence.split(/([,;:])/)
    let current = ''
    for (let index = 0; index < parts.length; index += 2) {
      const clause = `${parts[index] ?? ''}${parts[index + 1] ?? ''}`.trim()
      if (!clause) continue

      if (`${current} ${clause}`.trim().length > MAX_SPEECH_SEGMENT_CHARS && current) {
        segments.push(current.trim())
        current = clause
      } else {
        current = `${current} ${clause}`.trim()
      }
    }
    if (current) segments.push(current)
  }

  return segments
}

function truncateVoiceLogText(value: string, maxLength = 260): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength)}...[truncated ${value.length - maxLength} chars]`
}

function playerMovementAllowance(gameState: GameState): number {
  return Math.floor(gameState.player.speed / 5)
}

function describePlayerTurn(gameState: GameState, roomStatusHints?: Record<string, string>): string {
  if (gameState.phase !== 'combat') {
    // Indice de statut propre à la salle courante, fourni par le module actif.
    const hint = gameState.currentRoomId ? roomStatusHints?.[gameState.currentRoomId] : undefined
    if (hint) return hint
    return 'Dis ce que tu fais, ce que tu demandes, ou le risque que tu prends.'
  }

  if (gameState.currentTurn !== 'player') {
    return 'Les adversaires agissent; garde ton souffle une seconde.'
  }

  if (gameState.player.hp.current <= 0) {
    return "Tu es au sol: tiens bon, appelle a l'aide, ou laisse partir le jet de mort."
  }

  const movementUsed = gameState.movementUsed.player ?? 0
  const movementLeft = Math.max(0, playerMovementAllowance(gameState) - movementUsed)
  const actionText = gameState.actionUsed.player ? 'action deja prise' : 'action dispo'
  return `A toi: ${actionText}, ${movementLeft} case${movementLeft > 1 ? 's' : ''} de mouvement, attaque, potion, parole ou passe.`
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'dm') {
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[10px] text-amber-700 uppercase tracking-widest font-semibold pl-1">
          Dungeon Master
        </span>
        <div className="min-w-0 break-words bg-stone-800/60 border-l-2 border-amber-700/60 rounded-r-lg px-3 py-2 text-stone-200 italic leading-relaxed text-sm font-serif">
          {msg.content}
        </div>
      </div>
    )
  }

  if (msg.role === 'player') {
    return (
      <div className="flex min-w-0 flex-col items-end gap-0.5">
        <span className="text-[10px] text-blue-600 uppercase tracking-widest font-semibold pr-1">
          Vous
        </span>
        <div className="min-w-0 max-w-[85%] break-words bg-blue-900/30 border border-blue-800/40 rounded-lg px-3 py-2 text-blue-100 text-sm">
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0 break-words bg-stone-950 border border-stone-700/50 rounded px-3 py-2 font-mono text-xs text-emerald-400 leading-relaxed">
      <span className="text-stone-500 mr-1">d20</span>
      {msg.content}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-amber-700 uppercase tracking-widest font-semibold pl-1">
        Dungeon Master
      </span>
      <div className="bg-stone-800/60 border-l-2 border-amber-700/60 rounded-r-lg px-3 py-2.5 flex items-center gap-1">
        <span className="w-1.5 h-1.5 bg-amber-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-amber-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-amber-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}

export default function Chat({
  messages,
  isLoading,
  gameState,
  onSendMessage,
  inputValue,
  onInputChange,
  onClientEvent,
  placeholders,
  roomStatusHints,
}: ChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const finalTranscriptRef = useRef('')
  const speechPreviewRef = useRef('')
  const recognitionEngineRef = useRef<string | undefined>(undefined)
  const lastSpokenMessageIdRef = useRef<string | null>(null)
  const speechRunIdRef = useRef(0)
  const keepRecognitionAliveRef = useRef(false)
  const manualStopRequestedRef = useRef(false)
  const recognitionRestartCountRef = useRef(0)
  const recognitionStartedAtRef = useRef(0)

  const [recognitionSupported, setRecognitionSupported] = useState(false)
  const [speechSynthesisSupported, setSpeechSynthesisSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [speechPreview, setSpeechPreview] = useState('')
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [speakerEnabled, setSpeakerEnabled] = useState(false)
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | undefined>(undefined)

  const placeholder = selectPlaceholder(gameState, messages.length, placeholders)

  const logVoiceEvent = useCallback((event: string, payload: Record<string, unknown>) => {
    onClientEvent?.(event, {
      ...payload,
      voiceCostModel: 'browser-only',
      noServerAudioUpload: true,
      extraLlmCallsFromVoice: 0,
    })
  }, [onClientEvent])

  const stopSpeaking = useCallback((reason: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) return

    speechRunIdRef.current += 1
    window.speechSynthesis.cancel()
    logVoiceEvent('client.voice.tts.cancelled', { reason })
  }, [logVoiceEvent])

  const speakDmMessage = useCallback((msg: ChatMessage) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      return
    }

    const spokenText = textForSpeech(msg.content)
    if (!spokenText || msg.content.startsWith('[Erreur')) return

    stopSpeaking('new_dm_message')

    const voice = pickFrenchVoice(availableVoices, selectedVoiceURI)
    const segments = splitSpeechSegments(spokenText)
    const runId = speechRunIdRef.current + 1
    speechRunIdRef.current = runId

    logVoiceEvent('client.voice.tts.started', {
      provider: 'browser-speech-synthesis',
      language: VOICE_LANGUAGE,
      voiceName: voice?.name,
      voiceURI: voice?.voiceURI,
      voiceScore: voice ? voiceScore(voice) : null,
      messageId: msg.id,
      textChars: spokenText.length,
      originalTextChars: msg.content.length,
      segmentCount: segments.length,
      shortenedForSpeech: spokenText.length < msg.content.length,
    })

    const speakSegment = (index: number) => {
      if (speechRunIdRef.current !== runId) return
      const segment = segments[index]
      if (!segment) {
        logVoiceEvent('client.voice.tts.ended', {
          provider: 'browser-speech-synthesis',
          messageId: msg.id,
          textChars: spokenText.length,
          segmentCount: segments.length,
        })
        return
      }

      const utterance = new SpeechSynthesisUtterance(segment)
      utterance.lang = voice?.lang ?? VOICE_LANGUAGE
      utterance.rate = 0.98
      utterance.pitch = 1.02
      utterance.volume = 1
      if (voice) utterance.voice = voice

      utterance.onend = () => {
        window.setTimeout(() => speakSegment(index + 1), 60)
      }

      utterance.onerror = event => {
        logVoiceEvent('client.voice.tts.error', {
          provider: 'browser-speech-synthesis',
          messageId: msg.id,
          segmentIndex: index,
          error: event.error,
        })
      }

      window.speechSynthesis.speak(utterance)
    }

    speakSegment(0)
  }, [availableVoices, logVoiceEvent, selectedVoiceURI, stopSpeaking])

  useEffect(() => {
    const recognitionConstructor = getSpeechRecognitionConstructor()
    const synthesisSupported =
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      'SpeechSynthesisUtterance' in window

    function refreshVoices() {
      if (!synthesisSupported) return

      const frenchVoices = getSortedFrenchVoices(window.speechSynthesis.getVoices())
      setAvailableVoices(frenchVoices)
      setSelectedVoiceURI(current => {
        if (current && frenchVoices.some(voice => voice.voiceURI === current)) return current
        return frenchVoices[0]?.voiceURI
      })

      logVoiceEvent('client.voice.tts.voices_loaded', {
        provider: 'browser-speech-synthesis',
        voiceCount: frenchVoices.length,
        voices: frenchVoices.slice(0, 8).map(voice => ({
          name: voice.name,
          lang: voice.lang,
          localService: voice.localService,
          score: voiceScore(voice),
        })),
      })
    }

    setRecognitionSupported(Boolean(recognitionConstructor))
    setSpeechSynthesisSupported(synthesisSupported)
    recognitionEngineRef.current = recognitionConstructor?.name
    refreshVoices()

    if (synthesisSupported) {
      window.speechSynthesis.addEventListener('voiceschanged', refreshVoices)
    }

    logVoiceEvent('client.voice.support.detected', {
      recognitionSupported: Boolean(recognitionConstructor),
      speechSynthesisSupported: synthesisSupported,
      recognitionEngine: recognitionConstructor?.name,
      language: VOICE_LANGUAGE,
    })

    return () => {
      keepRecognitionAliveRef.current = false
      manualStopRequestedRef.current = true
      recognitionRef.current?.abort()
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices)
        window.speechSynthesis.cancel()
      }
    }
  }, [logVoiceEvent])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (lastSpokenMessageIdRef.current) return
    const lastDm = findLastDmMessage(messages)
    if (lastDm) lastSpokenMessageIdRef.current = lastDm.id
  }, [messages])

  useEffect(() => {
    if (!speakerEnabled || !speechSynthesisSupported) return

    const lastDm = findLastDmMessage(messages)
    if (!lastDm || lastDm.id === lastSpokenMessageIdRef.current) return

    lastSpokenMessageIdRef.current = lastDm.id
    speakDmMessage(lastDm)
  }, [messages, speakerEnabled, speechSynthesisSupported, speakDmMessage])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSend() {
    const text = inputValue.trim()
    if (!text || isLoading) return
    onSendMessage(text, { inputMode: 'text' })
    inputRef.current?.focus()
  }

  function handleToggleSpeaker() {
    const nextEnabled = !speakerEnabled
    if (!nextEnabled) {
      stopSpeaking('speaker_disabled')
    } else {
      const lastDm = findLastDmMessage(messages)
      if (lastDm) lastSpokenMessageIdRef.current = lastDm.id
    }

    setSpeakerEnabled(nextEnabled)
    logVoiceEvent('client.voice.tts.preference_changed', {
      enabled: nextEnabled,
      provider: 'browser-speech-synthesis',
    })
  }

  function completeVoiceTurn(transcript: string) {
    const text = transcript.trim()
    if (!text) {
      logVoiceEvent('client.voice.recognition.discarded', {
        reason: 'empty_final_transcript',
        previewChars: speechPreviewRef.current.length,
      })
      return
    }

    if (isLoading) {
      logVoiceEvent('client.voice.recognition.discarded', {
        reason: 'dm_request_in_progress',
        transcriptChars: text.length,
      })
      return
    }

    const clientMeta: DMClientMeta = {
      inputMode: 'voice',
      voice: {
        inputProvider: 'browser-speech-recognition',
        outputProvider: speakerEnabled ? 'browser-speech-synthesis' : undefined,
        transcriptChars: text.length,
        finalTranscriptOnly: true,
        noServerAudioUpload: true,
        language: VOICE_LANGUAGE,
        recognitionEngine: recognitionEngineRef.current,
      },
    }

    onInputChange(text)
    logVoiceEvent('client.voice.recognition.sent', {
      provider: 'browser-speech-recognition',
      language: VOICE_LANGUAGE,
      recognitionEngine: recognitionEngineRef.current,
      transcriptChars: text.length,
      transcriptPreview: truncateVoiceLogText(text),
      finalTranscriptOnly: true,
    })
    onSendMessage(text, clientMeta)
  }

  function handleMicClick() {
    if (isListening) {
      keepRecognitionAliveRef.current = false
      manualStopRequestedRef.current = true
      recognitionRef.current?.stop()
      logVoiceEvent('client.voice.recognition.stop_requested', {
        reason: 'player_clicked_send',
        transcriptChars: finalTranscriptRef.current.length,
        previewChars: speechPreviewRef.current.length,
      })
      return
    }

    if (isLoading) return

    const RecognitionConstructor = getSpeechRecognitionConstructor()
    if (!RecognitionConstructor) {
      setVoiceError('Micro indisponible sur ce navigateur.')
      logVoiceEvent('client.voice.recognition.unavailable', {
        reason: 'missing_browser_api',
      })
      return
    }

    stopSpeaking('microphone_started')
    if (speechSynthesisSupported && !speakerEnabled) {
      setSpeakerEnabled(true)
      const lastDm = findLastDmMessage(messages)
      if (lastDm) lastSpokenMessageIdRef.current = lastDm.id
      logVoiceEvent('client.voice.tts.preference_changed', {
        enabled: true,
        provider: 'browser-speech-synthesis',
        reason: 'voice_input_started',
      })
    }

    const recognition = new RecognitionConstructor()
    recognition.lang = VOICE_LANGUAGE
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    finalTranscriptRef.current = ''
    speechPreviewRef.current = ''
    keepRecognitionAliveRef.current = true
    manualStopRequestedRef.current = false
    recognitionRestartCountRef.current = 0
    recognitionStartedAtRef.current = Date.now()
    setSpeechPreview('')
    setVoiceError(null)
    recognitionRef.current = recognition

    recognition.onstart = () => {
      setIsListening(true)
      logVoiceEvent('client.voice.recognition.started', {
        provider: 'browser-speech-recognition',
        language: recognition.lang,
        continuous: recognition.continuous,
        interimResults: recognition.interimResults,
        finalTranscriptOnly: true,
      })
    }

    recognition.onresult = event => {
      let interimTranscript = ''
      let latestConfidence: number | undefined

      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = getSpeechResult(event.results, index)
        if (!result) continue

        const alternative = getSpeechAlternative(result, 0)
        const transcript = alternative?.transcript?.trim()
        if (!transcript) continue

        latestConfidence = alternative?.confidence
        if (result.isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${transcript}`.trim()
        } else {
          interimTranscript = `${interimTranscript} ${transcript}`.trim()
        }
      }

      const preview = `${finalTranscriptRef.current} ${interimTranscript}`.trim()
      speechPreviewRef.current = preview
      setSpeechPreview(preview)

      if (finalTranscriptRef.current) {
        logVoiceEvent('client.voice.recognition.final_result', {
          provider: 'browser-speech-recognition',
          transcriptChars: finalTranscriptRef.current.length,
          confidence: latestConfidence,
        })
      }
    }

    recognition.onerror = event => {
      const code = event.error ?? 'unknown'
      const message =
        code === 'not-allowed'
          ? 'Micro refuse par le navigateur.'
          : code === 'no-speech'
            ? 'Rien entendu.'
            : 'Micro interrompu.'

      const canRecoverFromNoSpeech =
        code === 'no-speech' &&
        keepRecognitionAliveRef.current &&
        !manualStopRequestedRef.current
      if (!canRecoverFromNoSpeech) setVoiceError(message)
      logVoiceEvent('client.voice.recognition.error', {
        provider: 'browser-speech-recognition',
        error: code,
        message: event.message,
        autoRestartPending: keepRecognitionAliveRef.current && !manualStopRequestedRef.current,
      })
    }

    recognition.onend = () => {
      const transcript = finalTranscriptRef.current || speechPreviewRef.current
      const sessionAgeMs = Date.now() - recognitionStartedAtRef.current
      const shouldAutoRestart =
        keepRecognitionAliveRef.current &&
        !manualStopRequestedRef.current &&
        !isLoading &&
        recognitionRestartCountRef.current < MAX_RECOGNITION_AUTO_RESTARTS &&
        sessionAgeMs < MAX_RECOGNITION_SESSION_MS

      if (shouldAutoRestart) {
        recognitionRestartCountRef.current += 1
        logVoiceEvent('client.voice.recognition.auto_restart', {
          provider: 'browser-speech-recognition',
          restartCount: recognitionRestartCountRef.current,
          transcriptChars: transcript.trim().length,
          sessionAgeMs,
        })

        window.setTimeout(() => {
          if (!keepRecognitionAliveRef.current || manualStopRequestedRef.current || isLoading) return

          try {
            recognition.start()
          } catch (err) {
            keepRecognitionAliveRef.current = false
            recognitionRef.current = null
            setIsListening(false)
            const message = err instanceof Error ? err.message : 'Erreur micro.'
            setVoiceError(message)
            logVoiceEvent('client.voice.recognition.restart_failed', {
              provider: 'browser-speech-recognition',
              restartCount: recognitionRestartCountRef.current,
              error: message,
            })
            completeVoiceTurn(transcript)
          }
        }, RECOGNITION_RESTART_DELAY_MS)
        return
      }

      setIsListening(false)
      recognitionRef.current = null
      keepRecognitionAliveRef.current = false
      manualStopRequestedRef.current = false
      finalTranscriptRef.current = ''
      speechPreviewRef.current = ''
      setSpeechPreview('')

      logVoiceEvent('client.voice.recognition.ended', {
        provider: 'browser-speech-recognition',
        transcriptChars: transcript.trim().length,
        restartCount: recognitionRestartCountRef.current,
        sessionAgeMs,
        reason: sessionAgeMs >= MAX_RECOGNITION_SESSION_MS ? 'session_limit' : 'player_sent',
      })
      completeVoiceTurn(transcript)
    }

    try {
      recognition.start()
    } catch (err) {
      recognitionRef.current = null
      setIsListening(false)
      const message = err instanceof Error ? err.message : 'Erreur micro.'
      setVoiceError(message)
      logVoiceEvent('client.voice.recognition.start_failed', {
        provider: 'browser-speech-recognition',
        error: message,
      })
    }
  }

  const playerTurnStatus = describePlayerTurn(gameState, roomStatusHints)
  const voiceStatus = voiceError
    ? voiceError
    : isListening
      ? speechPreview || `Je t'ecoute. ${playerTurnStatus}`
      : speechPreview || playerTurnStatus

  return (
    <div className="flex flex-col h-full bg-stone-900/50 rounded-lg border border-amber-900/30 overflow-hidden">
      <div className="px-3 sm:px-4 py-2.5 border-b border-amber-900/30 bg-stone-900/80 flex flex-wrap items-center gap-2 flex-shrink-0">
        <div className="w-2 h-2 bg-amber-600 rounded-full" />
        <span className="flex-1 min-w-[9rem] text-amber-500 font-semibold text-sm tracking-wide leading-tight">Journal de l&apos;Aventure</span>
        <div className="w-full sm:w-auto sm:ml-auto flex items-center justify-start sm:justify-end gap-1 min-w-0">
          {availableVoices.length > 1 && (
            <select
              value={selectedVoiceURI ?? ''}
              onChange={event => {
                setSelectedVoiceURI(event.target.value || undefined)
                const voice = availableVoices.find(item => item.voiceURI === event.target.value)
                logVoiceEvent('client.voice.tts.voice_selected', {
                  provider: 'browser-speech-synthesis',
                  voiceName: voice?.name,
                  voiceURI: voice?.voiceURI,
                  voiceScore: voice ? voiceScore(voice) : null,
                })
              }}
              title="Choisir la voix du narrateur"
              aria-label="Choisir la voix du narrateur"
              className="hidden sm:block h-7 max-w-32 rounded border border-stone-700 bg-stone-800 px-1.5 text-[11px] text-stone-200"
            >
              {availableVoices.slice(0, 8).map(voice => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name.replace(/\s*-\s*French.*$/i, '')}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={handleToggleSpeaker}
            disabled={!speechSynthesisSupported}
            title="Lire les réponses du DM à voix haute"
            aria-label="Lire les réponses du DM à voix haute"
            className={`hidden sm:flex h-7 min-w-[4.25rem] items-center justify-center rounded border px-2 text-[11px] font-semibold transition-colors ${
              speakerEnabled
                ? 'border-amber-500/60 bg-amber-800/70 text-amber-50'
                : 'border-stone-700 bg-stone-800 text-stone-300 hover:bg-stone-700'
            } disabled:opacity-40`}
          >
            <span className="sm:hidden">Voix</span>
            <span className="hidden sm:inline">{speakerEnabled ? 'Voix ON' : 'Voix OFF'}</span>
          </button>
          <button
            type="button"
            onClick={handleMicClick}
            disabled={!recognitionSupported || isLoading}
            title="Parler au Dungeon Master"
            aria-label="Parler au Dungeon Master"
            className={`h-7 min-w-[3rem] sm:min-w-[4rem] rounded border px-1.5 sm:px-2 text-[10px] sm:text-[11px] font-semibold transition-colors ${
              isListening
                ? 'border-red-400/70 bg-red-900/70 text-red-50'
                : 'border-blue-500/50 bg-blue-950/60 text-blue-100 hover:bg-blue-900/70'
            } disabled:opacity-40`}
          >
            {isListening ? 'Envoyer' : 'Mic'}
          </button>
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin scrollbar-thumb-stone-700">
        {messages.length === 0 && (
          <div className="text-center text-stone-600 text-sm italic mt-8 px-4">
            La table est prete. Tentez quelque chose de brillant, douteux, ou les deux.
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {isLoading && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>

      <div className="flex-shrink-0 border-t border-amber-900/30 p-3 bg-stone-900/80">
        <div className="flex min-w-0 gap-2 items-end">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading || isListening}
            rows={2}
            className="min-w-0 flex-1 bg-stone-800/80 border border-stone-600/50 rounded-lg px-3 py-2 text-stone-200 placeholder-stone-600 text-sm resize-none focus:outline-none focus:border-amber-700/60 disabled:opacity-50 leading-relaxed"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || isListening || !inputValue.trim()}
            className="flex-shrink-0 px-4 py-2 bg-amber-800 hover:bg-amber-700 disabled:bg-stone-700 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors h-[4.5rem] flex items-center justify-center"
          >
            {isLoading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              'Jouer'
            )}
          </button>
        </div>
        <div className={`text-[10px] mt-1 pl-1 min-h-4 ${voiceError ? 'text-red-400' : isListening ? 'text-blue-300' : 'text-stone-600'}`}>
          {voiceStatus}
        </div>
      </div>
    </div>
  )
}
