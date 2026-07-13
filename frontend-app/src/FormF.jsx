import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "./api/axios";
import { useFormProgress } from "./context/FormProgressContext";
import { useAuth } from "./context/AuthContext";
import {
  ArrowLeft, ArrowRight, Save, ChevronDown,
  AlertTriangle, X, Lock,
  Plus, Trash2, Edit3, Calendar, FileText, Check,
  AlertCircle, Info, Activity, TrendingUp, ClipboardList
} from "lucide-react";
import "./styles/FormF.css";
import NotesBox from "./components/NotesBox";

/* ══════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════ */
const GRADES = ["None","I","II","III","IV"];
const getGradeNum = g => ({ None:0,I:1,II:2,III:3,IV:4 }[g] ?? 0);
const STATUS = { EMPTY:"empty", DRAFT:"draft", COMPLETE:"complete", SUBMITTED:"submitted" };

// CRF-exact schedules — Scan 6 (36wk) added for lt28
const SCHEDULES = {
  lt28: {
    label:"< 28 wks or < 1000 g", color:"#EF4444",
    steps:[
      { label:"Scan 1", sub:"Day 1–3",              dolMin:1,   dolMax:3,   pmaWk:null },
      { label:"Scan 2", sub:"Day 4–7",              dolMin:4,   dolMax:7,   pmaWk:null },
      { label:"Scan 3", sub:"Day 10–14",            dolMin:10,  dolMax:14,  pmaWk:null },
      { label:"Scan 4", sub:"Day 21 (if unstable)", dolMin:19,  dolMax:23,  pmaWk:null },
      { label:"Scan 5", sub:"Day 28",               dolMin:26,  dolMax:30,  pmaWk:null },
      { label:"Scan 6", sub:"36 wks PMA / Pre-Discharge", dolMin:null, dolMax:null, pmaWk:36 },
      { label:"Final",  sub:"40 wks PMA",           dolMin:null, dolMax:null, pmaWk:40  },
    ],
  },
  w28_31: {
    label:"28–31 wks", color:"#F59E0B",
    steps:[
      { label:"Scan 1", sub:"Day 4–7 (opt. 1–3)", dolMin:1,  dolMax:7,   pmaWk:null },
      { label:"Scan 2", sub:"Day 10–14",           dolMin:10, dolMax:14,  pmaWk:null },
      { label:"Scan 3", sub:"Day 28 (or unwell)",  dolMin:25, dolMax:32,  pmaWk:null },
      { label:"Final",  sub:"40 wks PMA",          dolMin:null,dolMax:null,pmaWk:40  },
    ],
  },
};

/* ══════════════════════════════════════════════════════
   UTILITY FUNCTIONS
══════════════════════════════════════════════════════ */

/** DOL = scanDate - dob + 1 (1-indexed) */
function calcDOL(scanDateStr, dobStr) {
  if (!scanDateStr || !dobStr) return null;
  const scan = new Date(scanDateStr);
  const dob  = new Date(dobStr);
  if (isNaN(scan) || isNaN(dob)) return null;
  const diff = Math.floor((scan - dob) / 86400000);
  return diff + 1; // Day 1 = day of birth
}

/** PMA = GA at birth + chronological age in days */
function calcPMA(gaWeeks, gaDays, dol) {
  if (!gaWeeks || dol === null) return null;
  const totalDaysGA  = (gaWeeks * 7) + (gaDays || 0);
  const totalDaysPMA = totalDaysGA + (dol - 1); // dol-1 because day 1 = 0 extra days
  const pmaW = Math.floor(totalDaysPMA / 7);
  const pmaD = totalDaysPMA % 7;
  return { weeks: pmaW, days: pmaD, label: `${pmaW}+${pmaD} wks` };
}

function formatPMA(pmaObj) {
  if (!pmaObj) return "—";
  return `${pmaObj.weeks}+${pmaObj.days} wks`;
}

/** Format ISO date string (YYYY-MM-DD) → dd-mm-yyyy */
function formatDateDMY(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) {
    // Try parsing as-is if already in other format
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2].padStart(2,"0")}-${parts[1].padStart(2,"0")}-${parts[0]}`;
    }
    return dateStr;
  }
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Which protocol window does a DOL fall into? */
function guessProtocolWindow(dol, scheduleKey) {
  if (!dol || !scheduleKey) return null;
  const steps = SCHEDULES[scheduleKey]?.steps || [];
  return steps.find(s => s.dolMin && dol >= s.dolMin && dol <= s.dolMax) || null;
}

/** Protocol compliance stats */
function calcCompliance(scanEntries, scheduleKey, gaWeeks, gaDays, dob) {
  const schedule = SCHEDULES[scheduleKey];
  if (!schedule) return null;
  const dolSteps = schedule.steps.filter(s => s.dolMin !== null);
  const pmaSteps = schedule.steps.filter(s => s.pmaWk !== null);

  const completedDOL = dolSteps.filter(step =>
    scanEntries.some(e => {
      const dol = calcDOL(e.scanDate, dob);
      return dol !== null && dol >= step.dolMin && dol <= step.dolMax;
    })
  ).length;

  const completedPMA = pmaSteps.filter(step =>
    scanEntries.some(e => {
      const dol = calcDOL(e.scanDate, dob);
      const pma = calcPMA(gaWeeks, gaDays, dol);
      return pma && pma.weeks === step.pmaWk;
    })
  ).length;

  const expected = dolSteps.length + pmaSteps.length;
  const completed= completedDOL + completedPMA;
  return {
    expected, completed,
    missed: Math.max(0, expected - completed),
    pct: expected > 0 ? Math.round((completed / expected) * 100) : 0,
  };
}

/* ══════════════════════════════════════════════════════
   SUB-COMPONENTS
══════════════════════════════════════════════════════ */

/* ── Grade pill selector — equal-width, colour-coded, wrapping ── */
function GradePills({ label, value, onChange }) {
  const grades = [
    { g:"None", idle:"#F1F5F9", idleBorder:"#CBD5E1", idleText:"#94A3B8", active:"#64748B" },
    { g:"I",    idle:"#F0FDF4", idleBorder:"#BBF7D0", idleText:"#16A34A", active:"#16A34A" },
    { g:"II",   idle:"#FFFBEB", idleBorder:"#FDE68A", idleText:"#D97706", active:"#D97706" },
    { g:"III",  idle:"#FEF2F2", idleBorder:"#FECACA", idleText:"#DC2626", active:"#DC2626" },
    { g:"IV",   idle:"#FDF4FF", idleBorder:"#E9D5FF", idleText:"#9333EA", active:"#9333EA" },
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:7}}>
      <span style={{
        fontSize:10,fontWeight:700,letterSpacing:"0.08em",
        textTransform:"uppercase",color:"#64748B",
      }}>{label}</span>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
        {grades.map(({g, idle, idleBorder, idleText, active}) => {
          const on = value === g;
          return (
            <button key={g} type="button"
              onClick={() => onChange(on ? "None" : g)}
              style={{
                flex:"1 1 0",
                minWidth:0,
                padding:"8px 4px",
                borderRadius:8,
                border:`2px solid ${on ? active : idleBorder}`,
                background: on ? active : idle,
                color: on ? "#fff" : idleText,
                fontFamily:"Inter,system-ui,sans-serif",
                fontSize:13, fontWeight:800,
                cursor:"pointer",
                transition:"all 0.13s",
                textAlign:"center",
                boxShadow: on ? `0 2px 10px ${active}44` : "none",
                lineHeight:1,
              }}
            >{g}</button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Scan Form Modal — 100% inline styles ── */
function ScanFormModal({ scan, scanNumber, dob, gaWeeks, gaDays, scheduleKey, onSave, onCancel }) {
  const [form, setForm] = useState(scan || {
    scanDate:"", sonographer:"",
    ivhGradeRight:"None", ivhGradeLeft:"None",
    cpvlGradeRight:"None", cpvlGradeLeft:"None",
    findings:"",
  });
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const dol = useMemo(() => calcDOL(form.scanDate, dob),           [form.scanDate, dob]);
  const pma = useMemo(() => calcPMA(gaWeeks, gaDays, dol),         [gaWeeks, gaDays, dol]);
  const win = useMemo(() => guessProtocolWindow(dol, scheduleKey), [dol, scheduleKey]);

  const highGrade =
    getGradeNum(form.ivhGradeRight)>=3 || getGradeNum(form.ivhGradeLeft)>=3 ||
    getGradeNum(form.cpvlGradeRight)>=2 || getGradeNum(form.cpvlGradeLeft)>=2;

  const handleSave = () => {
    if (!form.scanDate) { alert("Scan Date is required."); return; }
    onSave({ ...form, dol, pma: formatPMA(pma) });
  };

  const inp = {
    width:"100%", boxSizing:"border-box",
    padding:"10px 13px",
    border:"1.5px solid #E2E8F0", borderRadius:10,
    fontFamily:"Inter,system-ui,sans-serif",
    fontSize:13, fontWeight:500, color:"#0F172A",
    background:"#fff", outline:"none",
    transition:"border-color 0.15s, box-shadow 0.15s",
  };

  return (
    <div style={{
      position:"fixed",inset:0,
      background:"rgba(15,23,42,0.65)",
      backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)",
      zIndex:9999,
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:16,
    }}>
      <div style={{
        background:"#fff", borderRadius:22,
        width:"100%", maxWidth:620,
        maxHeight:"94vh", overflowY:"auto",
        boxShadow:"0 40px 100px rgba(15,23,42,0.3)",
        fontFamily:"Inter,system-ui,sans-serif",
      }}>

        {/* ── HEADER ── */}
        <div style={{
          display:"flex", alignItems:"center", gap:14,
          padding:"20px 24px 16px",
          borderBottom:"1px solid #F1F5F9",
          background:"linear-gradient(135deg,#0F4C81 0%,#1558A0 100%)",
          borderRadius:"22px 22px 0 0",
        }}>
          <div style={{
            width:42,height:42,borderRadius:11,
            background:"rgba(255,255,255,0.15)",
            border:"1px solid rgba(255,255,255,0.25)",
            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
          }}>
            <FileText size={19} color="#fff"/>
          </div>
          <div style={{flex:1}}>
            <h3 style={{margin:"0 0 2px",fontSize:16,fontWeight:800,color:"#fff"}}>
              {scan ? `Edit Scan #${scanNumber}` : `New Scan — #${scanNumber}`}
            </h3>
            <p style={{margin:0,fontSize:11,color:"rgba(255,255,255,0.65)"}}>
              {win
                ? `📋 Protocol: ${win.label} · ${win.sub}`
                : "Cranial Ultrasound · PORTAL Trial"}
            </p>
          </div>
          <button type="button" onClick={onCancel} style={{
            width:30,height:30,borderRadius:8,flexShrink:0,
            border:"1px solid rgba(255,255,255,0.25)",
            background:"rgba(255,255,255,0.12)",
            display:"flex",alignItems:"center",justifyContent:"center",
            cursor:"pointer",color:"rgba(255,255,255,0.8)",
          }}><X size={16}/></button>
        </div>

        {/* ── BODY ── */}
        <div style={{padding:"22px 24px",display:"flex",flexDirection:"column",gap:20}}>

          {/* Auto DOL / PMA banner */}
          {(dol || pma) && (
            <div style={{
              display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",
              background:"#EFF6FF",border:"1px solid #BFDBFE",
              borderRadius:10,padding:"10px 14px",
            }}>
              {dol && (
                <span style={{
                  display:"inline-flex",alignItems:"center",gap:5,
                  background:"#fff",border:"1px solid #BFDBFE",borderRadius:7,
                  padding:"4px 11px",fontSize:12,fontWeight:700,color:"#1558A0",
                }}>📅 Day {dol}</span>
              )}
              {pma && (
                <span style={{
                  display:"inline-flex",alignItems:"center",gap:5,
                  background:"#fff",border:"1px solid #DDD6FE",borderRadius:7,
                  padding:"4px 11px",fontSize:12,fontWeight:700,color:"#7C3AED",
                }}>⏱ {formatPMA(pma)}</span>
              )}
              <span style={{fontSize:10,color:"#94A3B8",fontStyle:"italic",marginLeft:"auto"}}>
                Auto-calculated
              </span>
            </div>
          )}

          {/* Scan Date + Sonographer */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <label style={{fontSize:10,fontWeight:700,color:"#64748B",textTransform:"uppercase",letterSpacing:"0.08em"}}>
                Scan Date *
              </label>
              <input type="date" value={form.scanDate}
                onChange={e=>set("scanDate",e.target.value)}
                style={inp}
                onFocus={e=>{e.target.style.borderColor="#0F4C81";e.target.style.boxShadow="0 0 0 3px rgba(15,76,129,0.1)";}}
                onBlur={e=>{e.target.style.borderColor="#E2E8F0";e.target.style.boxShadow="none";}}
              />
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <label style={{fontSize:10,fontWeight:700,color:"#64748B",textTransform:"uppercase",letterSpacing:"0.08em"}}>
                Sonographer
              </label>
              <input type="text" placeholder="Dr. Name" value={form.sonographer}
                onChange={e=>set("sonographer",e.target.value)}
                style={inp}
                onFocus={e=>{e.target.style.borderColor="#0F4C81";e.target.style.boxShadow="0 0 0 3px rgba(15,76,129,0.1)";}}
                onBlur={e=>{e.target.style.borderColor="#E2E8F0";e.target.style.boxShadow="none";}}
              />
            </div>
          </div>

          {/* ── Grade section header ── */}
          <div style={{
            display:"flex",alignItems:"center",gap:10,
            marginBottom:-8,
          }}>
            <span style={{
              fontSize:11,fontWeight:700,color:"#94A3B8",
              textTransform:"uppercase",letterSpacing:"0.08em",
            }}>Grading</span>
            <div style={{flex:1,height:1,background:"#F1F5F9"}}/>
          </div>

          {/* ── Grade columns RIGHT | LEFT ── */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>

            {/* RIGHT */}
            <div style={{
              background:"#F7FBFF",
              border:"1px solid #DBEAFE",
              borderTop:"3px solid #0F4C81",
              borderRadius:14,
              padding:"16px 16px 18px",
              display:"flex",flexDirection:"column",gap:18,
            }}>
              {/* RIGHT badge */}
              <div style={{
                display:"inline-flex",alignItems:"center",gap:6,
                background:"#EFF6FF",border:"1px solid #BFDBFE",
                borderRadius:6,padding:"4px 10px",
                width:"fit-content",
              }}>
                <div style={{width:6,height:6,borderRadius:"50%",background:"#0F4C81",flexShrink:0}}/>
                <span style={{fontSize:10,fontWeight:800,color:"#1558A0",letterSpacing:"0.1em",textTransform:"uppercase"}}>RIGHT</span>
              </div>

              <GradePills label="IVH Grade"  value={form.ivhGradeRight}  onChange={v=>set("ivhGradeRight",v)}/>

              <div style={{height:1,background:"#DBEAFE"}}/>

              <GradePills label="cPVL Grade" value={form.cpvlGradeRight} onChange={v=>set("cpvlGradeRight",v)}/>
            </div>

            {/* LEFT */}
            <div style={{
              background:"#FAFAFA",
              border:"1px solid #E2E8F0",
              borderTop:"3px solid #64748B",
              borderRadius:14,
              padding:"16px 16px 18px",
              display:"flex",flexDirection:"column",gap:18,
            }}>
              {/* LEFT badge */}
              <div style={{
                display:"inline-flex",alignItems:"center",gap:6,
                background:"#F1F5F9",border:"1px solid #CBD5E1",
                borderRadius:6,padding:"4px 10px",
                width:"fit-content",
              }}>
                <div style={{width:6,height:6,borderRadius:"50%",background:"#64748B",flexShrink:0}}/>
                <span style={{fontSize:10,fontWeight:800,color:"#475569",letterSpacing:"0.1em",textTransform:"uppercase"}}>LEFT</span>
              </div>

              <GradePills label="IVH Grade"  value={form.ivhGradeLeft}  onChange={v=>set("ivhGradeLeft",v)}/>

              <div style={{height:1,background:"#E2E8F0"}}/>

              <GradePills label="cPVL Grade" value={form.cpvlGradeLeft} onChange={v=>set("cpvlGradeLeft",v)}/>
            </div>
          </div>

          {/* High-grade alert */}
          {highGrade && (
            <div style={{
              display:"flex",alignItems:"flex-start",gap:10,
              background:"#FFFBEB",border:"1px solid #FCD34D",
              borderRadius:10,padding:"11px 14px",
              color:"#78350F",fontSize:12,lineHeight:1.6,
            }}>
              <AlertTriangle size={14} color="#D97706" style={{flexShrink:0,marginTop:1}}/>
              <span>High-grade finding detected — Brain Injury Composite will be marked <strong>Positive</strong></span>
            </div>
          )}

          {/* Findings */}
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            <label style={{fontSize:10,fontWeight:700,color:"#64748B",textTransform:"uppercase",letterSpacing:"0.08em"}}>
              Findings / Notes
            </label>
            <textarea rows={3}
              placeholder="Echogenicity, ventriculomegaly signs, other observations…"
              value={form.findings}
              onChange={e=>set("findings",e.target.value)}
              style={{
                ...inp,
                resize:"vertical",
                minHeight:84,
                lineHeight:1.6,
              }}
              onFocus={e=>{e.target.style.borderColor="#0F4C81";e.target.style.boxShadow="0 0 0 3px rgba(15,76,129,0.1)";}}
              onBlur={e=>{e.target.style.borderColor="#E2E8F0";e.target.style.boxShadow="none";}}
            />
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{
          display:"flex",gap:10,
          padding:"14px 24px 22px",
          borderTop:"1px solid #F1F5F9",
        }}>
          <button type="button" onClick={onCancel}
            style={{
              flex:1,padding:"12px",borderRadius:10,
              border:"1.5px solid #E2E8F0",background:"#fff",
              fontFamily:"Inter,system-ui,sans-serif",
              fontSize:13,fontWeight:700,color:"#475569",cursor:"pointer",
              transition:"all 0.13s",
            }}
            onMouseEnter={e=>{e.currentTarget.style.background="#F8FAFC";e.currentTarget.style.borderColor="#CBD5E1";}}
            onMouseLeave={e=>{e.currentTarget.style.background="#fff";e.currentTarget.style.borderColor="#E2E8F0";}}
          >Cancel</button>
          <button type="button" onClick={handleSave}
            style={{
              flex:2,padding:"12px",borderRadius:10,border:"none",
              background:"linear-gradient(135deg,#0F4C81,#1558A0)",
              color:"#fff",
              fontFamily:"Inter,system-ui,sans-serif",
              fontSize:13,fontWeight:700,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",gap:7,
              boxShadow:"0 4px 14px rgba(15,76,129,0.4)",
              transition:"all 0.15s",
            }}
            onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 6px 20px rgba(15,76,129,0.5)";}}
            onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 4px 14px rgba(15,76,129,0.4)";}}
          >
            <Check size={15}/> Save Scan Record
          </button>
        </div>

      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */

function YNSegment({ value, onChange, disabled }) {
  return (
    <div className="fh-yn">
      <button type="button" className={`fh-yn-btn${value===true?" fh-yn-yes":""}`}
        onClick={() => !disabled && onChange(value===true?null:true)} disabled={disabled}>Yes</button>
      <button type="button" className={`fh-yn-btn${value===false?" fh-yn-no":""}`}
        onClick={() => !disabled && onChange(value===false?null:false)} disabled={disabled}>No</button>
    </div>
  );
}

export default function FormF() {
  const { enrollmentId } = useParams();
  const navigate   = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { user }   = useAuth();

  const [loading, setLoading]         = useState(false);
  const [isSaved, setIsSaved]         = useState(false);
  const [isEditing, setIsEditing]     = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [message, setMessage]         = useState("");
  const [savedAt, setSavedAt]         = useState(null);
  const [savedBy, setSavedBy]         = useState("");

  const [patientInfo, setPatientInfo] = useState({
    enrollmentId: enrollmentId||"",
    babyUid:"", gaWeeks:null, gaDays:null,
    gestationalAge:"", birthWeight:"", dob:"", status:"In NICU",
  });

  // Scan entries — DOL/PMA auto-calculated, never stored as user input
  const [scanEntries, setScanEntries]       = useState([]);
  const [showScanModal, setShowScanModal]   = useState(false);
  const [editingScan, setEditingScan]       = useState(null);
  const [expandedScanId, setExpandedScanId] = useState(null);
  const [scheduleKey, setScheduleKey]       = useState(null);

  // Complications
  const [complications, setComplications] = useState({
    phvd:null, phvdDate:"", vpShunt:null, vpShuntDate:"",
  });
  const setComp = (k,v) => setComplications(p=>({...p,[k]:v}));

  // Other findings — improvement 6: added otherFinding + otherText
  const [otherFindings, setOtherFindings] = useState({
    ventriculomegaly:false, subependymalCyst:false,
    choroidPlexusCyst:false, cerebellarHemorrhage:false,
    subduralHemorrhage:false, otherFinding:false, otherText:"",
  });
  const setFinding = (k,v) => setOtherFindings(p=>({...p,[k]:v}));

  const isFieldEditable = !isSubmitted && (!isSaved || isEditing);

  /* ── Load ── */
  useEffect(() => {
    if (!enrollmentId) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/birth-resuscitation/${enrollmentId}`);
        const b   = res?.data || {};
        const gaW = b.gestation_weeks ?? null;
        const gaD = b.gestation_days  ?? null;
        setPatientInfo({
          enrollmentId,
          babyUid:        b.baby_uid||"",
          gaWeeks:        gaW,
          gaDays:         gaD,
          gestationalAge: gaW && gaD!==null ? `${gaW}+${gaD} wks` : "",
          birthWeight:    b.birth_weight ? `${b.birth_weight} g` : "",
          dob:            b.date_of_birth||"",
          status:         b.discharge_date ? "Discharged" : "In NICU",
        });
        if (gaW !== null) setScheduleKey(gaW < 28 ? "lt28" : "w28_31");
      } catch (_) {}
      try {
        const res = await api.get(`/form-h/${enrollmentId}`);
        const fh  = res?.data || {};
        if (fh && Object.keys(fh).length > 0) {
          // Ensure scan_entries is always an array, handle null/undefined from backend
          const entries = Array.isArray(fh.scan_entries) ? fh.scan_entries : [];
          // Re-assign stable _id if missing (old records saved before _id was added)
          setScanEntries(entries.map((s, i) => ({
            ...s,
            _id: s._id || (Date.now() + i),
            scanNumber: s.scanNumber || (i + 1),
          })));
          setComplications({
            phvd:        fh.phvd       ?? null,
            phvdDate:    fh.phvd_diagnosis_date||"",
            vpShunt:     fh.vp_shunt   ?? null,
            vpShuntDate: fh.vp_shunt_insertion_date||"",
          });
          setOtherFindings({
            ventriculomegaly:    fh.ventriculomegaly     ||false,
            subependymalCyst:    fh.subependymal_cyst    ||false,
            choroidPlexusCyst:   fh.choroid_plexus_cyst  ||false,
            cerebellarHemorrhage:fh.cerebellar_hemorrhage||false,
            subduralHemorrhage:  fh.subdural_hemorrhage  ||false,
            otherFinding:        fh.other_finding        ||false,
            otherText:           fh.other_finding_text   ||"",
          });
          if (fh.schedule_key) setScheduleKey(fh.schedule_key);
          setIsSubmitted(fh.submission_status === STATUS.SUBMITTED);
          setIsSaved(true);
          setSavedAt(fh.saved_at||null);
          setSavedBy(fh.saved_by||"");
        }
      } catch (err) {
        if (err?.response?.status !== 404) setMessage("❌ Failed to load form data.");
      } finally { setLoading(false); }
    };
    load();
  }, [enrollmentId]);

  /* ── Auto-enriched scan entries (DOL + PMA from date) ── */
  const enrichedScans = useMemo(() =>
    scanEntries.map(s => {
      // Prefer re-calculating from DOB; fall back to the stored dol saved by the modal
      const dolFromDate = calcDOL(s.scanDate, patientInfo.dob);
      const dol = dolFromDate ?? (s.dol !== undefined && s.dol !== null ? Number(s.dol) : null);
      const pma = calcPMA(patientInfo.gaWeeks, patientInfo.gaDays, dol);
      return { ...s, dolCalc: dol, pmaCalc: pma };
    }),
    [scanEntries, patientInfo.dob, patientInfo.gaWeeks, patientInfo.gaDays]
  );

  /* ── Auto-calculations ── */
  const calcMaxIVH = (side) => {
    let max={grade:"None",date:"—",dol:"—",pma:"—"},maxV=-1;
    enrichedScans.forEach(e => {
      const g = side==="right" ? e.ivhGradeRight : e.ivhGradeLeft;
      const v = getGradeNum(g);
      if (v>maxV) { maxV=v; max={grade:g||"None",date:formatDateDMY(e.scanDate)||"—",dol:e.dolCalc?`Day ${e.dolCalc}`:"—",pma:formatPMA(e.pmaCalc)}; }
    });
    return max;
  };
  const calcMaxCPVL = (side) => {
    let max={grade:"None",date:"—",dol:"—",pma:"—"},maxV=-1;
    enrichedScans.forEach(e => {
      const g = side==="right" ? e.cpvlGradeRight : e.cpvlGradeLeft;
      const v = getGradeNum(g);
      if (v>maxV) { maxV=v; max={grade:g||"None",date:formatDateDMY(e.scanDate)||"—",dol:e.dolCalc?`Day ${e.dolCalc}`:"—",pma:formatPMA(e.pmaCalc)}; }
    });
    return max;
  };

  const maxRIVH  = calcMaxIVH("right");
  const maxLIVH  = calcMaxIVH("left");
  const maxRCPVL = calcMaxCPVL("right");
  const maxLCPVL = calcMaxCPVL("left");

  const brainInjury = enrichedScans.some(e =>
    getGradeNum(e.ivhGradeRight)>=3 || getGradeNum(e.ivhGradeLeft)>=3 ||
    getGradeNum(e.cpvlGradeRight)>=2|| getGradeNum(e.cpvlGradeLeft)>=2
  );

  const compliance = useMemo(() =>
    calcCompliance(scanEntries, scheduleKey, patientInfo.gaWeeks, patientInfo.gaDays, patientInfo.dob),
    [scanEntries, scheduleKey, patientInfo]
  );

  // Completion % (no verification section)
  const completionPct = useMemo(() => {
    let f=0,a=0;
    f+=1; if(enrichedScans.length>0) a+=1;
    f+=2;
    if(complications.phvd!==null) a+=1;
    if(complications.vpShunt!==null) a+=1;
    if(complications.phvd===true){ f+=1; if(complications.phvdDate) a+=1; }
    if(complications.vpShunt===true){ f+=1; if(complications.vpShuntDate) a+=1; }
    return Math.min(100, Math.round((a/f)*100));
  }, [enrichedScans, complications]);

  // Clinical summary text (improvement 11)
  const clinicalSummary = useMemo(() => {
    if (!enrichedScans.length) return "No scans recorded yet.";
    const parts = [];
    parts.push(`${enrichedScans.length} scan${enrichedScans.length>1?"s":""} completed.`);
    const maxIVH = Math.max(
      getGradeNum(maxRIVH.grade), getGradeNum(maxLIVH.grade)
    );
    if (maxIVH > 0) {
      const side = getGradeNum(maxRIVH.grade) >= getGradeNum(maxLIVH.grade) ? "right" : "left";
      parts.push(`Highest IVH Grade ${["None","I","II","III","IV"][maxIVH]} on ${side} (${maxIVH===getGradeNum(maxRIVH.grade)?maxRIVH.dol:maxLIVH.dol}).`);
    } else { parts.push("No IVH detected."); }
    const maxCPVL = Math.max(
      getGradeNum(maxRCPVL.grade), getGradeNum(maxLCPVL.grade)
    );
    if (maxCPVL > 0) {
      const side = getGradeNum(maxRCPVL.grade) >= getGradeNum(maxLCPVL.grade) ? "right" : "left";
      parts.push(`Highest cPVL Grade ${["None","I","II","III","IV"][maxCPVL]} on ${side} (${maxCPVL===getGradeNum(maxRCPVL.grade)?maxRCPVL.dol:maxLCPVL.dol}).`);
    } else { parts.push("No cPVL detected."); }
    if (complications.phvd===true) parts.push("PHVD present.");
    if (complications.vpShunt===true) parts.push("VP Shunt/Reservoir required.");
    parts.push(`Brain Injury Composite: ${brainInjury?"Positive ⚠️":"Negative ✓"}.`);
    return parts.join(" ");
  }, [enrichedScans, maxRIVH, maxLIVH, maxRCPVL, maxLCPVL, complications, brainInjury]);

  /* ── Timeline step status ── */
  const stepStatus = (step) => {
    if (step.pmaWk !== null) {
      const done = enrichedScans.some(e => {
        if (e.pmaCalc && Math.abs(e.pmaCalc.weeks - step.pmaWk) <= 1) return true;
        if (e.pma) { const p = parseInt(e.pma); if (!isNaN(p) && Math.abs(p - step.pmaWk) <= 1) return true; }
        return false;
      });
      return done ? "done" : "scheduled";
    }
    // Fall back to stored dol if dolCalc is null (DOB not yet loaded)
    return enrichedScans.some(e => {
      const d = e.dolCalc ?? (e.dol !== undefined && e.dol !== null ? Number(e.dol) : NaN);
      return !isNaN(d) && d >= step.dolMin && d <= step.dolMax;
    }) ? "done" : "pending";
  };

  /* ── SCAN CRUD ── */
  const handleSaveScan = (form) => {
    let list;
    if (editingScan !== null) {
      list = scanEntries.map(s => s._id===editingScan ? {...form, _id:editingScan} : s);
    } else {
      // Ensure _id is always a stable number, not zero or undefined
      const newId = Date.now() + Math.floor(Math.random() * 1000);
      list = [...scanEntries, {...form, _id: newId}];
    }
    const sorted = list
      .sort((a,b) => new Date(a.scanDate) - new Date(b.scanDate))
      .map((s,i) => ({...s, scanNumber: i+1}));
    setScanEntries(sorted);
    setShowScanModal(false);
    setEditingScan(null);
    // Auto-save after adding/editing a scan so data is never lost
    setIsSaved(false); // Force POST/PUT on next save
  };

  const handleDeleteScan = (_id) => {
    if (!isFieldEditable) return;
    if (!window.confirm("Delete this scan entry?")) return;
    const filtered = scanEntries.filter(s=>s._id!==_id);
    setScanEntries(filtered.sort((a,b)=>new Date(a.scanDate)-new Date(b.scanDate)).map((s,i)=>({...s,scanNumber:i+1})));
  };

  /* ── Save / Submit ── */
  const buildPayload = (now) => ({
    enrollment_id:           enrollmentId,
    // Strip runtime-computed dolCalc/pmaCalc — only store persistent fields
    scan_entries: scanEntries.map(({ dolCalc, pmaCalc, ...rest }) => rest),
    phvd:                    complications.phvd,
    phvd_diagnosis_date:     complications.phvdDate,
    vp_shunt:                complications.vpShunt,
    vp_shunt_insertion_date: complications.vpShuntDate,
    ventriculomegaly:        otherFindings.ventriculomegaly,
    subependymal_cyst:       otherFindings.subependymalCyst,
    choroid_plexus_cyst:     otherFindings.choroidPlexusCyst,
    cerebellar_hemorrhage:   otherFindings.cerebellarHemorrhage,
    subdural_hemorrhage:     otherFindings.subduralHemorrhage,
    other_finding:           otherFindings.otherFinding,
    other_finding_text:      otherFindings.otherText,
    brain_injury_composite:  brainInjury,
    schedule_key:            scheduleKey,
    submission_status:       STATUS.DRAFT,
    saved_at:                now,
    saved_by:                user?.name||user?.username||"Site Staff",
  });

  const handleSaveDraft = async () => {
    if (!enrollmentId || isSubmitted) return;
    const now = new Date().toISOString();
    try {
      const payload = buildPayload(now);
      isSaved
        ? await api.put(`/form-h/${enrollmentId}`, payload)
        : await api.post("/form-h/", payload);
      markFormCompleted("form_h");
      setIsSaved(true); setIsEditing(false);
      setSavedAt(now); setSavedBy(user?.name||user?.username||"Site Staff");
      setMessage("✅ Form F saved successfully.");
      setTimeout(()=>setMessage(""),3000);
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || "Unknown error";
      setMessage(`❌ Error saving: ${detail}`);
    }
  };

  const handleNext = async () => {
    // Save first; navigate only when save succeeds
    try {
      if (!isSubmitted) {
        const now = new Date().toISOString();
        const payload = buildPayload(now);
        isSaved
          ? await api.put(`/form-h/${enrollmentId}`, payload)
          : await api.post("/form-h/", payload);
        markFormCompleted("form_h");
        setIsSaved(true);
        setSavedAt(now);
      }
    } catch (_) {
      setMessage("❌ Error saving before navigation.");
      return; // Don't navigate if save failed
    }
    navigate(`/form-g/${enrollmentId}`);
  };

  const schedule = scheduleKey ? SCHEDULES[scheduleKey] : null;

  /* ════════════════════ RENDER ════════════════════ */
  return (
    <>
      {isSaved && isEditing && (
        <div className="fh-editing-banner">
          <span className="fh-editing-dot"/>
          Editing Mode Active — changes will be saved when you click Save
        </div>
      )}

      <div className="fh-page">

        {/* ══ PATIENT CONTEXT BAR ══ */}
        <div className="fh-context-bar">
          <div className="fh-context-trial">
            <div className="fh-context-trial-icon">⊕</div>
            <div className="fh-context-trial-info">
              <span className="fh-context-name">PORTAL TRIAL</span>
              <span className="fh-context-sub">Form F — Cranial USG</span>
            </div>
          </div>
          <div className="fh-context-fields">
            {[
              {label:"Enrolment ID",    value:patientInfo.enrollmentId||"—"},
              {label:"Baby UID",        value:patientInfo.babyUid||"—"},
              {label:"GA at Birth",     value:patientInfo.gestationalAge||"—"},
              {label:"Birth Weight",    value:patientInfo.birthWeight||"—"},
              {label:"DOB",             value:formatDateDMY(patientInfo.dob)},
            ].map((f,i,arr)=>(
              <div key={f.label} className={`fh-context-field${i===arr.length-1?" fh-context-field--last":""}`}>
                <span className="fh-context-field-label">{f.label}</span>
                <span className="fh-context-field-value">{f.value}</span>
              </div>
            ))}
          </div>
          {isSaved && !isSubmitted && (
            <button type="button"
              className={`fh-edit-btn${isEditing?" fh-edit-btn--active":""}`}
              onClick={()=>setIsEditing(p=>!p)} style={{flexShrink:0}}>
              {isEditing?"✓ Done":"Edit"}
            </button>
          )}
        </div>

        {/* ══ IMPROVEMENT 12: RESEARCH QUALITY / PROTOCOL COMPLIANCE ══ */}
        <div className="fh-compliance-bar">
          <div className="fh-compliance-item">
            <TrendingUp size={14}/>
            <span className="fh-compliance-label">Protocol Compliance</span>
            <span className="fh-compliance-val fh-compliance-val--pct">
              {compliance ? `${compliance.pct}%` : "—"}
            </span>
          </div>
          <div className="fh-compliance-divider"/>
          <div className="fh-compliance-item">
            <ClipboardList size={14}/>
            <span className="fh-compliance-label">Expected Scans</span>
            <span className="fh-compliance-val">{compliance?.expected ?? "—"}</span>
          </div>
          <div className="fh-compliance-divider"/>
          <div className="fh-compliance-item fh-compliance-item--good">
            <Check size={14}/>
            <span className="fh-compliance-label">Completed</span>
            <span className="fh-compliance-val">{compliance?.completed ?? "—"}</span>
          </div>
          <div className="fh-compliance-divider"/>
          <div className={`fh-compliance-item${compliance?.missed>0?" fh-compliance-item--warn":""}`}>
            <AlertCircle size={14}/>
            <span className="fh-compliance-label">Missed / Pending</span>
            <span className="fh-compliance-val">{compliance?.missed ?? "—"}</span>
          </div>
          <div className="fh-compliance-divider"/>
          <div className={`fh-compliance-item${brainInjury?" fh-compliance-item--danger":""}`}>
            <Activity size={14}/>
            <span className="fh-compliance-label">Brain Injury</span>
            <span className="fh-compliance-val">{enrichedScans.length>0 ? (brainInjury?"Positive":"Negative") : "—"}</span>
          </div>
          {isSubmitted && (
            <div className="fh-compliance-divider"/>
          )}
          {isSubmitted && (
            <div className="fh-compliance-item fh-compliance-item--locked">
              <Lock size={13}/><span className="fh-compliance-label">Form Locked</span>
            </div>
          )}
        </div>

        {/* ══ SECTION 1: SCHEDULE + TIMELINE ══ */}
        <div className="fh-body">
        <div className="fh-card">
          <div className="fh-card-header">
            <div className="fh-card-header-left">
              <div className="fh-card-icon"><Calendar size={18}/></div>
              <h3 className="fh-card-title">Surveillance Schedule</h3>
            </div>
            <div className="fh-schedule-tabs">
              {Object.entries(SCHEDULES).map(([key,sch])=>(
                <button key={key} type="button"
                  className={`fh-schedule-tab${scheduleKey===key?" fh-schedule-tab--active":""}`}
                  style={scheduleKey===key?{borderColor:sch.color,color:sch.color,background:sch.color+"18"}:{}}
                  onClick={()=>setScheduleKey(key)}>{sch.label}</button>
              ))}
            </div>
          </div>

          {schedule && (
            <div className="fh-timeline-scroll">
              <div className="fh-timeline">
                <div className="fh-timeline-track"/>
                {schedule.steps.map((step,i)=>{
                  const st = stepStatus(step);
                  return (
                    <div key={i} className={`fh-timeline-step fh-timeline-step--${st}`}>
                      <div className="fh-timeline-circle">
                        {st==="done" ? <Check size={14}/> : <span className="fh-step-num">{i+1}</span>}
                      </div>
                      <div className="fh-timeline-label">{step.label}</div>
                      <div className="fh-timeline-sub">{step.sub}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="fh-schedule-info">
            <Info size={12}/>
            <span>Steps turn green when a scan entry with matching DOL (auto-calculated) is recorded. Additional scans added if clinically indicated.</span>
          </div>
        </div>

        {/* ══ SECTION 2: SCAN RECORDS ══ */}
        <div className="fh-card">
          <div className="fh-card-header">
            <div className="fh-card-header-left">
              <div className="fh-card-icon"><Activity size={18}/></div>
              <h3 className="fh-card-title">F1. Ultrasound Screening Records</h3>
            </div>
            {isFieldEditable && (
              <button type="button" className="fh-btn-add-scan"
                style={{ width: "fit-content", alignSelf: "flex-start" }}
                onClick={()=>{setEditingScan(null);setShowScanModal(true);}}>
                <Plus size={12}/> Add Scan
              </button>
            )}
          </div>

          {enrichedScans.length===0 ? (
            <div className="fh-empty">
              <div className="fh-empty-icon">🔬</div>
              <p>No cranial ultrasound scans recorded yet.</p>
              {isFieldEditable && (
                <button type="button" className="fh-btn fh-btn--primary"
                  style={{ width: "fit-content" }}
                  onClick={()=>{setEditingScan(null);setShowScanModal(true);}}>
                  <Plus size={14}/> Record First Scan
                </button>
              )}
            </div>
          ) : (
            <div className="fh-scan-list">
              {enrichedScans.map(scan=>{
                const isExpanded = expandedScanId===scan._id;
                const hasHigh = getGradeNum(scan.ivhGradeRight)>=3||getGradeNum(scan.ivhGradeLeft)>=3||
                  getGradeNum(scan.cpvlGradeRight)>=2||getGradeNum(scan.cpvlGradeLeft)>=2;
                const win = guessProtocolWindow(scan.dolCalc, scheduleKey);
                return (
                  <div key={scan._id} className={`fh-scan-row${hasHigh?" fh-scan-row--alert":""}`}>
                    <div className="fh-scan-row-header" onClick={()=>setExpandedScanId(isExpanded?null:scan._id)}>
                      <div className="fh-scan-row-left">
                        <span className="fh-scan-badge">#{scan.scanNumber}</span>
                        <div className="fh-scan-meta">
                          <span className="fh-scan-date">📅 {formatDateDMY(scan.scanDate)}</span>
                          {scan.dolCalc && <span className="fh-scan-dol-auto">Day {scan.dolCalc}</span>}
                          {scan.pmaCalc && <span className="fh-scan-pma-auto">PMA {formatPMA(scan.pmaCalc)}</span>}
                          {win && <span className="fh-scan-window-tag">{win.label}</span>}
                        </div>
                      </div>
                      <div className="fh-scan-row-right">
                        <div className="fh-scan-grades">
                          <span className={`fh-grade-chip${getGradeNum(scan.ivhGradeRight)>0||getGradeNum(scan.ivhGradeLeft)>0?" fh-grade-chip--active":""}`}>
                            IVH R:{scan.ivhGradeRight||"—"} / L:{scan.ivhGradeLeft||"—"}
                          </span>
                          <span className={`fh-grade-chip${getGradeNum(scan.cpvlGradeRight)>0||getGradeNum(scan.cpvlGradeLeft)>0?" fh-grade-chip--active":""}`}>
                            cPVL R:{scan.cpvlGradeRight||"—"} / L:{scan.cpvlGradeLeft||"—"}
                          </span>
                        </div>
                        <div className="fh-scan-actions">
                          {isFieldEditable && (
                            <>
                              <button type="button" className="fh-action-btn fh-action-btn--edit"
                                onClick={e=>{e.stopPropagation();setEditingScan(scan._id);setShowScanModal(true);}}>
                                <Edit3 size={14}/> Edit
                              </button>
                              <button type="button" className="fh-action-btn fh-action-btn--delete"
                                onClick={e=>{e.stopPropagation();handleDeleteScan(scan._id);}}>
                                <Trash2 size={14}/> Delete
                              </button>
                            </>
                          )}
                          <div className={`fh-chevron${isExpanded?" fh-chevron--open":""}`}>
                            <ChevronDown size={15}/>
                          </div>
                        </div>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="fh-scan-expanded">
                        <div className="fh-scan-expanded-grid">
                          <div className="fh-scan-expanded-col">
                            <div className="fh-scan-expanded-label">Sonographer</div>
                            <div className="fh-scan-expanded-val">{scan.sonographer||"—"}</div>
                          </div>
                          <div className="fh-scan-expanded-col">
                            <div className="fh-scan-expanded-label">DOL (Auto)</div>
                            <div className="fh-scan-expanded-val fh-auto-value">Day {scan.dolCalc||"—"}</div>
                          </div>
                          <div className="fh-scan-expanded-col">
                            <div className="fh-scan-expanded-label">PMA (Auto)</div>
                            <div className="fh-scan-expanded-val fh-auto-value">{formatPMA(scan.pmaCalc)}</div>
                          </div>
                          <div className="fh-scan-expanded-col">
                            <div className="fh-scan-expanded-label">IVH (R / L)</div>
                            <div className="fh-scan-expanded-val">{scan.ivhGradeRight||"None"} / {scan.ivhGradeLeft||"None"}</div>
                          </div>
                          <div className="fh-scan-expanded-col">
                            <div className="fh-scan-expanded-label">cPVL (R / L)</div>
                            <div className="fh-scan-expanded-val">{scan.cpvlGradeRight||"None"} / {scan.cpvlGradeLeft||"None"}</div>
                          </div>
                          <div className="fh-scan-expanded-col" style={{gridColumn:"span 2"}}>
                            <div className="fh-scan-expanded-label">Findings</div>
                            <div className="fh-scan-expanded-val">{scan.findings||"No additional findings recorded."}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ══ SECTION 3: SUMMARY PANELS (F2) ══ */}
        <h3 className="fh-section-heading">F2. Detailed Findings &amp; Summary</h3>
        <div className="fh-summary-grid">
          {/* IVH */}
          <div className="fh-summary-panel">
            <div className="fh-summary-panel-header">
              <span className="fh-summary-panel-emoji">🧠</span>
              <div>
                <h4 className="fh-summary-panel-title">IVH Summary</h4>
                <p className="fh-summary-panel-sub">Papile Classification</p>
              </div>
            </div>
            <div className="fh-summary-panel-body">
              {[{side:"RIGHT",data:maxRIVH,num:1},{side:"LEFT",data:maxLIVH,num:2}].map(({side,data,num})=>(
                <div key={side} className="fh-summary-side">
                  <div className={`fh-side-label fh-side-label--${side.toLowerCase()}`}>{side}</div>
                  <div className="fh-summary-item-label">{num}. Max IVH Grade</div>
                  <div className={`fh-summary-grade-display${getGradeNum(data.grade)>=3?" fh-summary-grade-display--high":""}`}>{data.grade}</div>
                  <div className="fh-summary-side-meta">
                    <div><span>{num}a. Date</span><span>{data.date}</span></div>
                    <div><span>{num}b. DOL</span><span className="fh-auto-value">{data.dol}</span></div>
                    <div><span>{num}c. PMA</span><span className="fh-auto-value">{data.pma}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* cPVL — improvement 4: PMA added */}
          <div className="fh-summary-panel">
            <div className="fh-summary-panel-header">
              <span className="fh-summary-panel-emoji">🔬</span>
              <div>
                <h4 className="fh-summary-panel-title">cPVL Summary</h4>
                <p className="fh-summary-panel-sub">De Vries Classification</p>
              </div>
            </div>
            <div className="fh-summary-panel-body">
              {[{side:"RIGHT",data:maxRCPVL,num:3},{side:"LEFT",data:maxLCPVL,num:4}].map(({side,data,num})=>(
                <div key={side} className="fh-summary-side">
                  <div className={`fh-side-label fh-side-label--${side.toLowerCase()}`}>{side}</div>
                  <div className="fh-summary-item-label">{num}. Max cPVL</div>
                  <div className={`fh-summary-grade-display${getGradeNum(data.grade)>=2?" fh-summary-grade-display--high":""}`}>{data.grade}</div>
                  <div className="fh-summary-side-meta">
                    <div><span>{num}a. Date</span><span>{data.date}</span></div>
                    <div><span>{num}b. DOL</span><span className="fh-auto-value">{data.dol}</span></div>
                    <div><span>{num}c. PMA</span><span className="fh-auto-value">{data.pma}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Brain Injury Composite */}
          <div className={`fh-brain-injury-card${brainInjury?" fh-brain-injury-card--positive":" fh-brain-injury-card--negative"}`}>
            <div className="fh-brain-injury-left">
              <span className="fh-brain-injury-emoji">🧠</span>
              <div>
                <h4 className="fh-brain-injury-title">8. Brain Injury for Composite Outcome</h4>
                <p className="fh-brain-injury-desc">IVH ≥ III and/or cPVL ≥ II (CRF §8)</p>
              </div>
            </div>
            <div className="fh-brain-injury-badge">
              <span className="fh-brain-injury-badge-label">AUTO-CALCULATED</span>
              <span className="fh-brain-injury-status">{brainInjury?"Positive":"Negative"}</span>
              <span className="fh-brain-injury-status-sub">{brainInjury?"⚠️ Severe brain injury detected":"✓ No severe brain injury"}</span>
            </div>
          </div>

          {/* Improvement 11: Clinical Summary Card */}
          <div className="fh-clinical-summary-card">
            <div className="fh-clinical-summary-header">
              <ClipboardList size={16}/>
              <h4 className="fh-clinical-summary-title">Auto-Generated Clinical Summary</h4>
              <span className="fh-auto-tag">AUTO</span>
            </div>
            <p className="fh-clinical-summary-text">{clinicalSummary}</p>
          </div>
        </div>

        {/* ══ SECTION 4: COMPLICATIONS ══ */}
        <div className="fh-two-col">
          <div className="fh-card">
            <div className="fh-card-header">
              <div className="fh-card-header-left">
                <div className="fh-card-icon"><AlertTriangle size={18}/></div>
                <h3 className="fh-card-title">Post-Hemorrhagic Complications</h3>
              </div>
            </div>
            <div className="fh-complications">
              {/* PHVD */}
              <div className="fh-complication-item">
                <div className="fh-complication-row">
                  <div className="fh-complication-info">
                    <div className="fh-complication-title">5. Post-Hemorrhagic Ventricular Dilatation (PHVD)</div>
                    <div className="fh-complication-sub">Post-hemorrhagic ventricular dilatation</div>
                  </div>
                  <YNSegment value={complications.phvd}
                    onChange={v=>{setComp("phvd",v);if(v!==true)setComp("phvdDate","");}}
                    disabled={!isFieldEditable}/>
                </div>
                {complications.phvd===true && (
                  <div className="fh-complication-nested">
                    <label className="fh-label">5a. Date</label>
                    <input type="date" className="fh-input fh-input--sm"
                      value={complications.phvdDate}
                      onChange={e=>setComp("phvdDate",e.target.value)}
                      disabled={!isFieldEditable}/>
                  </div>
                )}
              </div>
              {/* VP Shunt */}
              <div className="fh-complication-item">
                <div className="fh-complication-row">
                  <div className="fh-complication-info">
                    <div className="fh-complication-title">6. VP Shunt / Reservoir Required</div>
                    <div className="fh-complication-sub">Surgical CSF drainage intervention</div>
                  </div>
                  <YNSegment value={complications.vpShunt}
                    onChange={v=>{setComp("vpShunt",v);if(v!==true)setComp("vpShuntDate","");}}
                    disabled={!isFieldEditable}/>
                </div>
                {complications.vpShunt===true && (
                  <div className="fh-complication-nested">
                    <label className="fh-label">6a. Date</label>
                    <input type="date" className="fh-input fh-input--sm"
                      value={complications.vpShuntDate}
                      onChange={e=>setComp("vpShuntDate",e.target.value)}
                      disabled={!isFieldEditable}/>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Improvement 6: Other Findings with otherFinding checkbox + textarea */}
          <div className="fh-card">
            <div className="fh-card-header">
              <div className="fh-card-header-left">
                <div className="fh-card-icon"><FileText size={18}/></div>
                <h3 className="fh-card-title">7. Other Ultrasound Findings</h3>
              </div>
            </div>
            <div className="fh-findings-grid">
              {[
                {k:"ventriculomegaly",    l:"Ventriculomegaly"},
                {k:"subependymalCyst",    l:"Subependymal Cyst"},
                {k:"choroidPlexusCyst",   l:"Choroid Plexus Cyst"},
                {k:"cerebellarHemorrhage",l:"Cerebellar Hemorrhage"},
                {k:"subduralHemorrhage",  l:"Subdural Hemorrhage"},
                {k:"otherFinding",        l:"Other Finding"},
              ].map(({k,l})=>(
                <label key={k} className={`fh-finding-check${otherFindings[k]?" fh-finding-check--on":""}`}>
                  <input type="checkbox" checked={otherFindings[k]}
                    onChange={e=>isFieldEditable&&setFinding(k,e.target.checked)}
                    disabled={!isFieldEditable}/>
                  <span>{l}</span>
                </label>
              ))}
            </div>
            {otherFindings.otherFinding && (
              <div className="fh-form-group" style={{padding:"0 24px 16px"}}>
                <label className="fh-label">Describe Other Finding</label>
                <textarea rows={3} className="fh-textarea"
                  placeholder="e.g. Porencephalic cyst, Hydrocephalus, Cerebral atrophy…"
                  value={otherFindings.otherText}
                  onChange={e=>isFieldEditable&&setFinding("otherText",e.target.value)}
                  disabled={!isFieldEditable}/>
              </div>
            )}
          </div>
        </div>

        {/* ══ CLASSIFICATION REFERENCE ══ */}
        <div className="fh-reference-grid">
          <div className="fh-reference-card">
            <h4 className="fh-reference-title">IVH Grading — Papile Classification</h4>
            {[
              ["Grade I",  "Germinal matrix hemorrhage, minimal IVH (<10% ventricular area)"],
              ["Grade II", "IVH filling <50% of ventricle"],
              ["Grade III","IVH filling ≥50% of ventricle (may have ventricular dilatation)"],
              ["Grade IV", "Parenchymal involvement / Periventricular hemorrhagic infarction (PVHI)"],
            ].map(([g,d])=>(
              <div key={g} className={`fh-ref-row${g==="Grade III"||g==="Grade IV"?" fh-ref-row--high":""}`}>
                <span className="fh-ref-grade">{g}</span>
                <span className="fh-ref-desc">{d}</span>
              </div>
            ))}
          </div>
          <div className="fh-reference-card">
            <h4 className="fh-reference-title">cPVL Grading — De Vries Classification</h4>
            {[
              ["Grade I",  "Transient periventricular densities (flares) seen >7 days"],
              ["Grade II", "Localized cysts beside external angle of lateral ventricle"],
              ["Grade III","Extensive cysts in frontoparietal and occipital periventricular white matter"],
              ["Grade IV", "Extensive cysts in subcortical white matter"],
            ].map(([g,d])=>(
              <div key={g} className={`fh-ref-row${g!=="Grade I"?" fh-ref-row--high":""}`}>
                <span className="fh-ref-grade">{g}</span>
                <span className="fh-ref-desc">{d}</span>
              </div>
            ))}
          </div>
        </div>

        <NotesBox formKey={`form_f_${enrollmentId || "new"}`} />

        {message && (
          <div className={`fh-message${message.startsWith("✅")?" fh-message--success":" fh-message--error"}`}>
            {message}
          </div>
        )}
        </div>{/* end fh-body */}

      </div>{/* end fh-page */}

      {/* Modals */}
      {showScanModal && (
        <ScanFormModal
          scan={editingScan ? scanEntries.find(s=>s._id===editingScan) : null}
          scanNumber={editingScan ? scanEntries.find(s=>s._id===editingScan)?.scanNumber : scanEntries.length+1}
          dob={patientInfo.dob}
          gaWeeks={patientInfo.gaWeeks}
          gaDays={patientInfo.gaDays}
          scheduleKey={scheduleKey}
          onSave={handleSaveScan}
          onCancel={()=>{setShowScanModal(false);setEditingScan(null);}}
        />
      )}

      {/* ══ STICKY FOOTER ══ */}
      <div className="form-navigation">

        {/* ← Back */}
        <button type="button" className="btn btn-secondary btn-outline"
          onClick={() => navigate(`/metab-renal-vasc-eye-log/${enrollmentId}`)}>
          <ArrowLeft size={15}/> Metab Helper Form
        </button>

        {/* Save */}
        {!isSubmitted && (
          <button type="button" className="btn btn-save btn-outline-blue"
            onClick={handleSaveDraft}>
            <Save size={15}/> Save
          </button>
        )}

        {/* Save for Later */}
        {!isSubmitted && (
          <button type="button" className="btn btn-draft"
            onClick={async () => {
              await handleSaveDraft();
              setMessage("Draft saved — return any time to complete");
            }}>
            <Save size={15}/> Save for Later
          </button>
        )}

        {/* Locked badge */}
        {isSubmitted && (
          <div className="rcn-locked-badge"><Lock size={13}/> Form Locked</div>
        )}

        {/* Step indicator */}
        <div className="footer-step-indicator">
          <span className="step-text">STEP 6 OF 17</span>
          <div className="step-progress-line">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="progress-segment active" />
            ))}
          </div>
        </div>

        {/* Next → */}
        <button type="button" className="btn btn-primary"
          onClick={handleNext} disabled={!isSaved}>
          Form G <ArrowRight size={15}/>
        </button>

      </div>
    </>
  );
}
