import type { DiagnosticsRecord } from './diagnostics'

/**
 * Posts a diagnostics record to the local coach server.
 *
 * Failure is swallowed on purpose: this is instrumentation for tuning, and a
 * practice session must not stop because a development aid could not write.
 */
export async function postDiagnostics(record: DiagnosticsRecord): Promise<boolean> {
  try {
    const response = await fetch('/api/diagnostics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(record),
    })
    return response.ok
  } catch {
    return false
  }
}
