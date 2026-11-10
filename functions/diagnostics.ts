export interface DiagnosticOptions {
  onEvent?: (event: Record<string, unknown>) => void;
  onError?: (error: { trace_id: string; stage: string; name: string; message: string; stack?: string; cause?: {name:string;message:string;stack?:string} }) => void;
}
export function safeLog(event: Record<string, unknown>): void {
  try { console.info(JSON.stringify(event)); } catch { /* Telemetry must never break a successful response. */ }
}
export function createTrace(options: DiagnosticOptions = {}, secret = '') {
  const id = crypto.randomUUID();
  const started = Date.now();
  const clean = (value: string) => secret ? value.split(secret).join('[REDACTED]') : value;
  return {
    id,
    emit(stage: string, details: Record<string, unknown> = {}) {
      const event = { trace_id: id, stage, elapsed_ms: Date.now() - started, ...details };
      try { options.onEvent?.(event); } catch {}
      // Detailed data is for explicit local observers only; production logs are categorical.
      safeLog({ trace_id: id, stage, elapsed_ms: event.elapsed_ms, status: details.status, reason: details.reason, count: details.count, finish_reason: details.finish_reason });
    },
    error(stage: string, value: unknown) {
      const e = value instanceof Error ? value : new Error('unknown_error');
      try { options.onError?.({ trace_id: id, stage, name: e.name, message: clean(e.message), stack: e.stack ? clean(e.stack) : undefined, cause: e.cause instanceof Error ? {name:e.cause.name,message:clean(e.cause.message),stack:e.cause.stack ? clean(e.cause.stack) : undefined} : undefined }); } catch {}
      safeLog({ trace_id: id, stage, status: 'failed', error_type: e.name });
    },
  };
}
export type Trace = ReturnType<typeof createTrace>;
