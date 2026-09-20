interface Props {
  text: string;
  errors: string[];
  onTextChange: (t: string) => void;
  onApply: () => void;
  onFormat: () => void;
}

/** JSON 文本编辑器：导入的模型可在此查看、修改并应用 */
export function JsonEditor({ text, errors, onTextChange, onApply, onFormat }: Props) {
  return (
    <div className="json-editor">
      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        spellCheck={false}
        rows={26}
        data-testid="json-input"
      />
      <div className="json-actions">
        <button className="primary" onClick={onApply} data-testid="json-apply">
          应用 JSON
        </button>
        <button onClick={onFormat} data-testid="json-format">
          格式化
        </button>
      </div>
      {errors.length > 0 && (
        <ul className="errors" data-testid="json-errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
