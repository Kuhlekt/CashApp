'use client'
// src/app/claude/page.tsx
// Direct Claude integration — streaming chat interface
// Accessible at /claude

import { useState, useRef, useEffect, useCallback } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  streaming?: boolean
}

const SUGGESTED_PROMPTS = [
  'How do I configure automated bank file pickup from SFTP?',
  'Explain the MT940 format and how transactions are parsed',
  'What happens when a batch is suspended mid-run?',
  'How does the ML matching learn from confirmed allocations?',
  'Walk me through setting up ClickSend email notifications',
  'What ERP output formats are supported and what do they contain?',
  'How do I set up region-based debtor routing?',
  'Explain the SHA-256 audit chain and how tampering is detected',
  'What Neon PostgreSQL indexes are most important for performance?',
  'How do I deploy to Vercel with GitHub Actions CI/CD?',
]

function MarkdownText({ text }: { text: string }) {
  // Simple markdown renderer — code blocks, bold, inline code, lists
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let inCodeBlock = false
  let codeLines: string[] = []
  let codeLang = ''
  let key = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true
        codeLang = line.slice(3).trim()
        codeLines = []
      } else {
        elements.push(
          <div key={key++} className="my-3">
            {codeLang && (
              <div className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-t-lg px-3 py-1.5">
                <span className="text-xs text-slate-400 font-mono">{codeLang}</span>
                <button
                  onClick={() => navigator.clipboard?.writeText(codeLines.join('\n'))}
                  className="text-xs text-slate-500 hover:text-teal-400 transition-colors"
                >
                  Copy
                </button>
              </div>
            )}
            <pre className={`bg-slate-900 border border-slate-700 ${codeLang ? 'rounded-b-lg border-t-0' : 'rounded-lg'} p-4 overflow-x-auto`}>
              <code className="text-sm text-slate-200 font-mono leading-relaxed">
                {codeLines.join('\n')}
              </code>
            </pre>
          </div>
        )
        inCodeBlock = false
        codeLines = []
        codeLang = ''
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h3 key={key++} className="text-base font-semibold text-white mt-4 mb-2">{renderInline(line.slice(4))}</h3>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={key++} className="text-lg font-semibold text-white mt-5 mb-2">{renderInline(line.slice(3))}</h2>)
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={key++} className="text-xl font-bold text-white mt-5 mb-3">{renderInline(line.slice(2))}</h1>)
    }
    // List items
    else if (line.match(/^[-*] /)) {
      elements.push(
        <div key={key++} className="flex gap-2 my-0.5">
          <span className="text-teal-400 mt-1 flex-shrink-0">•</span>
          <span className="text-slate-200 text-sm leading-relaxed">{renderInline(line.slice(2))}</span>
        </div>
      )
    } else if (line.match(/^\d+\. /)) {
      const num = line.match(/^(\d+)\. /)?.[1]
      elements.push(
        <div key={key++} className="flex gap-2 my-0.5">
          <span className="text-teal-400 font-mono text-xs mt-1 flex-shrink-0 w-4">{num}.</span>
          <span className="text-slate-200 text-sm leading-relaxed">{renderInline(line.replace(/^\d+\. /, ''))}</span>
        </div>
      )
    }
    // Horizontal rule
    else if (line === '---' || line === '***') {
      elements.push(<hr key={key++} className="border-slate-700 my-4" />)
    }
    // Empty line
    else if (line.trim() === '') {
      elements.push(<div key={key++} className="h-2" />)
    }
    // Regular paragraph
    else {
      elements.push(
        <p key={key++} className="text-slate-200 text-sm leading-relaxed my-0.5">
          {renderInline(line)}
        </p>
      )
    }
  }

  return <div className="space-y-0.5">{elements}</div>
}

function renderInline(text: string): React.ReactNode {
  // Bold, inline code, links
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-slate-800 text-teal-300 px-1.5 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i} className="text-slate-300 italic">{part.slice(1, -1)}</em>
    }
    return part
  })
}

export default function ClaudePage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiKeyMissing, setApiKeyMissing] = useState(false)
  const [context, setContext] = useState('')
  const [showContext, setShowContext] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    }

    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setLoading(true)

    const allMessages = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }))

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: allMessages, context: context || undefined, stream: true }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        if (err.error?.includes('ANTHROPIC_API_KEY')) {
          setApiKeyMissing(true)
        }
        setMessages(prev => prev.map(m =>
          m.id === assistantMsg.id
            ? { ...m, content: `Error: ${err.error}`, streaming: false }
            : m
        ))
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.text) {
                fullText += parsed.text
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsg.id
                    ? { ...m, content: fullText }
                    : m
                ))
              }
              if (parsed.error) {
                fullText = `Error: ${parsed.error}`
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsg.id
                    ? { ...m, content: fullText, streaming: false }
                    : m
                ))
              }
            } catch { /* skip malformed chunks */ }
          }
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id ? { ...m, streaming: false } : m
      ))
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id
          ? { ...m, content: 'Connection error — is the dev server running?', streaming: false }
          : m
      ))
    } finally {
      setLoading(false)
    }
  }, [messages, loading, context])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  function stopStream() {
    abortRef.current?.abort()
    setLoading(false)
    setMessages(prev => prev.map((m, i) =>
      i === prev.length - 1 && m.streaming ? { ...m, streaming: false } : m
    ))
  }

  function clearChat() {
    setMessages([])
    setInput('')
  }

  function copyMessage(content: string) {
    navigator.clipboard?.writeText(content)
  }

  const hasMessages = messages.length > 0

  return (
    <div className="flex flex-col h-screen bg-slate-950">

      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/dashboard" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
              ← Dashboard
            </a>
            <div className="w-px h-4 bg-slate-700" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-white text-xs font-bold">
                C
              </div>
              <div>
                <div className="text-white text-sm font-semibold leading-none">Claude</div>
                <div className="text-slate-500 text-xs">claude-sonnet-4-20250514 · CashFlow AI</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowContext(!showContext)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${showContext ? 'border-teal-500 text-teal-400 bg-teal-500/10' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}
            >
              {showContext ? '▲ Context' : '▼ Context'}
            </button>
            {hasMessages && (
              <button onClick={clearChat} className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:border-red-500 hover:text-red-400 transition-colors">
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Context panel */}
        {showContext && (
          <div className="border-t border-slate-800 bg-slate-900/50">
            <div className="max-w-4xl mx-auto px-4 py-3">
              <div className="text-xs text-slate-400 mb-1.5">
                Session context — injected into every message (paste current batch data, error logs, config, etc.)
              </div>
              <textarea
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder="Paste any context here: current session data, error messages, config values, CSV rows, etc. Claude will reference this in all responses."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono resize-none focus:outline-none focus:border-teal-500 transition-colors"
                rows={4}
              />
            </div>
          </div>
        )}
      </div>

      {/* API key warning */}
      {apiKeyMissing && (
        <div className="flex-shrink-0 bg-amber-500/10 border-b border-amber-500/30 px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-start gap-3">
            <span className="text-amber-400 text-lg flex-shrink-0">⚠</span>
            <div>
              <div className="text-amber-400 text-sm font-semibold">ANTHROPIC_API_KEY not set</div>
              <div className="text-amber-300/70 text-xs mt-0.5">
                Add <code className="bg-amber-500/20 px-1 rounded">ANTHROPIC_API_KEY=sk-ant-...</code> to your <code className="bg-amber-500/20 px-1 rounded">.env.local</code> file, then restart <code className="bg-amber-500/20 px-1 rounded">npm run dev</code>.
                Get your key at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="underline">console.anthropic.com</a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6">

          {/* Empty state */}
          {!hasMessages && (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                C
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Ask Claude anything</h2>
              <p className="text-slate-400 text-sm mb-10 max-w-md mx-auto">
                Specialist in cash application, AR, bank file formats, ERP integration, automation, and the CashFlow AI platform.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto text-left">
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(prompt)}
                    className="text-left px-4 py-3 rounded-xl border border-slate-700 hover:border-teal-500/50 hover:bg-teal-500/5 text-slate-300 text-xs leading-relaxed transition-all group"
                  >
                    <span className="text-teal-500 group-hover:text-teal-400 mr-1.5">→</span>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          <div className="space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>

                {/* Avatar */}
                <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                  msg.role === 'user'
                    ? 'bg-slate-700 text-slate-300'
                    : 'bg-gradient-to-br from-teal-500 to-teal-700 text-white'
                }`}>
                  {msg.role === 'user' ? 'IH' : 'C'}
                </div>

                {/* Bubble */}
                <div className={`flex-1 max-w-[85%] ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                  {msg.role === 'user' ? (
                    <div className="bg-teal-600/20 border border-teal-500/30 rounded-2xl rounded-tr-sm px-4 py-3">
                      <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ) : (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-sm px-5 py-4">
                      {msg.content ? (
                        <MarkdownText text={msg.content} />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      )}
                      {msg.streaming && msg.content && (
                        <span className="inline-block w-0.5 h-4 bg-teal-400 animate-pulse ml-0.5 align-text-bottom" />
                      )}
                    </div>
                  )}

                  {/* Message actions */}
                  {!msg.streaming && msg.content && (
                    <div className={`flex gap-2 mt-1.5 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                      <button
                        onClick={() => copyMessage(msg.content)}
                        className="text-slate-600 hover:text-slate-400 text-xs transition-colors px-1"
                      >
                        Copy
                      </button>
                      <span className="text-slate-700 text-xs">
                        {msg.timestamp.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-slate-800 bg-slate-900/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about cash application, bank formats, automation setup, deployment... (Enter to send, Shift+Enter for newline)"
                className="w-full bg-slate-800 border border-slate-700 focus:border-teal-500 rounded-xl px-4 py-3 pr-12 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none transition-colors min-h-[52px] max-h-[200px]"
                rows={1}
                style={{ height: 'auto' }}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 200) + 'px'
                }}
                disabled={loading}
              />
            </div>

            {loading ? (
              <button
                onClick={stopStream}
                className="flex-shrink-0 w-11 h-11 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors flex items-center justify-center"
                title="Stop"
              >
                ■
              </button>
            ) : (
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                className="flex-shrink-0 w-11 h-11 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 text-white transition-colors flex items-center justify-center"
                title="Send (Enter)"
              >
                ↑
              </button>
            )}
          </div>

          <div className="flex items-center justify-between mt-2">
            <p className="text-slate-600 text-xs">
              Claude claude-sonnet-4-20250514 · Streaming · Context-aware
            </p>
            <p className="text-slate-600 text-xs">
              {messages.filter(m => m.role === 'user').length} messages in session
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
