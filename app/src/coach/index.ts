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

export class CoachService {
  private readonly heuristic = new HeuristicCoach()
  private readonly model = new LanguageModelCoach()

  /** Set false to stay on the built-in coach regardless of configuration. */
  public useModelWhenAvailable = true

  /** Populated when a model attempt failed, for display in settings. */
  public lastModelError: string | null = null

  async describeActiveProvider(): Promise<string> {
    const provider = await this.pick()
    return provider.label
  }

  async analyze(request: CoachRequest): Promise<CoachFeedback> {
    const provider = await this.pick()
    if (provider === this.heuristic) return this.heuristic.analyze(request)

    try {
      const feedback = await provider.analyze(request)
      this.lastModelError = null
      return feedback
    } catch (error) {
      this.lastModelError = error instanceof Error ? error.message : String(error)
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
