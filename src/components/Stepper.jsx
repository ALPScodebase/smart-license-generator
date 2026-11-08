export default function Stepper({ steps, current, onSelect }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {steps.map((label, i) => (
        <li key={label} className={i === current ? 'active' : i < current ? 'done' : ''}>
          <button type="button" disabled={i >= current} onClick={() => onSelect(i)} aria-current={i === current ? 'step' : undefined}>
            <span className="stepper-num">{i < current ? '✓' : i + 1}</span>
            <span className="stepper-label">{label}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
