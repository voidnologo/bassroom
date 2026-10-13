/**
 * Ambient declarations for AudioWorkletGlobalScope.
 *
 * TypeScript's DOM library describes the main thread, where none of these
 * exist. The worklet bundle is compiled against these instead.
 */
declare const sampleRate: number
declare const currentTime: number

declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor(options?: { processorOptions?: Record<string, unknown> })
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: {
    processorOptions?: Record<string, unknown>
  }) => AudioWorkletProcessor,
): void
