import { HeuristicCoach } from './heuristic'
import { LanguageModelCoach } from './llm'
import type { CoachFeedback, CoachProvider, CoachRequest } from './types'

/**
 * Picks a coach and guarantees an answer.
 *
 * The model-backed provider is tried when it is configured; anything at all
 * going wrong falls through to the built-in rules. A practice habit cannot be
 * allowed to depend on a network call, and a learner who has stopped mid-session
 * because an API was down does not come back.
 */

export interface CoachStatus {
  /** Populated when a model attempt failed and the rules answered instead. */
  lastModelError: string | null
}

export class CoachService {
  private readonly heuristic = new HeuristicCoach()
  private readonly model = new LanguageModelCoach()
  private readonly listeners = new Set<(status: CoachStatus) => void>()
  private modelError: string | null = null

  /** Set false to stay on the built-in coach regardless of configuration. */
  public useModelWhenAvailable = true

  get lastModelError(): string | null {
    return this.modelError
  }

  /**
   * Notified when a model call fails. The UI cannot observe a plain field, so
   * a failure read during render would only ever appear by coincidence.
   */
  onChange(listener: (status: CoachStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setModelError(message: string | null): void {
    if (this.modelError === message) return
    this.modelError = message
    for (const listener of [...this.listeners]) listener({ lastModelError: message })
  }

  /** A caller must not have to infer the provider from the wording of a label. */
  async describeActiveProvider(): Promise<{ label: string; usesModel: boolean }> {
    const provider = await this.pick()
    return { label: provider.label, usesModel: provider !== this.heuristic }
  }

  async analyze(request: CoachRequest): Promise<CoachFeedback> {
    // Everything goes through the same try, including the heuristic: an
    // identity check that skipped it would let a rule throw straight at the UI.
    const provider = await this.pick()
    try {
      const feedback = await provider.analyze(request)
      if (provider !== this.heuristic) this.setModelError(null)
      return feedback
    } catch (error) {
      this.setModelError(error instanceof Error ? error.message : String(error))
      return this.heuristic.analyze(request)
    }
  }

  /** Re-check whether a model is configured, after a settings change. */
  refresh(): void {
    this.model.resetAvailability()
  }

  private async pick(): Promise<CoachProvider> {
    if (!this.useModelWhenAvailable) return this.heuristic
    return (await this.model.isAvailable()) ? this.model : this.heuristic
  }
}

export { HeuristicCoach } from './heuristic'
export { LanguageModelCoach, parseFeedback } from './llm'
export { buildTelemetry, locate } from './telemetry'
export * from './types'
