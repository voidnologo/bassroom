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
      throw new Error(`Coach server returned ${response.status}`)
    }
    return parseFeedback(await response.json(), this.id)
  }

  private async probe(): Promise<boolean> {
    try {
      const response = await fetchWithTimeout('/api/coach/status', { method: 'GET' }, 3000)
      if (!response.ok) return false
      const body: unknown = await response.json()
      return isRecord(body) && body.ready === true
    } catch {
      return false
    }
  }
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

  const headline = asNonEmptyString(value.headline, 'headline')
  const confidence = asMember(value.confidence, CONFIDENCES, 'confidence')
  const observations = Array.isArray(value.observations)
    ? value.observations.slice(0, 3).map(parseObservation)
    : []

  return {
    providerId,
    headline,
    observations,
    nextAction: parseNextAction(value.nextAction),
    confidence: confidence as CoachFeedback['confidence'],
  }
}

function parseObservation(value: unknown): Observation {
  if (!isRecord(value)) throw new Error('Observation was not an object')
  return {
    id: asNonEmptyString(value.id, 'observation id'),
    severity: asMember(value.severity, SEVERITIES, 'severity') as Observation['severity'],
    statement: asNonEmptyString(value.statement, 'observation statement'),
    evidence: typeof value.evidence === 'string' ? value.evidence : '',
  }
}

function parseNextAction(value: unknown): NextAction {
  if (!isRecord(value)) throw new Error('nextAction was not an object')
  const action: NextAction = {
    kind: asMember(value.kind, ACTION_KINDS, 'nextAction kind') as NextAction['kind'],
    detail: asNonEmptyString(value.detail, 'nextAction detail'),
  }
  if (typeof value.bpm === 'number' && Number.isFinite(value.bpm)) action.bpm = value.bpm
  if (isBarRange(value.bars)) action.bars = [value.bars[0], value.bars[1]]
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
