import type { SelfEstimate } from '../../progress/types'

/**
 * The two-second gap between playing and being told how it went.
 *
 * Asking the learner to read their own timing first, and keeping the interval
 * otherwise empty, is the best-evidenced single intervention in the
 * motor-learning literature: it builds the internal error-detection sense that
 * lets someone practise usefully when the app is not watching. Filling the
 * interval with the score, or with anything else, removes the benefit, which is
 * why nothing else is on screen here.
 */

const CHOICES: Array<{ value: SelfEstimate; label: string; hint: string }> = [
  { value: 'ahead', label: 'Ahead', hint: 'I was rushing the click' },
  { value: 'on-it', label: 'On it', hint: 'I was with the click' },
  { value: 'behind', label: 'Behind', hint: 'I was dragging behind it' },
]

export function SelfEstimatePrompt({ onAnswer }: { onAnswer: (estimate: SelfEstimate) => void }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <h3>Before you look — how was your timing?</h3>
      <p className="muted small" style={{ maxWidth: '46ch', margin: '0 auto 18px' }}>
        Guess first. Getting better at reading your own playing is the skill that lets you practise
        without the app watching.
      </p>
      <div className="row wrap" style={{ gap: 10, justifyContent: 'center' }}>
        {CHOICES.map((choice) => (
          <button
            key={choice.value}
            type="button"
            className="btn"
            style={{ minWidth: 130 }}
            onClick={() => onAnswer(choice.value)}
          >
            <span className="stack" style={{ gap: 2 }}>
              <span>{choice.label}</span>
              <span className="tiny faint">{choice.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Shown with the result: whether the guess matched the measurement. */
export function EstimateOutcome({
  guess,
  wasRight,
}: {
  guess: SelfEstimate | null
  wasRight: boolean | null
}) {
  if (guess === null || wasRight === null) return null
  const label = CHOICES.find((choice) => choice.value === guess)?.label ?? guess
  return (
    <p className="small" style={{ marginTop: 10 }}>
      {wasRight ? (
        <span>
          You said <strong>{label.toLowerCase()}</strong>, and that is what the numbers say. Reading
          your own playing correctly is worth more than the take itself.
        </span>
      ) : (
        <span className="muted">
          You said <strong>{label.toLowerCase()}</strong>. The numbers say otherwise — compare them
          against what you felt.
        </span>
      )}
    </p>
  )
}
