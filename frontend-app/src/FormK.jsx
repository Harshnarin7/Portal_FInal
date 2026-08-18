import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormComponents.css";
import "./styles/FormK.css";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toDateOnlyValue, parseDateOnly } from "./utils/datetime";
import FormNavBar from "./components/FormNavBar";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import {
  Home, Brain, FlaskConical, CheckCircle, Building2, Scan,
} from "lucide-react";

const SEQ_OPTIONS = ["DWI", "3D T1", "T2", "SWI", "DTI"];
const SCANNER_OPTIONS = ["3T Philips", "Equivalent 3T"];

const emptyFinding = () => ({ present: null, type: [], site: [], location: [], details: "" });

const BLANK = () => ({
  enrollment_id: "",
  dob: "",
  gestation_weeks: "",
  gestation_days: "",
  mri_date: "",
  pma_weeks: "",
  pma_days: "",
  selected_for_mri: null,
  scanner: "",
  sedation: null,
  sedation_agent: "",
  sequences: [],
  myelination: "",
  bg_thalamus: emptyFinding(),
  plic: emptyFinding(),
  white_matter: emptyFinding(),
  corpus_callosum: emptyFinding(),
  cerebellum: emptyFinding(),
  atrophy: emptyFinding(),
  hemorrhage_swi: { present: null, location: "", details: "" },
  overall_mri: "",
  mri_summary: "",
  radiologist_name: "",
  radiologist_date: "",
  completed_by: "",
  designation: "",
  completion_date: "",
});

function emptyToNull(v) {
  if (v === "" || v === undefined || v === null) return null;
  return v;
}
function numOrNull(v) {
  if (v === "" || v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function dateOnly(v) {
  if (!v) return "";
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : String(v);
}
function normalizeFinding(v) {
  if (!v || typeof v !== "object") return emptyFinding();
  return {
    present: typeof v.present === "boolean" ? v.present : null,
    type: Array.isArray(v.type) ? v.type : [],
    site: Array.isArray(v.site) ? v.site : [],
    location: Array.isArray(v.location) ? v.location : [],
    details: v.details || "",
  };
}

function YesNo({ value, onChange, disabled = false }) {
  return (
    <div className="fk-yn">
      <button type="button" className={`yes${value === true ? " active" : ""}`} disabled={disabled} onClick={() => !disabled && onChange(true)}>YES</button>
      <button type="button" className={`no${value === false ? " active" : ""}`} disabled={disabled} onClick={() => !disabled && onChange(false)}>NO</button>
    </div>
  );
}

function Chips({ options, value, onChange, disabled = false, multi = false }) {
  const selected = multi ? (Array.isArray(value) ? value : []) : value;
  return (
    <div className="fk-chips">
      {options.map((o) => {
        const active = multi ? selected.includes(o) : selected === o;
        return (
          <button
            key={o}
            type="button"
            disabled={disabled}
            className={`fk-chip${active ? " active" : ""}`}
            onClick={() => {
              if (disabled) return;
              if (multi) {
                onChange(active ? selected.filter((x) => x !== o) : [...selected, o]);
              } else {
                onChange(active ? "" : o);
              }
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function DateField({ value, onChange, disabled = false }) {
  return (
    <DatePicker
      selected={value ? parseDateOnly(value) : null}
      onChange={(date) => onChange(date ? toDateOnlyValue(date) : "")}
      dateFormat="dd/MM/yyyy"
      placeholderText="dd/mm/yyyy"
      className="fk-input"
      disabled={disabled}
    />
  );
}

function SectionCard({ icon: Icon, num, title, children }) {
  return (
    <section className="fk-card">
      <div className="fk-card-header">
        {Icon && <Icon size={18} className="fk-sec-icon" />}
        {num != null && <span className="fk-sec-num">{num}</span>}
        <h3>{title}</h3>
      </div>
      <div className="fk-card-body">{children}</div>
    </section>
  );
}

function FindingBlock({
  title, value, onChange, disabled,
  typeOpts, siteOpts, locationOpts, singleType = false,
}) {
  const v = value || emptyFinding();
  return (
    <div className="fk-finding">
      <div className="fk-finding-top">
        <span className="fk-finding-title">{title}</span>
        <div className="fk-finding-yn">
          <span className="fk-mini-label">Abnormality</span>
          <YesNo value={v.present} onChange={(val) => onChange({ ...v, present: val })} disabled={disabled} />
        </div>
      </div>
      {v.present === true && (
        <div className="fk-finding-detail">
          {typeOpts && (
            <div className="fk-block">
              <div className="fk-field-label">{singleType ? "If yes" : "Type"}</div>
              <Chips
                options={typeOpts}
                value={singleType ? (v.type?.[0] || "") : (v.type || [])}
                multi={!singleType}
                onChange={(val) => onChange({
                  ...v,
                  type: singleType ? (val ? [val] : []) : val,
                })}
                disabled={disabled}
              />
            </div>
          )}
          {siteOpts && (
            <div className="fk-block">
              <div className="fk-field-label">Site</div>
              <Chips options={siteOpts} value={v.site || []} multi onChange={(val) => onChange({ ...v, site: val })} disabled={disabled} />
            </div>
          )}
          {locationOpts && (
            <div className="fk-block">
              <div className="fk-field-label">Location</div>
              <Chips options={locationOpts} value={v.location || []} multi onChange={(val) => onChange({ ...v, location: val })} disabled={disabled} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function mapApiToForm(row) {
  return {
    ...BLANK(),
    enrollment_id: row.enrollment_id || "",
    dob: dateOnly(row.dob),
    gestation_weeks: row.gestation_weeks ?? "",
    gestation_days: row.gestation_days ?? "",
    mri_date: dateOnly(row.mri_date),
    pma_weeks: row.pma_weeks ?? "",
    pma_days: row.pma_days ?? "",
    selected_for_mri: typeof row.selected_for_mri === "boolean" ? row.selected_for_mri : null,
    scanner: row.scanner || "",
    sedation: typeof row.sedation === "boolean" ? row.sedation : null,
    sedation_agent: row.sedation_agent || "",
    sequences: Array.isArray(row.sequences) ? row.sequences : [],
    myelination: row.myelination || "",
    bg_thalamus: normalizeFinding(row.bg_thalamus),
    plic: normalizeFinding(row.plic),
    white_matter: normalizeFinding(row.white_matter),
    corpus_callosum: normalizeFinding(row.corpus_callosum),
    cerebellum: normalizeFinding(row.cerebellum),
    atrophy: normalizeFinding(row.atrophy),
    hemorrhage_swi: {
      present: typeof row.hemorrhage_swi?.present === "boolean" ? row.hemorrhage_swi.present : null,
      location: row.hemorrhage_swi?.location || "",
      details: row.hemorrhage_swi?.details || "",
    },
    overall_mri: row.overall_mri || "",
    mri_summary: row.mri_summary || "",
    radiologist_name: row.radiologist_name || "",
    radiologist_date: dateOnly(row.radiologist_date),
    completed_by: row.completed_by || "",
    designation: row.designation || "",
    completion_date: dateOnly(row.completion_date),
  };
}

function buildPayload(data) {
  return {
    enrollment_id: data.enrollment_id,
    dob: emptyToNull(data.dob),
    gestation_weeks: numOrNull(data.gestation_weeks),
    gestation_days: numOrNull(data.gestation_days),
    mri_date: emptyToNull(data.mri_date),
    pma_weeks: numOrNull(data.pma_weeks),
    pma_days: numOrNull(data.pma_days),
    selected_for_mri: data.selected_for_mri,
    scanner: emptyToNull(data.scanner),
    sedation: data.sedation,
    sedation_agent: emptyToNull(data.sedation_agent),
    sequences: Array.isArray(data.sequences) ? data.sequences : [],
    myelination: emptyToNull(data.myelination),
    bg_thalamus: data.bg_thalamus || emptyFinding(),
    plic: data.plic || emptyFinding(),
    white_matter: data.white_matter || emptyFinding(),
    corpus_callosum: data.corpus_callosum || emptyFinding(),
    cerebellum: data.cerebellum || emptyFinding(),
    atrophy: data.atrophy || emptyFinding(),
    hemorrhage_swi: data.hemorrhage_swi || { present: null, location: "", details: "" },
    overall_mri: emptyToNull(data.overall_mri),
    mri_summary: emptyToNull(data.mri_summary),
    radiologist_name: emptyToNull(data.radiologist_name),
    radiologist_date: emptyToNull(data.radiologist_date),
    completed_by: emptyToNull(data.completed_by),
    designation: emptyToNull(data.designation),
    completion_date: emptyToNull(data.completion_date),
    submission_status: "draft",
  };
}

function calcPma(dob, mriDate, gestWeeks, gestDays) {
  if (!dob || !mriDate) return { weeks: "", days: "" };
  const birth = parseDateOnly(dob);
  const mri = parseDateOnly(mriDate);
  if (!birth || !mri) return { weeks: "", days: "" };
  const postnatal = Math.floor((mri.getTime() - birth.getTime()) / 86400000);
  if (postnatal < 0) return { weeks: "", days: "" };
  const ga = (Number(gestWeeks) || 0) * 7 + (Number(gestDays) || 0);
  const total = ga + postnatal;
  return { weeks: Math.floor(total / 7), days: total % 7 };
}

function getDesignation(name) {
  if (!name) return "";
  const n = name.replace(/^Dr\.\s*/i, "").trim();
  if (n === "Mannat Guliani") return "Project Research Scientist III (Medical)";
  if (n === "Shalini Dhiman") return "Project Research Scientist III (Non-Medical)";
  if (/^Dr\.\s*/i.test(name)) return "Site Research Scientist";
  return "Project Nurse III";
}

export default function FormK() {
  const location = useLocation();
  const navigate = useNavigate();
  const { enrollmentId: routeId } = useParams();
  const { patientData } = usePatient();
  const { markFormCompleted } = useFormProgress();

  const [formData, setFormData] = useState(BLANK);
  const [isSaved, setIsSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [assessors, setAssessors] = useState([]);
  const [siteName, setSiteName] = useState("");

  const set = (field, value) => {
    setIsSaved(false);
    setFormData((p) => ({ ...p, [field]: value }));
  };

  useEffect(() => {
    const id =
      routeId ||
      patientData?.enrollment_id ||
      location.state?.enrollmentId ||
      localStorage.getItem("current_enrollment_id") ||
      "";
    if (!id) return;

    setFormData((p) => ({ ...p, enrollment_id: id }));

    // Prefill from Form B
    api.get(`/birth-resuscitation/${id}`)
      .then(async (res) => {
        const b = Array.isArray(res.data) ? res.data[0] : res.data;
        if (!b) return;
        let resolvedSite = b.site_name || patientData?.site_name || patientData?.site || "";
        if (b.screening_id) {
          try {
            const screening = (await api.get(`/screenings/by-screening-id/${b.screening_id}`)).data;
            if (screening?.site_name) resolvedSite = screening.site_name;
          } catch { /* optional */ }
        }
        if (resolvedSite) setSiteName(resolvedSite);
        setFormData((p) => ({
          ...p,
          enrollment_id: id,
          dob: p.dob || b.date_of_birth || "",
          gestation_weeks: p.gestation_weeks !== "" && p.gestation_weeks != null ? p.gestation_weeks : (b.gestation_weeks ?? ""),
          gestation_days: p.gestation_days !== "" && p.gestation_days != null ? p.gestation_days : (b.gestation_days ?? ""),
        }));
      })
      .catch(() => {});

    // Load existing Form K (critical — was missing before = data loss on reload)
    api.get(`/form-k/${id}`)
      .then((res) => {
        if (!res.data) return;
        const mapped = mapApiToForm(res.data);
        setFormData((p) => ({
          ...mapped,
          enrollment_id: id,
          // Keep prefilled identity if saved record left them blank
          dob: mapped.dob || p.dob,
          gestation_weeks:
            mapped.gestation_weeks !== "" && mapped.gestation_weeks != null
              ? mapped.gestation_weeks
              : p.gestation_weeks,
          gestation_days:
            mapped.gestation_days !== "" && mapped.gestation_days != null
              ? mapped.gestation_days
              : p.gestation_days,
        }));
        setIsSaved(true);
      })
      .catch((err) => {
        if (err?.response?.status !== 404) console.error("Failed to load Form K", err);
      });
  }, [routeId, patientData, location.state]);

  useEffect(() => {
    const site = siteName || patientData?.site_name || patientData?.site || "";
    if (!site) {
      setAssessors([]);
      return;
    }
    api.get(`/sites/${encodeURIComponent(site)}/screeners`)
      .then((r) => setAssessors(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAssessors([]));
  }, [siteName, patientData?.site_name, patientData?.site]);

  // Auto PMA from DOB + MRI date + GA
  useEffect(() => {
    if (!formData.dob || !formData.mri_date) return;
    const { weeks, days } = calcPma(
      formData.dob,
      formData.mri_date,
      formData.gestation_weeks,
      formData.gestation_days,
    );
    if (weeks === "" && days === "") return;
    if (String(formData.pma_weeks) === String(weeks) && String(formData.pma_days) === String(days)) return;
    setFormData((p) => ({ ...p, pma_weeks: weeks, pma_days: days }));
  }, [formData.dob, formData.mri_date, formData.gestation_weeks, formData.gestation_days]);

  const saveForm = async () => {
    if (!formData.enrollment_id) {
      setSaveMessage("❌ Enrollment ID is required");
      return false;
    }
    try {
      const res = await api.post("/form-k", buildPayload(formData));
      setFormData(mapApiToForm(res.data));
      markFormCompleted("form_k");
      setIsSaved(true);
      setSaveMessage("✅ Form K saved");
      setTimeout(() => setSaveMessage(""), 3000);
      return true;
    } catch (err) {
      console.error(err?.response?.data || err);
      const detail = err?.response?.data?.detail;
      setSaveMessage(`❌ Save failed${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
      setTimeout(() => setSaveMessage(""), 4000);
      return false;
    }
  };

  const skipRest = formData.selected_for_mri === false;

  return (
    <form
      className="screening-form form-k-page"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await saveForm();
        if (ok) navigate(`/form-l/${formData.enrollment_id}`);
      }}
    >
      <div className="form-header-action-row">
        <div className="form-header-title-area">
          <div className="form-breadcrumb"><Home size={12} /> FORM K</div>
          <h2 className="form-main-title">MRI Brain Assessment</h2>
          <p className="form-main-subtitle">MRI Brain at 40 ± 2 weeks PMA (25% Subset)</p>
        </div>
        <div className="form-header-meta-area">
          <div className="screening-id-badge">
            <span className="id-label">Enrollment ID</span>
            <span className="id-val">{formData.enrollment_id || "—"}</span>
          </div>
        </div>
      </div>

      <SectionCard icon={Scan} num="1" title="Selected for MRI subset">
        <div className="fk-qa">
          <span className="fk-q">Selected for MRI subset</span>
          <YesNo value={formData.selected_for_mri} onChange={(v) => set("selected_for_mri", v)} />
        </div>
        {skipRest && (
          <div className="fk-skip-note">
            If No, skip the rest of this form. You can still Save to record the subset answer.
          </div>
        )}
      </SectionCard>

      {!skipRest && (
        <>
          <SectionCard icon={Building2} num="K.1" title="Identification">
            <div className="fk-grid-3">
              <div className="form-group">
                <label>2. Enrollment ID</label>
                <input className="fk-input" value={formData.enrollment_id} readOnly />
              </div>
              <div className="form-group">
                <label>3. DOB</label>
                <DateField value={formData.dob} onChange={(v) => set("dob", v)} />
              </div>
              <div className="form-group">
                <label>4. Gestation at birth</label>
                <div className="fk-inline">
                  <input className="fk-input fk-num" type="number" min="0" value={formData.gestation_weeks} onChange={(e) => set("gestation_weeks", e.target.value)} />
                  <span>wks</span>
                  <input className="fk-input fk-num" type="number" min="0" max="6" value={formData.gestation_days} onChange={(e) => set("gestation_days", e.target.value)} />
                  <span>days</span>
                </div>
              </div>
              <div className="form-group">
                <label>5. Date of MRI</label>
                <DateField value={formData.mri_date} onChange={(v) => set("mri_date", v)} />
              </div>
              <div className="form-group">
                <label>6. PMA</label>
                <div className="fk-inline">
                  <input className="fk-input fk-num" type="number" min="0" value={formData.pma_weeks} onChange={(e) => set("pma_weeks", e.target.value)} />
                  <span>wks</span>
                  <input className="fk-input fk-num" type="number" min="0" max="6" value={formData.pma_days} onChange={(e) => set("pma_days", e.target.value)} />
                  <span>days</span>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={FlaskConical} num="K.2" title="MRI details">
            <div className="fk-block">
              <div className="fk-field-label">7. Scanner</div>
              <Chips options={SCANNER_OPTIONS} value={formData.scanner} onChange={(v) => set("scanner", v)} />
            </div>
            <div className="fk-qa">
              <span className="fk-q">8. Sedation</span>
              <YesNo value={formData.sedation} onChange={(v) => set("sedation", v)} />
            </div>
            {formData.sedation === true && (
              <div className="form-group" style={{ maxWidth: 360 }}>
                <label>9. If yes, Agent</label>
                <input className="fk-input" value={formData.sedation_agent} onChange={(e) => set("sedation_agent", e.target.value)} placeholder="Agent name" />
              </div>
            )}
            <div className="fk-block">
              <div className="fk-field-label">10. Sequences</div>
              <Chips options={SEQ_OPTIONS} value={formData.sequences} multi onChange={(v) => set("sequences", v)} />
            </div>
          </SectionCard>

          <SectionCard icon={Brain} num="K.3" title="MRI findings">
            <div className="fk-block" style={{ marginBottom: 16 }}>
              <div className="fk-field-label">11. Myelination</div>
              <Chips
                options={["Appropriate for age", "Delayed"]}
                value={formData.myelination}
                onChange={(v) => set("myelination", v)}
              />
            </div>

            <FindingBlock
              title="Basal ganglia & thalamus"
              value={formData.bg_thalamus}
              onChange={(v) => set("bg_thalamus", v)}
              typeOpts={["T1 hyper", "T2 hyper", "DWI restriction"]}
              siteOpts={["Caudate", "Putamen", "GP", "Thalamus"]}
            />
            <FindingBlock
              title="PLIC (post limb internal capsule)"
              value={formData.plic}
              onChange={(v) => set("plic", v)}
              typeOpts={["T2 hyperintensity", "Signal reversal"]}
              singleType
            />
            <FindingBlock
              title="White matter"
              value={formData.white_matter}
              onChange={(v) => set("white_matter", v)}
              locationOpts={["Periventricular", "Deep WM"]}
              typeOpts={["Hyperintensity", "Volume loss"]}
            />
            <FindingBlock
              title="Corpus callosum"
              value={formData.corpus_callosum}
              onChange={(v) => set("corpus_callosum", v)}
              typeOpts={["Thinning", "Signal abnormality"]}
              singleType
            />
            <FindingBlock
              title="Cerebellum"
              value={formData.cerebellum}
              onChange={(v) => set("cerebellum", v)}
              typeOpts={["Signal changes", "Atrophy"]}
              singleType
            />
            <FindingBlock
              title="Atrophy"
              value={formData.atrophy}
              onChange={(v) => set("atrophy", v)}
              typeOpts={["Cortical", "Sulcal widening", "Ventriculomegaly"]}
            />

            <div className="fk-finding">
              <div className="fk-finding-top">
                <span className="fk-finding-title">Hemorrhage (SWI)</span>
                <div className="fk-finding-yn">
                  <span className="fk-mini-label">26. Hemorrhagic changes</span>
                  <YesNo
                    value={formData.hemorrhage_swi?.present}
                    onChange={(val) => set("hemorrhage_swi", { ...formData.hemorrhage_swi, present: val })}
                  />
                </div>
              </div>
              {formData.hemorrhage_swi?.present === true && (
                <div className="form-group" style={{ marginTop: 10 }}>
                  <label>27. Location</label>
                  <input
                    className="fk-input"
                    value={formData.hemorrhage_swi?.location || ""}
                    onChange={(e) => set("hemorrhage_swi", { ...formData.hemorrhage_swi, location: e.target.value })}
                    placeholder="Describe location"
                  />
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard icon={CheckCircle} num="K.4" title="Overall MRI">
            <div className="fk-block">
              <div className="fk-field-label">Overall MRI</div>
              <Chips options={["Normal", "Abnormal"]} value={formData.overall_mri} onChange={(v) => set("overall_mri", v)} />
            </div>
            <div className="form-group">
              <label>Summary</label>
              <textarea
                className="fk-textarea"
                rows={3}
                value={formData.mri_summary}
                onChange={(e) => set("mri_summary", e.target.value)}
                placeholder="Brief summary of MRI findings"
              />
            </div>
            <div className="fk-grid-2">
              <div className="form-group">
                <label>Site radiologist</label>
                <input className="fk-input" value={formData.radiologist_name} onChange={(e) => set("radiologist_name", e.target.value)} />
              </div>
              <div className="form-group">
                <label>Date</label>
                <DateField value={formData.radiologist_date} onChange={(v) => set("radiologist_date", v)} />
              </div>
            </div>
          </SectionCard>
        </>
      )}

      <SectionCard title="Form completed by">
        <div className="fk-grid-3">
          <div className="form-group">
            <label>Completed by</label>
            <select
              className="fk-input"
              value={formData.completed_by || ""}
              onChange={(e) => {
                const name = e.target.value;
                setIsSaved(false);
                setFormData((p) => ({
                  ...p,
                  completed_by: name,
                  designation: getDesignation(name),
                }));
              }}
            >
              <option value="">-- Select --</option>
              {assessors.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
              {formData.completed_by && !assessors.includes(formData.completed_by) && (
                <option value={formData.completed_by}>{formData.completed_by}</option>
              )}
            </select>
          </div>
          <div className="form-group">
            <label>Designation</label>
            <input className="fk-input" value={formData.designation || ""} readOnly placeholder="Auto-filled" />
          </div>
          <div className="form-group">
            <label>Date</label>
            <DateField value={formData.completion_date} onChange={(v) => set("completion_date", v)} />
          </div>
        </div>
      </SectionCard>

      {saveMessage && <p className="fk-save-msg">{saveMessage}</p>}

      <FormNavBar
        onBack={async () => {
          try { await saveForm(); } catch (err) { console.error("Save before back failed:", err); }
          navigate(`/form-j/${formData.enrollment_id}`, { state: { enrollmentId: formData.enrollment_id } });
        }}
        onSave={saveForm}
        onNext={async () => {
          const ok = await saveForm();
          if (ok) navigate(`/form-l/${formData.enrollment_id}`, { state: { enrollmentId: formData.enrollment_id } });
        }}
        backLabel="Form J"
        nextLabel="Form L"
        step={11}
        totalSteps={12}
        isSaved={isSaved}
      />
    </form>
  );
}
