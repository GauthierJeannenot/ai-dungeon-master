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

const PLACEHOLDERS = {
  combat: [
    'Frapper le plus proche, reculer vers la porte, tenter une intimidation...',
    'Lever le bouclier, viser le chef, renverser une table...',
  ],
  dialogue: [
    'Mentir avec aplomb, proposer un marche, demander le detail qui fache...',
    'Sourire trop fort, negocier la recette, accuser une odeur suspecte...',
  ],
  bakeryEntrance: [
    "Amadouer l'arbre, forcer la porte, accuser une pomme d'espionnage...",
    "Inspecter l'ecorce, toquer a la porte, flairer le piege a tarte...",
  ],
  bakeryFloor: [
    'Negocier avec Grukk, lever le bouclier, demander qui tient la recette...',
    'Observer les gobelins, chercher une sortie, parler plus fort que le danger...',
  ],
  exploration: [
    "Fouiller les comptoirs, ecouter derriere une porte, suivre l'odeur de cannelle...",
    'Avancer prudemment, tenter un plan bancal, faire confiance au nez...',
  ],
}

function selectPlaceholder(gameState: GameState, messageCount: number): string {
  if (gameState.phase === 'combat') {
    return PLACEHOLDERS.combat[messageCount % PLACEHOLDERS.combat.length]
  }

  if (gameState.phase === 'dialogue') {
    return PLACEHOLDERS.dialogue[messageCount % PLACEHOLDERS.dialogue.length]
  }

  if (gameState.currentRoomId === '9' || gameState.currentRoomId === '8' || gameState.currentRoomId === '7') {
    return PLACEHOLDERS.bakeryFloor[messageCount % PLACEHOLDERS.bakeryFloor.length]
  }

  if (!gameState.currentRoomId || gameState.currentRoomId === '1') {
    return PLACEHOLDERS.bakeryEntrance[messageCount % PLACEHOLDERS.bakeryEntrance.length]
  }

  return PLACEHOLDERS.exploration[messageCount % PLACEHOLDERS.exploration.length]
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
  return text
    .replace(/\[[^\]]+\]/g, '')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function pickFrenchVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null

  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find(voice => voice.lang.toLowerCase() === 'fr-fr') ??
    voices.find(voice => voice.lang.toLowerCase().startsWith('fr')) ??
    null
  )
}

function truncateVoiceLogText(value: string, maxLength = 260): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength)}...[truncated ${value.length - maxLength} chars]`
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'dm') {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-amber-700 uppercase tracking-widest font-semibold pl-1">
          Dungeon Master
        </span>
        <div className="bg-stone-800/60 border-l-2 border-amber-700/60 rounded-r-lg px-3 py-2 text-stone-200 italic leading-relaxed text-sm font-serif">
          {msg.content}
        </div>
      </div>
    )
  }

  if (msg.role === 'player') {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-[10px] text-blue-600 uppercase tracking-widest font-semibold pr-1">
          Vous
        </span>
        <div className="bg-blue-900/30 border border-blue-800/40 rounded-lg px-3 py-2 text-blue-100 text-sm max-w-[85%]">
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-stone-950 border border-stone-700/50 rounded px-3 py-2 font-mono text-xs text-emerald-400 leading-relaxed">
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
}: ChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const finalTranscriptRef = useRef('')
  const speechPreviewRef = useRef('')
  const recognitionEngineRef = useRef<string | undefined>(undefined)
  const lastSpokenMessageIdRef = useRef<string | null>(null)

  const [recognitionSupported, setRecognitionSupported] = useState(false)
  const [speechSynthesisSupported, setSpeechSynthesisSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [speechPreview, setSpeechPreview] = useState('')
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [speakerEnabled, setSpeakerEnabled] = useState(false)

  const placeholder = selectPlaceholder(gameState, messages.length)

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

    const utterance = new SpeechSynthesisUtterance(spokenText)
    utterance.lang = VOICE_LANGUAGE
    utterance.rate = 1.02
    utterance.pitch = 0.95
    const voice = pickFrenchVoice()
    if (voice) utterance.voice = voice

    utterance.onstart = () => {
      logVoiceEvent('client.voice.tts.started', {
        provider: 'browser-speech-synthesis',
        language: utterance.lang,
        voiceName: utterance.voice?.name,
        messageId: msg.id,
        textChars: spokenText.length,
      })
    }

    utterance.onend = () => {
      logVoiceEvent('client.voice.tts.ended', {
        provider: 'browser-speech-synthesis',
        messageId: msg.id,
        textChars: spokenText.length,
      })
    }

    utterance.onerror = event => {
      logVoiceEvent('client.voice.tts.error', {
        provider: 'browser-speech-synthesis',
        messageId: msg.id,
        error: event.error,
      })
    }

    window.speechSynthesis.speak(utterance)
  }, [logVoiceEvent, stopSpeaking])

  useEffect(() => {
    const recognitionConstructor = getSpeechRecognitionConstructor()
    const synthesisSupported =
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      'SpeechSynthesisUtterance' in window

    setRecognitionSupported(Boolean(recognitionConstructor))
    setSpeechSynthesisSupported(synthesisSupported)
    recognitionEngineRef.current = recognitionConstructor?.name

    logVoiceEvent('client.voice.support.detected', {
      recognitionSupported: Boolean(recognitionConstructor),
      speechSynthesisSupported: synthesisSupported,
      recognitionEngine: recognitionConstructor?.name,
      language: VOICE_LANGUAGE,
    })

    return () => {
      recognitionRef.current?.abort()
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
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
      recognitionRef.current?.stop()
      logVoiceEvent('client.voice.recognition.stop_requested', {
        reason: 'player_clicked_stop',
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
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    finalTranscriptRef.current = ''
    speechPreviewRef.current = ''
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

      setVoiceError(message)
      logVoiceEvent('client.voice.recognition.error', {
        provider: 'browser-speech-recognition',
        error: code,
        message: event.message,
      })
    }

    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null

      const transcript = finalTranscriptRef.current
      finalTranscriptRef.current = ''
      speechPreviewRef.current = ''
      setSpeechPreview('')

      logVoiceEvent('client.voice.recognition.ended', {
        provider: 'browser-speech-recognition',
        transcriptChars: transcript.trim().length,
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

  const voiceStatus = voiceError
    ? voiceError
    : isListening
      ? speechPreview || "Je t'ecoute. Lance ton plan."
      : speechPreview || "Osez le plan bancal. Les des adorent le chaos."

  return (
    <div className="flex flex-col h-full bg-stone-900/50 rounded-lg border border-amber-900/30 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-amber-900/30 bg-stone-900/80 flex items-center gap-2 flex-shrink-0">
        <div className="w-2 h-2 bg-amber-600 rounded-full" />
        <span className="text-amber-500 font-semibold text-sm tracking-wide">Journal de l&apos;Aventure</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={handleToggleSpeaker}
            disabled={!speechSynthesisSupported}
            title="Lire les reponses du DM a voix haute"
            aria-label="Lire les reponses du DM a voix haute"
            className={`h-7 min-w-[4.25rem] rounded border px-2 text-[11px] font-semibold transition-colors ${
              speakerEnabled
                ? 'border-amber-500/60 bg-amber-800/70 text-amber-50'
                : 'border-stone-700 bg-stone-800 text-stone-300 hover:bg-stone-700'
            } disabled:opacity-40`}
          >
            {speakerEnabled ? 'Voix ON' : 'Voix OFF'}
          </button>
          <button
            type="button"
            onClick={handleMicClick}
            disabled={!recognitionSupported || isLoading}
            title="Parler au Dungeon Master"
            aria-label="Parler au Dungeon Master"
            className={`h-7 min-w-[4rem] rounded border px-2 text-[11px] font-semibold transition-colors ${
              isListening
                ? 'border-red-400/70 bg-red-900/70 text-red-50'
                : 'border-blue-500/50 bg-blue-950/60 text-blue-100 hover:bg-blue-900/70'
            } disabled:opacity-40`}
          >
            {isListening ? 'Stop' : 'Mic'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin scrollbar-thumb-stone-700">
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
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading || isListening}
            rows={2}
            className="flex-1 bg-stone-800/80 border border-stone-600/50 rounded-lg px-3 py-2 text-stone-200 placeholder-stone-600 text-sm resize-none focus:outline-none focus:border-amber-700/60 disabled:opacity-50 leading-relaxed"
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
