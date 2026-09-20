import { PlaceSpec } from '../petri/types';

interface Props {
  places: PlaceSpec[];
  marking: number[];
  /** 每个库所相对上一步的令牌变化；无变化步骤传 undefined */
  deltas?: number[];
  badge?: { text: string; tone: 'ok' | 'bad' | 'warn' } | null;
}

/** 标识可视化：每个库所一张卡片，令牌以圆点表示，容量以空槽表示 */
export function MarkingView({ places, marking, deltas, badge }: Props) {
  return (
    <div className="marking-wrap">
      <div className="marking-view" data-testid="marking-view">
        {places.map((p, i) => {
          const delta = deltas?.[i] ?? 0;
          return (
            <div
              key={i}
              className={`place-card${delta !== 0 ? ' changed' : ''}`}
              data-testid={`place-${i}`}
              data-tokens={marking[i]}
            >
              <div className="place-name" title={p.name}>
                {p.name}
              </div>
              <div className="tokens">
                {p.capacity === 0 ? (
                  <span className="cap-zero">容量0</span>
                ) : (
                  Array.from({ length: p.capacity }, (_, k) => (
                    <span key={k} className={`token-slot${k < marking[i] ? ' filled' : ''}`} />
                  ))
                )}
              </div>
              <div className="place-meta">
                <span className="count">
                  {marking[i]}/{p.capacity}
                </span>
                {p.accept !== null && <span className="accept">验收={p.accept}</span>}
                {delta !== 0 && (
                  <span className={`delta ${delta > 0 ? 'up' : 'down'}`}>
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {badge && <div className={`marking-badge ${badge.tone}`}>{badge.text}</div>}
    </div>
  );
}
