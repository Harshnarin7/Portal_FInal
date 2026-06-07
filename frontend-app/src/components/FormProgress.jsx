import "./FormProgress.css";

const STEPS = [
  { key: "form_a", label: "Screening" },
  { key: "form_b", label: "Birth & Resus" },
  { key: "form_c", label: "Maternal" },
  { key: "form_d", label: "Postnatal" },
];

export default function FormProgress({ status }) {
  if (!status) return null;

  const completed = status.completed_forms || [];
  const current = status.next_form || null;

  return (
    <div className="progress-wrapper">
      {STEPS.map((step, index) => {
        const isDone = completed.includes(step.key);
        const isCurrent = current === step.key;

        return (
          <div className="progress-step" key={step.key}>
            <div className="step-content">
              <div
                className={`circle ${
                  isDone ? "done" : isCurrent ? "current" : "pending"
                }`}
              >
                {isDone ? "✓" : index + 1}
              </div>

              <span className="label">{step.label}</span>

              {index !== STEPS.length - 1 && (
                <div
                  className={`line ${
                    isDone ? "line-done" : "line-pending"
                  }`}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
