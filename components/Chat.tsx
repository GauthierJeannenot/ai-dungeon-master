'use client'

import { useEffect, useRef, KeyboardEvent } from 'react'
import { ChatMessage } from '@/lib/types'

interface ChatProps {
  messages: ChatMessage[]
  isLoading: boolean
  onSendMessage: (text: string) => void
  inputValue: string
  onInputChange: (v: string) => void
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

  // Mechanical result — monospace dark box
  return (
    <div className="bg-stone-950 border border-stone-700/50 rounded px-3 py-2 font-mono text-xs text-emerald-400 leading-relaxed">
      <span className="text-stone-500 mr-1">🎲</span>
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

export default function Chat({ messages, isLoading, onSendMessage, inputValue, onInputChange }: ChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSend() {
    const text = inputValue.trim()
    if (!text || isLoading) return
    onSendMessage(text)
    inputRef.current?.focus()
  }

  return (
    <div className="flex flex-col h-full bg-stone-900/50 rounded-lg border border-amber-900/30 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-amber-900/30 bg-stone-900/80 flex items-center gap-2 flex-shrink-0">
        <div className="w-2 h-2 bg-amber-600 rounded-full" />
        <span className="text-amber-500 font-semibold text-sm tracking-wide">Journal de l&apos;Aventure</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin scrollbar-thumb-stone-700">
        {messages.length === 0 && (
          <div className="text-center text-stone-600 text-sm italic mt-8 px-4">
            L&apos;aventure commence... Décrivez votre action.
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {isLoading && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-amber-900/30 p-3 bg-stone-900/80">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Décrivez votre action... (Entrée pour envoyer)"
            disabled={isLoading}
            rows={2}
            className="flex-1 bg-stone-800/80 border border-stone-600/50 rounded-lg px-3 py-2 text-stone-200 placeholder-stone-600 text-sm resize-none focus:outline-none focus:border-amber-700/60 disabled:opacity-50 leading-relaxed"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
            className="flex-shrink-0 px-4 py-2 bg-amber-800 hover:bg-amber-700 disabled:bg-stone-700 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors h-[4.5rem] flex items-center justify-center"
          >
            {isLoading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              'Envoyer'
            )}
          </button>
        </div>
        <div className="text-[10px] text-stone-600 mt-1 pl-1">
          Shift+Entrée pour nouvelle ligne
        </div>
      </div>
    </div>
  )
}
