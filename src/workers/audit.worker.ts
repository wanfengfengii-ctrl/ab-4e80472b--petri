import { audit } from '../petri/audit';
import { AuditResult, Model } from '../petri/types';

export interface AuditRequest {
  model: Model;
  maxStates: number;
}

export type AuditResponse =
  | { ok: true; result: AuditResult }
  | { ok: false; error: string };

// 不引入 WebWorker lib，避免与 DOM lib 类型冲突
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<AuditRequest>) => void) | null;
  postMessage(message: AuditResponse): void;
};

scope.onmessage = (e) => {
  try {
    scope.postMessage({ ok: true, result: audit(e.data.model, e.data.maxStates) });
  } catch (err) {
    scope.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
