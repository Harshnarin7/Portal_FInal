
import { useFormProgress } from "../context/FormProgressContext";

/* =====================================================
   CANONICAL FORM LIST (snake_case keys ONLY)
===================================================== */
const FORMS = [
  { key: "form_a", label: "Form A – Screening" },
  { key: "form_b", label: "Form B – Birth & Resuscitation" },
  { key: "form_c", label: "Form C – Maternal Details" },
  { key: "form_d", label: "Form D – Postnatal Day 1" },
  { key: "form_e", label: "Form E – NICU Admission" },
  { key: "form_f", label: "Form F – Cranial USG" },
  { key: "form_g", label: "Form G – ROP Screening" },
  { key: "form_h", label: "Form H – Morbidities" },
  { key: "form_i", label: "Form I – Outcomes" },
  { key: "form_j", label: "Form J – Composite Outcome" },

  /* Helper forms */
  { key: "fio2_auc", label: "FiO₂ AUC" },
  { key: "vs6_1", label: "Resp / CV / Neuro Log" },
  { key: "infect_gi_hema", label: "Helper – Infect / GI / Hema" },
  { key: "metab_renal_vasc_eye", label: "Helper – Metab / Renal / Vasc / Eye" },

  /* Safety */
  { key: "form_y_sae", label: "Form Y – SAE" },
  { key: "adverse_events", label: "Helper – Adverse Events" },
  { key: "sae_list", label: "Helper – SAE Listing" },
];

/* =====================================================
   NORMALIZE KEYS (single source of truth)
===================================================== */
const normalizeKey = (key = "") =>
  key.toLowerCase().replace(/-/g, "_").trim();

export default function SidebarFormProgress({ currentForm }) {
  const { progress } = useFormProgress();

  const completed = (progress?.completed_forms || []).map(normalizeKey);
  const current = normalizeKey(currentForm);

  console.log("🧱 Sidebar rendered with:", completed);

  return (
    <aside className="sidebar">
      <h3 className="sidebar-title">PORTAL Trial</h3>

      <ul className="sidebar-list">
        {FORMS.map((form) => {
          const key = normalizeKey(form.key);

          const isDone = completed.includes(key);
          const isCurrent = current === key;

          return (
            <li
              key={key}
              className={`sidebar-item ${
                isDone ? "done" : isCurrent ? "current" : "pending"
              }`}
            >
              <span className="status-icon">
                {isDone ? "✓" : isCurrent ? "▶" : "○"}
              </span>
              <span className="label">{form.label}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
