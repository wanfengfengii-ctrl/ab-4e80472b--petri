import {
  COND_OPS,
  MAX_ARC_WEIGHT,
  MAX_CAPACITY,
  MAX_PLACES,
  MAX_TRANSITIONS,
  MIN_PLACES,
  MIN_TRANSITIONS,
  Model,
  PlaceSpec,
} from '../petri/types';

interface Props {
  model: Model;
  onChange: (m: Model) => void;
}

const clampInt = (v: string, lo: number, hi: number): number => {
  const n = Math.floor(Number(v));
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
};

/** 结构化模型编辑器：库所、变迁弧、禁态规则 */
export function StructuredEditor({ model, onChange }: Props) {
  /** 深拷贝后原地修改再提交，保持不可变更新 */
  const update = (fn: (m: Model) => void) => {
    const copy: Model = JSON.parse(JSON.stringify(model));
    fn(copy);
    onChange(copy);
  };

  // ---------- 库所 ----------
  const setPlace = (i: number, patch: Partial<PlaceSpec>) =>
    update((m) => {
      const p = { ...m.places[i], ...patch };
      p.capacity = Math.min(MAX_CAPACITY, Math.max(0, p.capacity));
      p.initial = Math.min(p.initial, p.capacity);
      if (p.accept !== null) p.accept = Math.min(p.accept, p.capacity);
      m.places[i] = p;
    });

  const addPlace = () =>
    update((m) => {
      m.places.push({ name: `P${m.places.length}`, capacity: 1, initial: 0, accept: null });
      m.transitions.forEach((t) => {
        t.pre.push(0);
        t.post.push(0);
      });
    });

  const removePlace = (i: number) =>
    update((m) => {
      m.places.splice(i, 1);
      m.transitions.forEach((t) => {
        t.pre.splice(i, 1);
        t.post.splice(i, 1);
      });
      m.forbidden = m.forbidden
        .map((rule) =>
          rule
            .filter((c) => c.place !== i)
            .map((c) => (c.place > i ? { ...c, place: c.place - 1 } : c)),
        )
        .filter((rule) => rule.length > 0);
    });

  // ---------- 变迁 ----------
  const setTransitionName = (i: number, name: string) =>
    update((m) => {
      m.transitions[i].name = name;
    });

  const setArc = (ti: number, kind: 'pre' | 'post', pi: number, raw: string) =>
    update((m) => {
      m.transitions[ti][kind][pi] = clampInt(raw, 0, MAX_ARC_WEIGHT);
    });

  const addTransition = () =>
    update((m) => {
      m.transitions.push({
        name: `T${m.transitions.length}`,
        pre: m.places.map(() => 0),
        post: m.places.map(() => 0),
      });
    });

  const removeTransition = (i: number) =>
    update((m) => {
      m.transitions.splice(i, 1);
    });

  // ---------- 禁态 ----------
  const addRule = () =>
    update((m) => {
      m.forbidden.push([{ place: 0, op: '>=', value: 1 }]);
    });

  const removeRule = (ri: number) =>
    update((m) => {
      m.forbidden.splice(ri, 1);
    });

  const addCond = (ri: number) =>
    update((m) => {
      m.forbidden[ri].push({ place: 0, op: '>=', value: 1 });
    });

  const removeCond = (ri: number, ci: number) =>
    update((m) => {
      m.forbidden[ri].splice(ci, 1);
      if (m.forbidden[ri].length === 0) m.forbidden.splice(ri, 1);
    });

  const setCond = (ri: number, ci: number, patch: Partial<{ place: number; op: string; value: number }>) =>
    update((m) => {
      Object.assign(m.forbidden[ri][ci], patch);
    });

  return (
    <div className="structured-editor">
      <label className="model-name">
        模型名称
        <input
          value={model.name}
          onChange={(e) => update((m) => void (m.name = e.target.value))}
          data-testid="model-name"
        />
      </label>

      <section>
        <h3>
          库所（{model.places.length}/{MAX_PLACES}）
          <button onClick={addPlace} disabled={model.places.length >= MAX_PLACES} data-testid="add-place">
            + 添加库所
          </button>
        </h3>
        <table className="places-table" data-testid="places-table">
          <thead>
            <tr>
              <th>#</th>
              <th>名称</th>
              <th>容量(0-{MAX_CAPACITY})</th>
              <th>初始令牌</th>
              <th>验收值</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {model.places.map((p, i) => (
              <tr key={i}>
                <td>{i}</td>
                <td>
                  <input value={p.name} onChange={(e) => setPlace(i, { name: e.target.value })} />
                </td>
                <td>
                  <select
                    value={p.capacity}
                    onChange={(e) => setPlace(i, { capacity: Number(e.target.value) })}
                  >
                    {Array.from({ length: MAX_CAPACITY + 1 }, (_, v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={p.capacity}
                    value={p.initial}
                    onChange={(e) => setPlace(i, { initial: clampInt(e.target.value, 0, p.capacity) })}
                  />
                </td>
                <td>
                  <select
                    value={p.accept === null ? '' : p.accept}
                    onChange={(e) =>
                      setPlace(i, { accept: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  >
                    <option value="">任意</option>
                    {Array.from({ length: p.capacity + 1 }, (_, v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    onClick={() => removePlace(i)}
                    disabled={model.places.length <= MIN_PLACES}
                    title="删除库所"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>
          变迁（{model.transitions.length}/{MAX_TRANSITIONS}）
          <button
            onClick={addTransition}
            disabled={model.transitions.length >= MAX_TRANSITIONS}
            data-testid="add-transition"
          >
            + 添加变迁
          </button>
        </h3>
        <p className="hint">前置/后置弧为每个库所一个整数权值（0 表示无弧）。</p>
        <div className="transitions-list" data-testid="transitions-list">
          {model.transitions.map((t, ti) => (
            <div className="transition-card" key={ti}>
              <div className="transition-head">
                <span className="t-id">T{ti}</span>
                <input value={t.name} onChange={(e) => setTransitionName(ti, e.target.value)} />
                <button
                  onClick={() => removeTransition(ti)}
                  disabled={model.transitions.length <= MIN_TRANSITIONS}
                  title="删除变迁"
                >
                  ✕
                </button>
              </div>
              {(['pre', 'post'] as const).map((kind) => (
                <div className="arc-row" key={kind}>
                  <span className="arc-label">{kind === 'pre' ? '前置弧' : '后置弧'}</span>
                  <div className="arc-grid">
                    {model.places.map((p, pi) => (
                      <label key={pi} title={p.name}>
                        <span>{p.name}</span>
                        <input
                          type="number"
                          min={0}
                          max={MAX_ARC_WEIGHT}
                          value={t[kind][pi]}
                          onChange={(e) => setArc(ti, kind, pi, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3>
          禁态规则（任一规则的全部条件成立即禁态）
          <button onClick={addRule} data-testid="add-forbidden">
            + 添加规则
          </button>
        </h3>
        {model.forbidden.length === 0 && <p className="hint">未配置禁态。</p>}
        {model.forbidden.map((rule, ri) => (
          <div className="rule-card" key={ri}>
            <div className="rule-head">
              <span>规则 #{ri + 1}（条件取合取）</span>
              <button onClick={() => addCond(ri)}>+ 条件</button>
              <button onClick={() => removeRule(ri)}>删除规则</button>
            </div>
            {rule.map((c, ci) => (
              <div className="cond-row" key={ci}>
                <select
                  value={c.place}
                  onChange={(e) => setCond(ri, ci, { place: Number(e.target.value) })}
                >
                  {model.places.map((p, pi) => (
                    <option key={pi} value={pi}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={c.op}
                  onChange={(e) => setCond(ri, ci, { op: e.target.value })}
                >
                  {COND_OPS.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  max={MAX_ARC_WEIGHT}
                  value={c.value}
                  onChange={(e) => setCond(ri, ci, { value: clampInt(e.target.value, 0, MAX_ARC_WEIGHT) })}
                />
                <button onClick={() => removeCond(ri, ci)} title="删除条件">
                  ✕
                </button>
              </div>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
