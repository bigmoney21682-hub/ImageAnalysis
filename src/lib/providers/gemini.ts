import type { Analysis, AnalyzeInput, ChatInput, Provider } from '../types'
import { CHAT_SYSTEM_PROMPT, SYSTEM_PROMPT, buildUserPrompt } from '../prompt'
import { proxyStore, usingProxy } from '../proxy'

/**
 * Google AI Studio (generativelanguage) supports CORS, so by default we call it
 * straight from the browser with the user's own key. Nothing passes through the
 * host serving this app — which for medical images is the point, not a detail.
 *
 * Configuring a proxy in Settings gives that up deliberately: one key, held by
 * the Worker, serves everyone who has the passphrase, and every image then
 * travels through whoever runs that Worker. Direct remains the default.
 *
 * Model IDs move around; if you get a 404 listing the model, check
 * https://ai.google.dev/gemini-api/docs/models and update DEFAULT_MODEL.
 */
const DEFAULT_MODEL = 'gemini-flash-latest'
const GOOGLE_ROOT = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * Builds the URL and auth headers for one call. Direct mode puts the user's key
 * in the query string; proxy mode sends the shared passphrase and lets the
 * Worker attach the key. Everything downstream — friendlyError, the response
 * schema, readSse — is identical either way, which is why the proxy is a URL
 * swap rather than a whole second provider.
 */
function route(path: string, params: Record<string, string>, apiKey = '') {
  const { url: proxy, token } = proxyStore.get()
  const query = new URLSearchParams(params)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (proxy) headers['X-App-Token'] = token
  else query.set('key', apiKey)

  return { url: `${proxy || GOOGLE_ROOT}${path}?${query}`, headers }
}

const enumConfidence = { type: 'STRING', enum: ['high', 'medium', 'low'] }
const enumEvidence = { type: 'STRING', enum: ['visible', 'measured', 'inferred', 'guess'] }
const enumSeverity = {
  type: 'STRING',
  enum: ['incidental', 'minor', 'moderate', 'significant', 'critical'],
}

/**
 * Clinical images trip the default safety thresholds surprisingly often —
 * wounds, exposed anatomy on a torso film, anything dermatological reads as
 * graphic to a general-purpose filter. BLOCK_ONLY_HIGH keeps genuinely harmful
 * content blocked while letting legitimate medical imagery through.
 */
const SAFETY_SETTINGS = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' }))

/** Structured-output schema. Keeps us from having to parse prose. */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    study: {
      type: 'OBJECT',
      properties: {
        modality: { type: 'STRING' },
        bodyRegion: { type: 'STRING' },
        projection: { type: 'STRING' },
        laterality: { type: 'STRING' },
        patientClues: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['modality', 'bodyRegion'],
    },
    confidence: enumConfidence,
    isMedicalImage: { type: 'BOOLEAN' },
    phiVisible: { type: 'BOOLEAN' },
    quality: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          aspect: { type: 'STRING' },
          verdict: { type: 'STRING', enum: ['good', 'acceptable', 'poor'] },
          detail: { type: 'STRING' },
        },
        required: ['aspect', 'verdict', 'detail'],
      },
    },
    artifacts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          source: {
            type: 'STRING',
            enum: ['patient', 'equipment', 'technique', 'processing', 'external'],
          },
          where: { type: 'STRING' },
          cause: { type: 'STRING' },
          impact: { type: 'STRING' },
          remedy: { type: 'STRING' },
          mimics: { type: 'STRING' },
          severity: enumSeverity,
          confidence: enumConfidence,
        },
        required: ['name', 'source', 'where', 'cause', 'impact', 'remedy', 'severity', 'confidence'],
      },
    },
    findings: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          location: { type: 'STRING' },
          appearance: { type: 'STRING' },
          significance: { type: 'STRING' },
          differentials: { type: 'ARRAY', items: { type: 'STRING' } },
          severity: enumSeverity,
          evidence: enumEvidence,
          confidence: enumConfidence,
        },
        required: [
          'name',
          'location',
          'appearance',
          'significance',
          'severity',
          'evidence',
          'confidence',
        ],
      },
    },
    normalStructures: { type: 'ARRAY', items: { type: 'STRING' } },
    recommendations: { type: 'ARRAY', items: { type: 'STRING' } },
    limitations: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['summary', 'study', 'confidence', 'isMedicalImage', 'findings', 'artifacts'],
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'GeminiError'
  }
}

/** Pulls Google's own error text out of the response body. */
function googleMessage(body: string): string {
  try {
    return JSON.parse(body)?.error?.message ?? ''
  } catch {
    return ''
  }
}

function friendlyError(status: number, body: string, model = DEFAULT_MODEL): string {
  const detail = googleMessage(body)
  const suffix = detail ? `\n\nGoogle said: ${detail}` : ''

  if (/no longer available|not found|is not supported/i.test(detail))
    return (
      `Model "${model}" is retired or unavailable to your key. Open Settings, hit ` +
      'Test, and pick a model from the list — that list comes from your key, so ' +
      'anything in it will work.' + suffix
    )

  if (status === 400 && /API key not valid/i.test(body))
    return (
      'Google does not recognise this key at all. This specific error means the ' +
      'key string itself is not valid — a disabled API or a restricted key would ' +
      'return a different error. So:\n\n' +
      '• Check the whole key was copied. Truncated selections are the usual cause.\n' +
      '• Check it has not been deleted or regenerated at aistudio.google.com/apikey.\n' +
      '• Make sure it is an AI Studio key, not a key for some other Google service.\n\n' +
      'The character check above the Test button catches malformed keys.' +
      suffix
    )
  if (status === 403 && /SERVICE_DISABLED|has not been used in project/i.test(body))
    return (
      'The key is valid but the Generative Language API is not enabled on its ' +
      'Google Cloud project. Enable it, or make a fresh key at ' +
      'aistudio.google.com/apikey which comes with it enabled.' + suffix
    )
  if (status === 403 && /blocked|referer|referrer/i.test(body))
    return (
      'The key is valid but restricted. If you set an HTTP referrer restriction, ' +
      "this site's URL must be on the allowed list; if you set an API restriction, " +
      'it must include the Generative Language API.' + suffix
    )
  if (status === 403) return `Access denied.${suffix}`
  if (status === 413)
    return 'The image is too large for the API. Try a tighter crop of the region of interest.' + suffix
  if (status === 429)
    return 'Rate limited — the free tier has a per-minute cap. Wait a moment and try again.' + suffix
  if (status === 404)
    return (
      `Model "${model}" is not available to your key. Open Settings, hit Test, and ` +
      'pick a model from the list.' + suffix
    )
  if (status >= 500) return 'Google returned a server error. Usually transient — try again.' + suffix
  return `Request failed (HTTP ${status}).${suffix}`
}

/**
 * Lists models the key can reach. Doubles as a key test: it isolates "is this
 * key usable at all" from "is this specific model available", which the analyze
 * call alone can't distinguish.
 */
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  const { url, headers } = route('/models', { pageSize: '200' }, apiKey)
  const res = await fetch(url, { headers })
  if (!res.ok) throw new GeminiError(friendlyError(res.status, await res.text().catch(() => '')))
  const json = await res.json()
  return (json?.models ?? [])
    .filter((m: { supportedGenerationMethods?: string[] }) =>
      m.supportedGenerationMethods?.includes('generateContent'),
    )
    .map((m: { name: string }) => m.name.replace(/^models\//, ''))
    .sort()
}

/** Turns a safety block into something that says what to do about it. */
function blockMessage(reason: string): string {
  if (/SAFETY/i.test(reason))
    return (
      'Google\'s safety filter blocked this image. Clinical images of wounds, ' +
      'skin and unclothed anatomy trip it even with the filters set as low as ' +
      'the API allows. A tighter crop to the region of interest usually gets ' +
      'through.'
    )
  if (/PROHIBITED_CONTENT|BLOCKLIST/i.test(reason))
    return 'Google refused this request outright. Nothing to tune here — try a different image.'
  return `Request blocked by Google (${reason}).`
}

export const geminiProvider: Provider = {
  id: 'gemini',
  label: 'Gemini (Google AI Studio)',
  needsKey: true,

  defaultModel: DEFAULT_MODEL,

  async analyze(input: AnalyzeInput, { apiKey, model, signal }): Promise<Analysis> {
    if (!apiKey && !usingProxy())
      throw new GeminiError('No API key set. Add one in Settings.')
    const chosen = model || DEFAULT_MODEL
    const { url, headers } = route(`/models/${chosen}:generateContent`, {}, apiKey)

    const res = await fetch(
      url,
      {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: 'user',
              parts: [
                { text: buildUserPrompt(input.hint) },
                { inline_data: { mime_type: input.mimeType, data: input.imageBase64 } },
              ],
            },
          ],
          safetySettings: SAFETY_SETTINGS,
          generationConfig: {
            // Low but not zero: a differential list benefits from a little
            // breadth, a description of what is visible does not.
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    )

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new GeminiError(friendlyError(res.status, body, chosen), res.status)
    }

    const json = await res.json()

    const blocked = json?.promptFeedback?.blockReason
    if (blocked) throw new GeminiError(blockMessage(blocked))

    const candidate = json?.candidates?.[0]
    const text: string | undefined = candidate?.content?.parts?.[0]?.text
    if (!text) {
      const reason = candidate?.finishReason
      if (reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT')
        throw new GeminiError(blockMessage(reason))
      throw new GeminiError(
        reason === 'MAX_TOKENS'
          ? 'The response was cut off before it finished. Try a crop of one region rather than the whole study.'
          : 'The model returned an empty response.',
      )
    }

    let parsed: Analysis
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new GeminiError('Could not parse the report the model returned.')
    }

    // Structured output guarantees the shape but not the optional arrays.
    return {
      ...parsed,
      isMedicalImage: parsed.isMedicalImage !== false,
      phiVisible: parsed.phiVisible === true,
      study: parsed.study ?? { modality: 'Unknown', bodyRegion: 'Unknown' },
      quality: parsed.quality ?? [],
      artifacts: parsed.artifacts ?? [],
      findings: parsed.findings ?? [],
      normalStructures: parsed.normalStructures ?? [],
      recommendations: parsed.recommendations ?? [],
      limitations: parsed.limitations ?? [],
    }
  },

  async chat(input: ChatInput, { apiKey, model, signal }, onDelta): Promise<string> {
    if (!apiKey && !usingProxy())
      throw new GeminiError('No API key set. Add one in Settings.')
    const chosen = model || DEFAULT_MODEL

    // The image and the report ride along on the first turn, so every answer is
    // grounded in what was actually seen rather than in the transcript alone.
    const opening = [
      { inline_data: { mime_type: input.mimeType, data: input.imageBase64 } },
      { text: buildUserPrompt(input.hint) },
    ]
    const report = {
      role: 'model',
      parts: [{ text: `My structured report on this image:\n${JSON.stringify(input.analysis)}` }],
    }

    const contents = [
      { role: 'user', parts: opening },
      report,
      ...input.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    ]

    const { url, headers } = route(`/models/${chosen}:streamGenerateContent`, { alt: 'sse' }, apiKey)

    const res = await fetch(
      url,
      {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: CHAT_SYSTEM_PROMPT }] },
          contents,
          safetySettings: SAFETY_SETTINGS,
          generationConfig: { temperature: 0.3 },
        }),
      },
    )

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new GeminiError(friendlyError(res.status, body, chosen), res.status)
    }
    if (!res.body) throw new GeminiError('The model returned an empty response.')

    return readSse(res.body, onDelta)
  },
}

/**
 * Gemini's SSE stream is one `data: {json}` per event. Events can be split
 * across reads, so we buffer to the last complete blank-line boundary rather
 * than assuming a chunk holds whole events.
 */
async function readSse(
  body: ReadableStream<Uint8Array>,
  onDelta?: (text: string) => void,
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  let blockedBy = ''
  let lastReason = ''

  /** Pulls whole events off the buffer. Google delimits with CRLFCRLF, the SSE
   *  spec allows either, so normalising the line endings up front is what makes
   *  this work at all — splitting on a bare "\n\n" silently matches nothing in
   *  a CRLF stream and drops the entire response. */
  function drain(flush: boolean) {
    buffer = buffer.replace(/\r\n/g, '\n')

    let cut: number
    while ((cut = buffer.indexOf('\n\n')) !== -1) {
      handle(buffer.slice(0, cut))
      buffer = buffer.slice(cut + 2)
    }
    // The final event often arrives without its trailing blank line.
    if (flush && buffer.trim()) {
      handle(buffer)
      buffer = ''
    }
  }

  function handle(event: string) {
    const payload = event
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('')
    if (!payload || payload === '[DONE]') return

    try {
      const json = JSON.parse(payload)
      const candidate = json?.candidates?.[0]
      const reason = json?.promptFeedback?.blockReason ?? candidate?.finishReason
      if (reason) lastReason = reason
      if (reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT') blockedBy = reason

      for (const part of candidate?.content?.parts ?? []) {
        // Thinking models emit reasoning as parts flagged `thought`. That is
        // scratch work, not the answer, and must not reach the transcript.
        if (part?.thought === true) continue
        if (typeof part?.text !== 'string' || !part.text) continue
        full += part.text
        onDelta?.(part.text)
      }
    } catch {
      // A malformed event is not worth losing the rest of the answer over.
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      drain(false)
    }
    buffer += decoder.decode()
    drain(true)
  } finally {
    reader.cancel().catch(() => {})
  }

  if (full) return full
  if (blockedBy) throw new GeminiError(blockMessage(blockedBy))
  if (lastReason === 'MAX_TOKENS')
    throw new GeminiError('The answer was cut off before any of it arrived. Try a shorter question.')
  throw new GeminiError(
    `No answer came back${lastReason ? ` (${lastReason})` : ''}. Retry, or check the model in Settings still supports images.`,
  )
}
