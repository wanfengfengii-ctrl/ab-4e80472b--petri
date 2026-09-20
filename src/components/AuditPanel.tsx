import { AuditResult, Model, Step } from '../petri/types';
import { Replay } from './Replay';

export type AuditStatus =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; result: AuditResult }
  | { status: 'error'; message: string };

interface Props {
  model: Model;
  audit: AuditStatus;
  maxStates: number;
  onMaxStatesChange: (v: number) => void;
  onRun: () => void;
  onCancel: () => void;
}

function seqText(model: Model, steps: Step[]): string {
  if (steps.length === 0) return '（空）';
  return steps.map((s) => `T${s.transition} ${model.transitions[s.transition]?.name ?? ''}`).join(' → ');
}

/** 审计控制与结果展示 */
export function AuditPanel({ model, audit, maxStates, onMaxStatesChange, onRun, onCancel }: Props) {
  const running = audit.status === 'running';
  const result = audit.status === 'done' ? audit.result : null;

  const kindAttr = !result
    ? audit.status
    : result.kind === 'counterexample'
      ? result.reason
      : result.kind;

  return (
    <section className="audit-panel">
      <div className="audit-controls">
        <button className="primary" onClick={onRun} disabled={running} data-testid="run-audit">
          {running ? '审计中…' : '发起审计'}
        </button>
        {running && (
          <button onClick={onCancel} data-testid="cancel-audit">
            取消
          </button>
        )}
        <label className="max-states">
          状态上限
          <input
            type="number"
            min={100}
            step={1000}
            value={maxStates}
            onChange={(e) => onMaxStatesChange(Math.max(100, Math.floor(Number(e.target.value) || 0)))}
            disabled={running}
            data-testid="max-states-input"
          />
        </label>
      </div>

      <div
        className={`verdict verdict-${kindAttr}`}
        data-testid="audit-status"
        data-kind={kindAttr}
        data-done={audit.status === 'done' || audit.status === 'error' ? 'true' : 'false'}
        data-states={result ? result.states : ''}
        data-seq={result?.kind === 'counterexample' ? result.steps.map((s) => s.transition).join(',') : ''}
        data-prefix={result?.kind === 'lasso' ? result.prefix.length : ''}
        data-cycle={result?.kind === 'lasso' ? result.cycle.length : ''}
        data-cycle-seq={result?.kind === 'lasso' ? result.cycle.map((s) => s.transition).join(',') : ''}
      >
        {audit.status === 'idle' && <p>编辑模型后点击“发起审计”，将完整探索可达状态空间。</p>}
        {audit.status === 'running' && <p>正在完整探索可达状态空间…</p>}
        {audit.status === 'error' && <p>审计出错：{audit.message}</p>}
        {result?.kind === 'pass' && (
          <>
            <h2>✔ 审计通过</h2>
            <p>
              已完整探索 {result.states} 个可达状态、{result.edges} 次触发，最长执行 {result.depth}{' '}
              步。每条执行都终止于验收标记，且从未进入禁态。
            </p>
          </>
        )}
        {result?.kind === 'counterexample' && (
          <>
            <h2>✘ 存在反例：{result.reason === 'forbidden' ? '进入禁态' : '非验收死锁'}</h2>
            <p>
              已探索 {result.states} 个状态。以下为步数最短（{result.steps.length}{' '}
              步）、变迁编号序列字典序最小的反例轨迹：
            </p>
            <p className="seq" data-testid="trace-seq">
              {seqText(model, result.steps)}
            </p>
          </>
        )}
        {result?.kind === 'lasso' && (
          <>
            <h2>↻ 存在无限执行（套索见证）</h2>
            <p>
              已完整探索 {result.states} 个状态、{result.edges} 次触发，未发现禁态或非验收死锁，
              但存在可永久循环的操作分支：前缀 {result.prefix.length} 步 + 循环 {result.cycle.length}{' '}
              步（均为最短，并按字典序决胜）。
            </p>
            <p className="seq">
              前缀：{seqText(model, result.prefix)}　循环：{seqText(model, result.cycle)}
            </p>
          </>
        )}
        {result?.kind === 'inconclusive' && (
          <>
            <h2>? 无法定论</h2>
            <p>{result.reason}</p>
          </>
        )}
      </div>

      {result?.kind === 'counterexample' && (
        <Replay
          model={model}
          prefix={result.steps}
          cycle={null}
          terminalLabel={result.reason === 'forbidden' ? '禁态' : '非验收死锁'}
        />
      )}
      {result?.kind === 'lasso' && (
        <Replay model={model} prefix={result.prefix} cycle={result.cycle} terminalLabel={null} />
      )}
    </section>
  );
}
