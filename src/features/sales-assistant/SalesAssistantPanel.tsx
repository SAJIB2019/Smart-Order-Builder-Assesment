import { type FormEvent, useMemo, useState } from 'react'

import { assistantErrorMessage } from '../../services/gemini/assistant-error'
import { GoogleGeminiClient } from '../../services/gemini/google-gemini-client'
import {
  createApiOrdersLoader,
  SalesAssistant,
} from '../../services/gemini/sales-assistant'

const SUGGESTED_SALES_QUESTIONS = [
  'How many orders do we have?',
  'What is our total revenue?',
  'What is the best-selling option by units?',
  'Show revenue by payment method.',
  'What is the average order value?',
  'How many orders actually used a coupon?',
  'How many orders were placed on 2026-11-21?',
] as const

interface ChatMessage {
  readonly id: number
  readonly role: 'staff' | 'assistant'
  readonly text: string
  readonly error?: boolean
}

interface SalesAssistantPanelProps {
  readonly assistant?: SalesAssistant
}

export function SalesAssistantPanel({ assistant }: SalesAssistantPanelProps) {
  const activeAssistant = useMemo(
    () =>
      assistant ??
      new SalesAssistant(
        new GoogleGeminiClient({
          apiKey: import.meta.env.VITE_GEMINI_API_KEY,
        }),
        createApiOrdersLoader(),
      ),
    [assistant],
  )
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<readonly ChatMessage[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [lastQuestion, setLastQuestion] = useState<string | null>(null)

  async function ask(nextQuestion: string): Promise<void> {
    const normalized = nextQuestion.trim()
    if (!normalized || status === 'loading') return
    setStatus('loading')
    setLastQuestion(normalized)
    setMessages((current) => [
      ...current,
      { id: Date.now(), role: 'staff', text: normalized },
    ])
    try {
      const response = await activeAssistant.ask(normalized)
      setMessages((current) => [
        ...current,
        { id: Date.now() + 1, role: 'assistant', text: response.answer },
      ])
      setStatus('idle')
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: 'assistant',
          text: assistantErrorMessage(error),
          error: true,
        },
      ])
      setStatus('error')
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const submitted = question
    setQuestion('')
    void ask(submitted)
  }

  return (
    <section
      className="sales-assistant"
      aria-labelledby="sales-assistant-title"
    >
      <p className="eyebrow">Part F</p>
      <h2 id="sales-assistant-title">Sales assistant</h2>
      <p className="sales-assistant-intro">
        Ask about persisted order statistics. Gemini selects a tool; TypeScript
        computes every number.
      </p>

      <div className="suggested-questions" aria-label="Suggested questions">
        {SUGGESTED_SALES_QUESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={status === 'loading'}
            onClick={() => void ask(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div
        className="chat-log"
        aria-live="polite"
        aria-busy={status === 'loading'}
      >
        {messages.map((message) => (
          <p
            className={`chat-message chat-message-${message.role}${message.error ? ' chat-message-error' : ''}`}
            key={message.id}
          >
            <strong>{message.role === 'staff' ? 'You' : 'Assistant'}:</strong>{' '}
            {message.text}
          </p>
        ))}
        {status === 'loading' ? <p>Checking the latest orders…</p> : null}
      </div>

      <form className="assistant-form" onSubmit={submit}>
        <label htmlFor="sales-question">Sales question</label>
        <div>
          <input
            id="sales-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="e.g. What is our total revenue?"
          />
          <button
            type="submit"
            disabled={!question.trim() || status === 'loading'}
          >
            Ask
          </button>
          {status === 'error' && lastQuestion ? (
            <button type="button" onClick={() => void ask(lastQuestion)}>
              Retry
            </button>
          ) : null}
        </div>
      </form>
    </section>
  )
}
