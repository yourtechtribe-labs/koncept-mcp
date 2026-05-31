/**
 * Anthropic Messages API provider for `koncepto review` — global `fetch`, no
 * SDK (D-004). Returns an `llm: (prompt) => Promise<string>` matching the seam
 * koncept-core's reviewAffected injects. One retry on network/5xx; a final
 * failure throws (reviewAffected re-tags it with concept:invariant → exit 2).
 */

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_TOKENS = 1024

export const DEFAULT_MODEL = 'claude-sonnet-4-6'

interface MessagesResponse {
  content?: Array<{ type?: string; text?: string }>
}

export function makeAnthropicLlm(
  apiKey: string,
  model: string,
): (prompt: string) => Promise<string> {
  return async (prompt: string): Promise<string> => {
    const res = await postWithRetry(apiKey, model, prompt)
    const json = (await res.json()) as MessagesResponse
    const text = json.content?.find((b) => b.type === 'text')?.text
    if (typeof text !== 'string') {
      throw new Error('Anthropic response had no text content block')
    }
    return text
  }
}

async function postWithRetry(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<Response> {
  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response
    try {
      res = await post(apiKey, model, prompt)
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err) // network → retry
      continue
    }
    if (res.ok) return res
    if (res.status < 500) {
      throw new Error(`Anthropic API ${res.status}: ${await safeBody(res)}`) // client error → no retry
    }
    lastError = `Anthropic API ${res.status}` // 5xx → retry
  }
  throw new Error(lastError || 'Anthropic API request failed')
}

function post(apiKey: string, model: string, prompt: string): Promise<Response> {
  return fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
}

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300)
  } catch {
    return '(no body)'
  }
}
