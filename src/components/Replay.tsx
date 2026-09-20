import { useEffect, useMemo, useState } from 'react';
import { Model, Step } from '../petri/types';
import { MarkingView } from './MarkingView';

interface Props {
  model: Model;
  /** 反例轨迹或套索前缀 */
  prefix: Step[];
  /** 套索循环；反例时传 null */
  cycle: Step[] | null;
  /** 反例终态说明，如“禁态”“非验收死锁” */
  terminalLabel: string | null;
}

/** 逐步回放反例/套索，标出每步令牌变化 */
export function Replay({ model, prefix, cycle, terminalLabel }: Props) {
  const steps = useMemo(() => [...prefix, ...(cycle ?? [])], [prefix, cycle]);
  const cycleStart = cycle ? prefix.length : -1;
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);

  const initial = useMemo(() => model.places.map((p) => p.initial), [model]);
  const marking = pos === 0 ? initial : steps[pos - 1].after;
  const deltas =
    pos === 0
      ? undefined
      : steps[pos - 1].after.map((v, i) => v - steps[pos - 1].before[i]);

  useEffect(() => {
    setPos(0);
    setPlaying(false);
  }, [steps]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setPos((p) => {
        if (p < steps.length) return p + 1;
        if (loop && cycle) return cycleStart;
        setPlaying(false);
        return p;
      });
    }, 800);
    return () => window.clearInterval(timer);
  }, [playing, steps.length, loop, cycle, cycleStart]);

  const atTerminal = pos === steps.length;
  const badge = atTerminal
    ? terminalLabel
      ? { text: `终态：${terminalLabel}`, tone: 'bad' as const }
      : { text: '已回到循环起点状态，循环可无限重复', tone: 'warn' as const }
    : cycle && pos === cycleStart
      ? { text: '循环起点状态', tone: 'warn' as const }
      : null;

  const stepLabel = (s: Step, k: number) => {
    const t = model.transitions[s.transition];
    const changes = s.after
      .map((v, i) => ({ i, d: v - s.before[i] }))
      .filter((c) => c.d !== 0)
      .map((c) => `${model.places[c.i].name} ${s.before[c.i]}→${s.after[c.i]}`)
      .join('，');
    return { title: `#${k + 1} T${s.transition} ${t?.name ?? ''}`, changes };
  };

  return (
    <div className="replay" data-testid="replay">
      <div className="replay-controls">
        <button onClick={() => setPos(0)} disabled={pos === 0} data-testid="replay-first">
          ⏮ 最初
        </button>
        <button onClick={() => setPos((p) => Math.max(0, p - 1))} disabled={pos === 0} data-testid="replay-prev">
          ◀ 上一步
        </button>
        <button
          onClick={() => setPos((p) => Math.min(steps.length, p + 1))}
          disabled={atTerminal}
          data-testid="replay-next"
        >
          下一步 ▶
        </button>
        <button onClick={() => setPos(steps.length)} disabled={atTerminal} data-testid="replay-last">
          最后 ⏭
        </button>
        <button onClick={() => setPlaying((v) => !v)} data-testid="replay-play">
          {playing ? '⏸ 暂停' : '▶ 自动播放'}
        </button>
        {cycle && (
          <label className="loop-toggle">
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
            循环播放
          </label>
        )}
        <span className="replay-pos" data-testid="replay-pos">
          第 {pos}/{steps.length} 步
        </span>
      </div>
      <input
        className="replay-slider"
        type="range"
        min={0}
        max={steps.length}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        data-testid="replay-slider"
      />
      <MarkingView places={model.places} marking={marking} deltas={deltas} badge={badge} />
      <ol className="step-list" data-testid="step-list">
        {steps.map((s, k) => {
          const { title, changes } = stepLabel(s, k);
          const isCycleStart = k === cycleStart;
          return (
            <li key={k} className={k === pos - 1 ? 'current' : ''} data-pos={k}>
              {isCycleStart && <div className="cycle-marker">↓ 循环起点（此后步骤可无限重复）</div>}
              <button className="step-row" onClick={() => setPos(k + 1)}>
                <span className="step-title">{title}</span>
                <span className="step-changes">{changes}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
