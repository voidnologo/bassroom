import { buildTakeReviewPayload } from './prompts/takeReview'
import type { CoachFeedback, CoachProvider, CoachRequest, NextAction, Observation } from './types'

/**
 * A coach backed by a language model.
 *
 * The model is reached through the local coach server, never directly: a key in
 * anything the browser loads is a published key. The server also writes each
 * take to disk, which is what makes the practice history available to whatever
 * replaces this provider later.
 *
 * Everything crossing this boundary is validated. A model that returns a shape
 * the UI does not expect must degrade to the built-in coach, not render wrong.
 */

const ENDPOINT = '/api/coach/review'
const TIMEOUT_MS = 20_000

const SEVERITIES = new Set(['fix', 'watch', 'info'])
const ACTION_KINDS = new Set([
  'repeat',
  'slow-down',
  'speed-up',
  'isolate',
  'switch-exercise',
  'rest',
])
const CONFIDENCES = new Set(['low', 'medium', 'high'])

export class LanguageModelCoach implements CoachProvider {
  readonly id = 'model'
  readonly label = 'AI coach'

  private availability: Promise<boolean> | null = null

  async isAvailable(): Promise<boolean> {
    this.availability ??= this.probe()
    return this.availability
  }

  /** Forget a cached answer, so a key added mid-session is picked up. */
  resetAvailability(): void {
    this.availability = null
  }

  async analyze(request: CoachRequest): Promise<CoachFeedback> {
    const payload = buildTakeReviewPayload(request.telemetry, request.recentTakes.slice(0, 3))
    const response = await fetchWithTimeout(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      // A failure means the next take should probe again rather than waiting
      // out the full timeout on a server that has gone away.
      this.availability = null
      throw new Error(describeStatus(response.status))
    }
    return parseFeedback(await response.json(), this.id)
  }

  private async probe(): Promise<boolean> {
    try {
      const response = await fetchWithTimeout('/api/coach/status', { method: 'GET' }, 3000)
      if (!response.ok) return false
      // A static server answers every path with the app's HTML, so a 200 that
      // is not JSON means the coach server is not reachable at all.
      const body: unknown = await response.json()
      return isRecord(body) && body.ready === true
    } catch {
      return false
    }
  }
}

/** Say what actually went wrong; a bare 502 reads the same for every cause. */
function describeStatus(status: number): string {
  if (status === 429) return 'The model is rate limited. The built-in coach answered instead.'
  if (status === 503) return 'No API key is configured, so the built-in coach answered.'
  if (status === 401 || status === 403) return 'The API key was rejected.'
  return `The coach server returned ${status}.`
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Validate a model's answer into the shape the UI renders. Throws otherwise. */
export function parseFeedback(value: unknown, providerId: string): CoachFeedback {
  if (!isRecord(value)) throw new Error('Coach response was not an object')

  const headline = clip(asNonEmptyString(value.headline, 'headline'))
  const confidence = asMember(value.confidence, CONFIDENCES, 'confidence')
  // A malformed observation is dropped rather than throwing: one missing field
  // in the second of three should not discard a good headline and next action.
  const observations = Array.isArray(value.observations)
    ? value.observations.slice(0, 3).map(parseObservation).filter(isObservation)
    : []

  return {
    providerId,
    headline,
    observations,
    nextAction: parseNextAction(value.nextAction),
    confidence: confidence as CoachFeedback['confidence'],
  }
}

function parseObservation(value: unknown): Observation | null {
  if (!isRecord(value)) return null
  if (typeof value.statement !== 'string' || value.statement.trim() === '') return null
  if (typeof value.severity !== 'string' || !SEVERITIES.has(value.severity)) return null
  return {
    id: typeof value.id === 'string' && value.id.trim() !== '' ? value.id : 'observation',
    severity: value.severity as Observation['severity'],
    statement: clip(value.statement),
    evidence: typeof value.evidence === 'string' ? clip(value.evidence) : '',
  }
}

function isObservation(value: Observation | null): value is Observation {
  return value !== null
}

/** A model that returns an essay should not be able to break the layout. */
const MAX_TEXT_LENGTH = 400

function clip(text: string): string {
  return text.length <= MAX_TEXT_LENGTH ? text : `${text.slice(0, MAX_TEXT_LENGTH - 1)}…`
}

function parseNextAction(value: unknown): NextAction {
  if (!isRecord(value)) throw new Error('nextAction was not an object')
  const action: NextAction = {
    kind: asMember(value.kind, ACTION_KINDS, 'nextAction kind') as NextAction['kind'],
    detail: clip(asNonEmptyString(value.detail, 'nextAction detail')),
  }
  // Bounds a model's numbers to something an instrument can do, rather than
  // handing the UI a tempo of 99999 or a bar index of -5.
  if (typeof value.bpm === 'number' && value.bpm >= 20 && value.bpm <= 300) {
    action.bpm = Math.round(value.bpm)
  }
  if (isBarRange(value.bars) && value.bars[0] >= 1 && value.bars[1] >= value.bars[0]) {
    action.bars = [Math.round(value.bars[0]), Math.round(value.bars[1])]
  }
  return action
}

function isBarRange(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === 'number')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Coach response field "${field}" was not a non-empty string`)
  }
  return value
}

function asMember(value: unknown, allowed: Set<string>, field: string): string {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new Error(`Coach response field "${field}" was "${String(value)}"`)
  }
  return value
}
