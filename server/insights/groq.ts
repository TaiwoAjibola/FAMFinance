const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'openai/gpt-oss-120b'

export interface GroqMessage {
  role: 'system' | 'user'
  content: string
}

/** Calls Groq's OpenAI-compatible chat endpoint. Server-side only. */
export async function callGroq(apiKey: string, messages: GroqMessage[], model?: string): Promise<string> {
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages,
      temperature: 0.2,
      max_completion_tokens: 4000,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    // Never echo the upstream body back: it can contain request details.
    throw new Error(`Groq request failed with status ${response.status}`)
  }

  const json = (await response.json()) as { choices?: { message?: { content?: string } }[] }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('Groq returned an empty response')
  return content
}
