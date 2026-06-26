// src/LandingPage.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./styles/LandingPage.css";

/* ─── small helpers ─────────────────────── */
function Badge({ children, variant = "teal" }) {
  return <span className={`lp-badge lp-badge-${variant}`}>{children}</span>;
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`lp-faq-item ${open ? "open" : ""}`}>
      <button className="lp-faq-q" onClick={() => setOpen(!open)}>
        <span>{q}</span>
        <span className="lp-faq-icon">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="lp-faq-a">{a}</div>}
    </div>
  );
}

/* ════════════════════════════════════════
   LANDING PAGE
════════════════════════════════════════ */
export default function LandingPage() {
  const navigate = useNavigate();
  const progressRef = useRef(null);

  /* animate progress bar on scroll into view */
  useEffect(() => {
    const bar = progressRef.current;
    if (!bar) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { bar.style.width = "18%"; obs.disconnect(); } },
      { threshold: 0.5 }
    );
    obs.observe(bar);
    return () => obs.disconnect();
  }, []);

  /* fade-up animation */
  useEffect(() => {
    const els = document.querySelectorAll(".lp-fade");
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("lp-visible"); }),
      { threshold: 0.1 }
    );
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const goLogin = () => navigate("/login");

  const CENTRES = [
    { num: 1, name: "Postgraduate Institute of Medical Education & Research", loc: "Chandigarh, Punjab", role: "Coordinating Centre", pi: "PI: Prof. Venkataseshan Sundaram", color: "#0E7C7B" },
    { num: 2, name: "Government Medical College & Hospital, Sector-32", loc: "Chandigarh, Punjab", role: "Participating Centre", pi: "Department of Neonatology", color: "#0B1F3A" },
    { num: 3, name: "Institute of Obstetrics & Gynaecology (IOG), Egmore", loc: "Chennai, Tamil Nadu", role: "Participating Centre", pi: "Department of Neonatology", color: "#DC2626" },
    { num: 4, name: "Armed Forces Medical Coll", loc: "Pune, Maharashtra", role: "Participating Centre", pi: "Department of Neonatology", color: "#059669" },
    { num: 5, name: "Government Medical College", loc: "Aurangabad, Maharashtra", role: "Participating Centre", pi: "Department of Neonatology", color: "#7C3AED" },
    { num: 6, name: "Assam Medical College & Hospital", loc: "Dibrugarh, Assam", role: "Participating Centre", pi: "Department of Pediatrics", color: "#E8A020" },
  ];

  const TEAM = [
    { init: "VS", name: "Prof. Venkataseshan Sundaram", title: "Professor, Division of Neonatology", inst: "PGIMER, Chandigarh", role: "Chief Investigator", color: "#0E7C7B", note: "Led India's first blinded DR RCT. Co-author of foundational JAMA Pediatrics 2024 IPD-NMA." },
    { init: "PK", name: "Prof. Praveen Kumar", title: "Professor, Division of Neonatology", inst: "PGIMER, Chandigarh", role: "Co-PI", color: "#0B1F3A", note: "Senior neonatologist with expertise in neonatal respiratory care and multi-centre trials." },
    { init: "JK", name: "Dr Jogender Kumar", title: "Assoc. Professor, Neonatology", inst: "PGIMER, Chandigarh", role: "Co-Investigator", color: "#1a3a5c", note: "Expertise in neonatal resuscitation and delivery room care management." },
    { init: "KS", name: "Prof. Kushaljit Singh Sodhi", title: "Professor, Radiodiagnosis & Imaging", inst: "PGIMER, Chandigarh", role: "Neuroradiology", color: "#7C3AED", note: "Expert in paediatric neuroimaging and neonatal brain MRI." },
    { init: "SV", name: "Prof. Sameer Vyas", title: "Professor, Radiodiagnosis & Imaging", inst: "PGIMER, Chandigarh", role: "Neuroradiology", color: "#059669", note: "Co-investigator for MRI brain substudy — DTI and structural imaging." },
    { init: "VJ", name: "Prof. Vanita Jain", title: "Professor, Obstetrics & Gynaecology", inst: "PGIMER, Chandigarh", role: "Obstetrics", color: "#DC2626", note: "Oversees antenatal consent, maternal data, and obstetric outcomes." },
  ];

  const FAQS = [
    { q: "What is the PORTAL Trial?", a: "PORTAL is a triple-arm, multi-site, randomized, blinded, controlled trial funded by ICMR (ID: IIRPIG-01-00478). It compares three initial oxygen concentrations (30%, 60%, 90%) for delivery room resuscitation of very preterm neonates (<32 weeks), with 700 babies across 6 hospitals in India." },
    { q: "Who can participate?", a: "Babies born at less than 32 completed weeks of pregnancy who need positive pressure ventilation (PPV) in the delivery room. Babies with major structural anomalies, fetal hydrops, or whose families decline consent are excluded." },
    { q: "What is randomization?", a: "Each eligible baby is assigned to one of the three oxygen groups by a computer-generated random sequence — not by any doctor's preference. The allocation is hidden from the resuscitation team. This eliminates bias and ensures the groups are comparable." },
    { q: "How is patient privacy protected?", a: "All data is de-identified before analysis. Personal identifiers are stored separately in a password-protected, audit-trailed database. Only study investigators have access. Published results never identify any participant. The study follows HIPAA regulations." },
    { q: "Who funds the study?", a: "Funded by the Indian Council of Medical Research (ICMR), Proposal ID IIRPIG-01-00478. The investigators declare no conflict of interest. No pharmaceutical companies are involved in design, conduct, or analysis." },
    { q: "How long will the study continue?", a: "Three years of recruitment, with each baby followed to 44 weeks post-menstrual age (about one month after the expected due date of a full-term baby). Final results expected around 2028." },
    { q: "Can parents withdraw at any time?", a: "Yes, at any time, without any reason required. Withdrawal does not affect the baby's clinical management in any way whatsoever." },
  ];

  return (
    <div className="lp-root">

      {/* ══ STICKY NAV ══ */}
      <nav className="lp-nav">
        <div className="lp-nav-brand">
          <img src="/portal-logo.png" alt="PORTAL" className="lp-nav-logo-img" />
          <span className="lp-nav-logo">PORTAL</span>
          <span className="lp-nav-pill">Trial</span>
        </div>
        <div className="lp-nav-links">
          <a href="#lp-overview">Overview</a>
          <a href="#lp-design">Study Design</a>
          <a href="#lp-centres">Centres</a>
          <a href="#lp-team">Team</a>
          <a href="#lp-parents">For Parents</a>
          <a href="#lp-contact">Contact</a>
        </div>
        <button className="lp-nav-login" onClick={goLogin}>
          <span className="lp-login-icon">🔐</span>
          <span>Research Staff Login</span>
          <span className="lp-login-arrow">→</span>
        </button>
      </nav>

      {/* ══ HERO ══ */}
      <section className="lp-hero" id="lp-hero">
        <div className="lp-hero-bg-text">O₂</div>

        {/* Logos strip inside hero */}
        <div className="lp-hero-logos">
          <div className="lp-hero-logo-box">
            <img src="/portal-logo.png" alt="PORTAL Trial" className="lp-hero-logo-img" />
            <span>PORTAL</span>
          </div>
          <div className="lp-hero-logo-divider" />
          <div className="lp-hero-logo-box">
            <img src="/icmr-logo.jpg" alt="ICMR" className="lp-hero-logo-img lp-hero-logo-icmr" />
            <span>ICMR</span>
          </div>
        </div>

        <div className="lp-hero-body">
        <div className="lp-hero-content">
          <div className="lp-hero-badges">
            <Badge variant="amber">🏛 ICMR Funded</Badge>
            <Badge variant="teal">Multi-centre RCT</Badge>
            <Badge variant="white">IIRPIG-01-00478</Badge>
            <Badge variant="white">6 Sites · India</Badge>
          </div>
          <h1 className="lp-hero-title">
            The <em>right oxygen</em> for the most vulnerable newborns
          </h1>
          <p className="lp-hero-subtitle">
            A triple-arm, randomized, blinded, multi-site trial comparing 30%, 60%, and 90% initial oxygen for delivery room resuscitation of very preterm neonates across India.
          </p>
          <div className="lp-hero-stats">
            {[
              { num: "700", unit: " babies", label: "Target enrollment" },
              { num: "6", unit: " hospitals", label: "Participating centres" },
              { num: "3", unit: " arms", label: "Trial interventions" },
              { num: "44", unit: " weeks", label: "PMA follow-up" },
            ].map(s => (
              <div className="lp-hero-stat" key={s.label}>
                <div className="lp-hero-stat-num">{s.num}<span>{s.unit}</span></div>
                <div className="lp-hero-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="lp-hero-actions">
            <a href="#lp-overview" className="lp-btn-primary">Learn About the Trial</a>
            <a href="#lp-centres" className="lp-btn-outline">Participating Centres</a>
            <button className="lp-btn-outline" onClick={goLogin}>Research Staff Login →</button>
          </div>
        </div>

        {/* Neonatal illustration — right side of hero */}
        <div className="lp-hero-illustration">
          <svg viewBox="0 0 360 340" xmlns="http://www.w3.org/2000/svg" className="lp-hero-illus-svg">
            {/* Background circle glow */}
            <circle cx="180" cy="170" r="150" fill="rgba(14,124,123,0.08)" />
            <circle cx="180" cy="170" r="120" fill="rgba(14,124,123,0.05)" />

            {/* Incubator / warmer base */}
            <rect x="60" y="220" width="240" height="18" rx="6" fill="#1a3a5c" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
            <rect x="80" y="200" width="200" height="26" rx="8" fill="#162D50" stroke="rgba(255,255,255,0.12)" strokeWidth="1"/>
            <rect x="90" y="195" width="180" height="12" rx="4" fill="#0E7C7B" opacity="0.4"/>
            {/* Warmer surface */}
            <rect x="70" y="185" width="220" height="18" rx="6" fill="#1e3f6f" stroke="rgba(14,124,123,0.4)" strokeWidth="1.5"/>
            {/* Mattress */}
            <rect x="78" y="178" width="204" height="12" rx="4" fill="#e0f2fe" opacity="0.15"/>

            {/* Baby body */}
            <ellipse cx="185" cy="165" rx="52" ry="34" fill="#fde8d0"/>
            {/* Baby head */}
            <circle cx="130" cy="155" r="28" fill="#fde8d0"/>
            {/* Hair */}
            <path d="M108,140 Q115,128 130,132 Q145,128 152,140" fill="none" stroke="#c8956c" strokeWidth="3" strokeLinecap="round"/>
            {/* Eye */}
            <ellipse cx="122" cy="153" rx="3" ry="2.5" fill="#5a3828"/>
            <circle cx="123" cy="152" r="1" fill="#fff" opacity="0.5"/>
            {/* Nose */}
            <path d="M128,160 Q130,163 132,160" fill="none" stroke="#c8956c" strokeWidth="1.5" strokeLinecap="round"/>
            {/* Mouth — peaceful */}
            <path d="M124,166 Q130,170 136,166" fill="none" stroke="#c8956c" strokeWidth="1.5" strokeLinecap="round"/>
            {/* Ear */}
            <ellipse cx="104" cy="158" rx="6" ry="8" fill="#f5c9a0"/>

            {/* Baby arms */}
            <path d="M195,155 Q215,145 225,150 Q230,155 225,160 Q215,165 205,160" fill="#fde8d0"/>
            <path d="M185,185 Q170,195 165,188 Q162,182 172,178" fill="#fde8d0"/>

            {/* Baby legs */}
            <path d="M215,180 Q235,185 238,195 Q238,202 230,202 Q222,200 218,190" fill="#fde8d0"/>
            <path d="M230,175 Q248,178 250,188 Q250,196 242,197 Q234,195 232,185" fill="#fde8d0"/>

            {/* Diaper / wrap */}
            <path d="M170,175 Q185,185 210,178 Q215,185 205,192 Q185,198 168,188 Z" fill="rgba(255,255,255,0.2)"/>

            {/* Oxygen mask */}
            <ellipse cx="142" cy="162" rx="15" ry="11" fill="#ef4444" opacity="0.75"/>
            <ellipse cx="142" cy="162" rx="12" ry="8" fill="#fca5a5" opacity="0.6"/>
            <circle cx="142" cy="162" r="4" fill="rgba(255,255,255,0.3)"/>

            {/* Oxygen tube from mask */}
            <path d="M127,162 Q100,162 90,155 Q80,148 72,138" fill="none" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round"/>

            {/* Blender device — LEFT */}
            <rect x="28" y="70" width="72" height="80" rx="8" fill="#162D50" stroke="#0E7C7B" strokeWidth="1.5"/>
            <rect x="35" y="78" width="58" height="44" rx="4" fill="#0B1F3A"/>
            {/* Gauge circle */}
            <circle cx="64" cy="100" r="16" fill="none" stroke="#0E7C7B" strokeWidth="1.5"/>
            <circle cx="64" cy="100" r="12" fill="#0d2540"/>
            <path d="M64,100 L64,88" stroke="#14A8A7" strokeWidth="2" strokeLinecap="round"/>
            <path d="M64,100 L72,100" stroke="#E8A020" strokeWidth="1.5" strokeLinecap="round"/>
            {/* O2 label */}
            <text x="57" y="134" fontFamily="monospace" fontSize="10" fill="#14A8A7" fontWeight="700">O₂</text>
            {/* Percentage labels */}
            <rect x="35" y="138" width="58" height="5" rx="2" fill="#0d2540"/>
            <text x="38" y="143" fontFamily="monospace" fontSize="7" fill="rgba(255,255,255,0.5)">30%</text>
            <text x="53" y="143" fontFamily="monospace" fontSize="7" fill="#14A8A7">60%</text>
            <text x="68" y="143" fontFamily="monospace" fontSize="7" fill="#E8A020">90%</text>
            {/* Knob */}
            <circle cx="64" cy="152" r="8" fill="#1a3a5c" stroke="#0E7C7B" strokeWidth="1.5"/>
            <circle cx="64" cy="152" r="3" fill="#0E7C7B"/>

            {/* Tube from blender to mask */}
            <path d="M64,150 Q64,160 72,162" fill="none" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round"/>

            {/* Pulse oximeter probe on right hand */}
            <rect x="228" y="152" width="22" height="12" rx="4" fill="#1a3a5c" stroke="#0E7C7B" strokeWidth="1"/>
            <circle cx="239" cy="158" r="3" fill="#ef4444" opacity="0.8"/>
            {/* SpO2 display */}
            <rect x="250" y="145" width="72" height="32" rx="6" fill="#0B1F3A" stroke="#0E7C7B" strokeWidth="1.5"/>
            <text x="258" y="158" fontFamily="monospace" fontSize="8" fill="rgba(255,255,255,0.5)">SpO₂</text>
            <text x="256" y="171" fontFamily="monospace" fontSize="14" fill="#22c55e" fontWeight="700">82%</text>
            {/* Wire from probe */}
            <path d="M250,158 Q248,158 250,158" fill="none" stroke="#64748b" strokeWidth="1.5"/>

            {/* IV line */}
            <line x1="205" y1="100" x2="205" y2="165" stroke="rgba(148,163,184,0.4)" strokeWidth="1.5" strokeDasharray="3,2"/>
            {/* IV bag */}
            <rect x="192" y="72" width="26" height="34" rx="10" fill="rgba(14,124,123,0.2)" stroke="rgba(14,124,123,0.4)" strokeWidth="1"/>
            <text x="197" y="92" fontFamily="sans-serif" fontSize="7" fill="rgba(255,255,255,0.5)">IV</text>

            {/* Overhead warmer lamp */}
            <rect x="130" y="30" width="100" height="8" rx="4" fill="#1a3a5c"/>
            <rect x="165" y="38" width="30" height="20" rx="3" fill="#162D50" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
            <ellipse cx="180" cy="60" rx="18" ry="6" fill="#E8A020" opacity="0.25"/>
            <ellipse cx="180" cy="58" rx="12" ry="4" fill="#E8A020" opacity="0.4"/>

            {/* Radiant warmth rays */}
            <line x1="180" y1="65" x2="170" y2="100" stroke="#E8A020" strokeWidth="1" opacity="0.15"/>
            <line x1="180" y1="65" x2="180" y2="105" stroke="#E8A020" strokeWidth="1" opacity="0.15"/>
            <line x1="180" y1="65" x2="190" y2="100" stroke="#E8A020" strokeWidth="1" opacity="0.15"/>

            {/* Label at bottom */}
            <text x="180" y="310" textAnchor="middle" fontFamily="Georgia, serif" fontSize="18" fill="#fff" fontWeight="700" letterSpacing="2">PORTAL</text>
            <text x="180" y="326" textAnchor="middle" fontFamily="sans-serif" fontSize="9" fill="rgba(255,255,255,0.4)" letterSpacing="1">Preterm Oxygen Resuscitation Trial</text>
          </svg>
        </div>
        </div>{/* end lp-hero-body */}

      </section>

      {/* ══ OVERVIEW ══ */}
      <section className="lp-section" id="lp-overview">
        <div className="lp-section-inner">
          <div className="lp-eyebrow">Trial Overview</div>
          <h2 className="lp-section-title">Why does the first breath of oxygen matter?</h2>
          <p className="lp-section-body">Every year, millions of premature babies need help breathing at birth. The oxygen concentration given in those first critical minutes could determine life-long outcomes — yet the right amount remains scientifically uncertain. PORTAL is India's largest neonatal resuscitation trial, designed to find the answer.</p>
          <div className="lp-grid-2 lp-fade">
            {[
              { icon: "🫁", title: "The Problem", body: "Very preterm babies (born before 32 weeks) are caught between two dangers: too little oxygen causes death; too much causes lifelong organ damage. Current guidelines recommend 21–30%, but a 2024 meta-analysis of 12 trials challenges this with evidence that higher oxygen may reduce mortality." },
              { icon: "🔬", title: "The Research Question", body: "Is starting resuscitation with 60% or 90% oxygen safer and more effective than 30% — for reducing death or bronchopulmonary dysplasia in preterm babies born before 32 weeks of gestation?" },
              { icon: "🏥", title: "The Design", body: "A triple-arm, blinded, multi-site, randomized controlled trial. 700 babies across 6 tertiary hospitals in India. Both investigators and outcome assessors are blinded to the oxygen concentration, ensuring the most rigorous evidence." },
              { icon: "🌍", title: "Expected Impact", body: "Results will guide global delivery room resuscitation practice — with direct policy recommendations to ILCOR, the AAP NRP committee, and India's National Neonatology Forum. Target publication: Lancet Global Health or NEJM." },
            ].map(c => (
              <div className="lp-card" key={c.title}>
                <div className="lp-card-icon">{c.icon}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ WHY IT MATTERS ══ */}
      <section className="lp-section lp-section-alt">
        <div className="lp-section-inner">
          <div className="lp-eyebrow">Public Understanding</div>
          <h2 className="lp-section-title">What every parent should know</h2>
          <div className="lp-grid-3 lp-fade">
            {[
              { n: "01", title: "What is prematurity?", body: "Babies born before 32 weeks are called 'very preterm'. In India, prematurity is the leading cause of newborn death, contributing to nearly half of all neonatal deaths." },
              { n: "02", title: "Why do premature babies need oxygen?", body: "Premature lungs are underdeveloped and cannot always get enough oxygen independently. Many need breathing assistance and supplemental oxygen right at birth in the delivery room." },
              { n: "03", title: "Can too much oxygen be harmful?", body: "Yes. Excess oxygen creates 'free radicals' that damage immature tissues. Too much has been linked to lung disease (BPD), eye damage (ROP), and brain injury in preterm babies." },
              { n: "04", title: "Why is the current guideline uncertain?", body: "A 2024 analysis of 12 international trials found that high oxygen (≥90%) may actually reduce mortality compared to the standard 30% — directly contradicting current ILCOR guidelines." },
              { n: "05", title: "Why conduct this in India?", body: "India has one of the highest global burdens of premature births. A trial done in India's LMIC setting generates evidence applicable to billions of people worldwide." },
              { n: "06", title: "How will this change care?", body: "PORTAL will provide the definitive, prospective answer to the correct initial oxygen concentration — enabling updated global guidelines that could prevent thousands of infant deaths annually." },
            ].map(c => (
              <div className="lp-why-card" key={c.n}>
                <div className="lp-why-num">{c.n}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ STUDY DESIGN ══ */}
      <section className="lp-section" id="lp-design">
        <div className="lp-section-inner">
          <div className="lp-eyebrow">Study Design</div>
          <h2 className="lp-section-title">How the trial works</h2>
          <p className="lp-section-body">A rigorous, blinded, randomized design ensures the most trustworthy evidence. The oxygen concentration is hidden from the resuscitation team — they see only the SpO₂ readings.</p>

          <div className="lp-flow lp-fade">
            <div className="lp-flow-node lp-flow-primary"><h4>👶 Eligible Baby Born</h4><p>Very preterm (&lt;32 weeks), needs delivery room resuscitation (PPV)</p></div>
            <div className="lp-flow-arrow" />
            <div className="lp-flow-node"><h4>📋 Antenatal Consent</h4><p>Written informed consent from parents during pregnancy</p></div>
            <div className="lp-flow-arrow" />
            <div className="lp-flow-node"><h4>🎲 Randomization</h4><p>Computer-generated allocation — stratified by gestation &amp; site</p></div>
            <div className="lp-flow-arrow" />
            <div className="lp-flow-arms">
              <div className="lp-arm lp-arm-30"><div className="lp-arm-pct">30%</div><div className="lp-arm-label">Control Arm</div><div className="lp-arm-tag">Current Standard</div></div>
              <div className="lp-arm lp-arm-60"><div className="lp-arm-pct">60%</div><div className="lp-arm-label">Experimental 1</div><div className="lp-arm-tag">Intermediate O₂</div></div>
              <div className="lp-arm lp-arm-90"><div className="lp-arm-pct">90%</div><div className="lp-arm-label">Experimental 2</div><div className="lp-arm-tag">High O₂</div></div>
            </div>
            <div className="lp-flow-merge"><div className="lp-merge-line" /><div className="lp-merge-dot" /><div className="lp-merge-line" /></div>
            <div className="lp-flow-arrow" />
            <div className="lp-flow-node"><h4>🏥 NICU Monitoring</h4><p>SpO₂ titration · Standard neonatal care · Blinded outcome assessment</p></div>
            <div className="lp-flow-arrow" />
            <div className="lp-flow-node"><h4>📊 Primary Outcome at 44 weeks PMA</h4><p>Death or BPD (Jensen 2019) — composite primary endpoint</p></div>
            <div className="lp-flow-arrow" />
            <div className="lp-flow-node lp-flow-primary"><h4>🧠 MRI Brain — 25% subset (n=175)</h4><p>3T MRI at 40±2 weeks PMA — structural brain outcomes</p></div>
          </div>

          <div className="lp-blinding-box lp-fade">
            <div className="lp-blinding-icon">🔒</div>
            <div>
              <h3>How blinding is maintained</h3>
              <p>The air-oxygen blender is placed behind an opaque screen. A dedicated research nurse sets the allocated FiO₂ and titrates based on SpO₂ — but the clinical resuscitation team never knows which arm the baby is in. Outcome assessors are completely separate from clinical care.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══ OBJECTIVES ══ */}
      <section className="lp-section lp-section-alt">
        <div className="lp-section-inner">
          <div className="lp-eyebrow">Study Objectives</div>
          <h2 className="lp-section-title">What we are measuring</h2>
          <div className="lp-obj-grid lp-fade">
            <div className="lp-obj-card lp-obj-primary">
              <div className="lp-obj-tag">Primary Objective</div>
              <h3>Death or Bronchopulmonary Dysplasia</h3>
              <p>Compare 90% or 60% FiO₂ versus 30% for reduction in the composite of all-cause death or BPD at 44 weeks post-menstrual age (NIH 2018 definition).</p>
              <div className="lp-obj-bg">1</div>
            </div>
            <div className="lp-obj-card lp-obj-secondary">
              <div className="lp-obj-tag">Secondary Objective</div>
              <h3>Comprehensive Adverse Outcome</h3>
              <p>Compare the composite of Death or BPD or ROP requiring treatment or NEC (Bell's Stage ≥IIA) or major brain injury (IVH Grade ≥III / cPVL) at 44 weeks PMA.</p>
              <div className="lp-obj-bg">2</div>
            </div>
            <div className="lp-obj-card lp-obj-mri">
              <div className="lp-obj-tag">Exploratory Objective</div>
              <h3>MRI Brain Assessment</h3>
              <p>Compare structural brain changes on 3T MRI at 40±2 weeks PMA: myelination, white matter, basal ganglia, PLIC, cerebellum — in a 25% random subset (n=175).</p>
              <div className="lp-obj-bg">3</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ CENTRES ══ */}
      <section className="lp-section" id="lp-centres">
        <div className="lp-section-inner">
          <div className="lp-eyebrow">Participating Centres</div>
          <h2 className="lp-section-title">Six hospitals across India</h2>
          <p className="lp-section-body">Centres span 5 states and represent India's geographic and demographic diversity — from the Himalayan north to the deep south and northeast.</p>
          <div className="lp-centres lp-fade">
            {CENTRES.map(c => (
              <div className="lp-centre-card" key={c.num}>
                <div className="lp-centre-dot" style={{ background: c.color + "18", color: c.color }}>{c.num}</div>
                <div>
                  <h4>{c.name}</h4>
                  <div className="lp-centre-loc" style={{ color: c.color }}>📍 {c.loc}</div>
                  <div className="lp-centre-pi">{c.role} · {c.pi}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ TEAM ══ */}
      <section className="lp-section lp-section-alt" id="lp-team">
        <div className="lp-section-inner">
          <div className="lp-eyebrow">Research Team</div>
          <h2 className="lp-section-title">Principal Investigator & Team</h2>
          <p className="lp-section-body">Led by neonatologists with combined experience spanning three continents, multiple ICMR and WHO-funded trials, and India's first blinded delivery room resuscitation trial.</p>
          <div className="lp-pi-grid lp-fade">
            {TEAM.map(p => (
              <div className="lp-pi-card" key={p.name}>
                <div className="lp-pi-header">
                  <div className="lp-pi-avatar" style={{ background: p.color }}>{p.init}</div>
                  <div>
                    <div className="lp-pi-name">{p.name}</div>
                    <div className="lp-pi-title">{p.title}</div>
                  </div>
                </div>
                <div className="lp-pi-body">
                  <div className="lp-pi-inst" style={{ color: p.color }}>{p.inst}</div>
                  <p className="lp-pi-note">{p.note}</p>
                  <span className="lp-pi-role">{p.role}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ RECRUITMENT ══ */}
      <section className="lp-section lp-section-dark">
        <div className="lp-section-inner">
          <div className="lp-eyebrow lp-eyebrow-light">Recruitment Status</div>
          <h2 className="lp-section-title lp-title-light">Trial Enrollment Dashboard</h2>
          <p className="lp-section-body lp-body-light">Public enrollment statistics — no patient-level data is ever displayed. Target: 700 neonates over 3 years across 6 sites.</p>
          <div className="lp-recruit-grid lp-fade">
            {[
              { num: "700", label: "Target Sample Size" },
              { num: "3", label: "Trial Arms", accent: true },
              { num: "6", label: "Active Sites" },
              { num: "175", label: "MRI Substudy (25%)" },
              { num: "3 yr", label: "Study Duration" },
            ].map(s => (
              <div className="lp-recruit-stat" key={s.label}>
                <div className={`lp-recruit-num${s.accent ? " accent" : ""}`}>{s.num}</div>
                <div className="lp-recruit-label">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="lp-progress-wrap">
            <div className="lp-progress-labels">
              <span>Enrollment Progress</span><span>Recruitment Ongoing</span>
            </div>
            <div className="lp-progress-bg">
              <div className="lp-progress-fill" ref={progressRef} />
            </div>
            <p className="lp-progress-note">Enrollment commenced 2024–25 · Target completion: 2027 · No patient-identifiable data shown</p>
          </div>
        </div>
      </section>

      {/* ══ MILESTONES ══ */}
      <section className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-eyebrow">Timeline</div>
          <h2 className="lp-section-title">Trial Milestones</h2>
          <div className="lp-timeline lp-fade">
            {[
              { icon: "📄", done: true, tag: "Completed", title: "Protocol Development & Preliminary Work", body: "Protocol v0.3 finalized. First blinded DR RCT in India completed. IPD-NMA published in JAMA Pediatrics (Aug 2024). SpO₂ centile charts published." },
              { icon: "✅", done: true, tag: "Completed", title: "ICMR Funding Approval", body: "Funding secured from the Indian Council of Medical Research. Proposal ID: IIRPIG-01-00478." },
              { icon: "🏛", done: true, tag: "Completed", title: "Ethics Approval & CTRI Registration", body: "IEC approval obtained from PGIMER and all participating sites. Trial registered in the Clinical Trials Registry of India." },
              { icon: "🚀", active: true, tag: "Active", title: "Site Initiation & Recruitment", body: "Staff training, run-in period with dummy subjects, and initiation of recruitment at 6 sites. Target: 700 neonates over 3 years." },
              { icon: "🔬", tag: "Planned", title: "Interim Analysis", body: "DSMB interim analysis at ~25% enrollment (~160 neonates) using O'Brien–Fleming spending function with FWER of 1%." },
              { icon: "📊", tag: "Planned · 2027", title: "Recruitment Completion & Follow-up", body: "700 neonates enrolled. All subjects followed to 44 weeks PMA. MRI brain at term equivalent age for 25% subset." },
              { icon: "📰", tag: "Planned · 2028", title: "Final Analysis & Publication", body: "ITT and per-protocol analysis. Target: Lancet Global Health or NEJM. Policy recommendations to ILCOR and AAP NRP committee." },
            ].map((t, i) => (
              <div className="lp-tl-item" key={i}>
                <div className={`lp-tl-dot${t.done ? " done" : t.active ? " active" : ""}`}>{t.icon}</div>
                <div className="lp-tl-content">
                  <div className="lp-tl-tag">{t.tag}</div>
                  <div className="lp-tl-title">{t.title}</div>
                  <div className="lp-tl-body">{t.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FOR PARENTS ══ */}
      <section className="lp-section lp-section-dark" id="lp-parents">
        <div className="lp-section-inner">
          <div className="lp-eyebrow lp-eyebrow-light">For Parents</div>
          <h2 className="lp-section-title lp-title-light">Information for families</h2>
          <div className="lp-parents-grid lp-fade">
            <div>
              <p className="lp-parents-intro">If your baby is born prematurely and needs breathing support, you may be asked to consider participating in this trial. Here is everything you need to know in plain language.</p>
              <p className="lp-parents-sub">Your baby's participation is entirely voluntary. Whether you consent or not, your baby will receive exactly the same standard clinical care. You may withdraw at any time without any consequence.</p>
              <div className="lp-contact-block">
                <h4>Questions? Contact the Principal Investigator</h4>
                <p><strong>Dr. Venkataseshan Sundaram</strong><br />Professor, Division of Neonatology, PGIMER, Chandigarh<br />📞 9478001129 &nbsp;|&nbsp; ✉️ venkatpgi@gmail.com</p>
              </div>
            </div>
            <div className="lp-parent-cards">
              {[
                { icon: "🎲", title: "What is randomization?", body: "Your baby will be randomly assigned to one of three oxygen levels (30%, 60%, or 90%). This is done by computer to ensure fairness. Neither you nor the doctors know which group your baby is in." },
                { icon: "🔒", title: "Is my baby's data confidential?", body: "All data is de-identified. Your baby's name or personal details will never appear in any publication. Data is password-protected and accessible only to the research team. HIPAA-compliant." },
                { icon: "🛡️", title: "How is my baby's safety monitored?", body: "An independent Data and Safety Monitoring Board (DSMB) of 5 experts reviews safety data throughout the trial. If any arm is found unsafe, the trial stops immediately." },
                { icon: "🚪", title: "Can we withdraw?", body: "Yes, at any time. No reason required. Withdrawal does not affect your baby's clinical management in any way." },
              ].map(c => (
                <div className="lp-parent-card" key={c.title}>
                  <div className="lp-parent-icon">{c.icon}</div>
                  <div><h4>{c.title}</h4><p>{c.body}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ FAQ ══ */}
      <section className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-eyebrow">FAQ</div>
          <h2 className="lp-section-title">Frequently Asked Questions</h2>
          <div className="lp-faq lp-fade">
            {FAQS.map(f => <FaqItem key={f.q} q={f.q} a={f.a} />)}
          </div>
        </div>
      </section>

      {/* ══ PUBLICATIONS ══ */}
      <section className="lp-section lp-section-alt">
        <div className="lp-section-inner">
          <div className="lp-eyebrow">Research Output</div>
          <h2 className="lp-section-title">Publications & Presentations</h2>
          <div className="lp-pub-grid lp-fade">
            {[
              { type: "IPD Network Meta-Analysis", title: "Initial oxygen for resuscitation of infants born <32 weeks", body: "Systematic review and IPD-NMA of 12 RCTs (n=1055). High FiO₂ (≥90%) associated with reduced mortality vs low and intermediate concentrations.", journal: "Sotiropoulos et al. JAMA Pediatrics, August 2024 · Vol. 178(8):774–83", highlight: false },
              { type: "Original RCT", title: "Room air vs 100% oxygen for delivery room resuscitation of preterm neonates", body: "India's first blinded RCT on this question. Primary outcome: 16-F-Isoprostane (oxidative stress biomarker). Landmark study for the PORTAL team.", journal: "Liyakat, Kumar & Sundaram · J Paediatr Child Health, April 2023", highlight: false },
              { type: "Reference Charts", title: "SpO₂ centile charts for preterm neonates in first 10 minutes of life", body: "Dedicated oxygen saturation centile charts enabling more accurate FiO₂ titration during resuscitation. Used as the titration standard in PORTAL.", journal: "Chandra, Sundaram & Kumar · Eur J Pediatrics, January 2023", highlight: false },
              { type: "Upcoming — Protocol Paper", title: "PORTAL Trial Protocol Paper", body: "Full protocol paper documenting trial design, objectives, statistical analysis plan, and site selection criteria for public transparency.", journal: "Submission planned · BMJ Open or Trials journal", highlight: true, color: "teal" },
              { type: "Upcoming — Main Results", title: "PORTAL Trial Primary Results", body: "Primary outcome paper: death or BPD at 44 weeks PMA. Target high-impact general medical journal for maximum global reach and policy influence.", journal: "Target: Lancet Global Health or NEJM · 2028", highlight: true, color: "amber" },
            ].map(p => (
              <div className={`lp-pub-card${p.highlight ? ` lp-pub-${p.color}` : ""}`} key={p.title}>
                <div className="lp-pub-type">{p.type}</div>
                <h4>{p.title}</h4>
                <p>{p.body}</p>
                <div className="lp-pub-journal">{p.journal}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CONTACT ══ */}
      <section className="lp-section" id="lp-contact">
        <div className="lp-section-inner">
          <div className="lp-eyebrow">Contact</div>
          <h2 className="lp-section-title">Get in touch</h2>
          <div className="lp-contact-grid lp-fade">
            <div>
              <h3 className="lp-contact-h">Trial Coordinating Centre</h3>
              {[
                { icon: "👤", title: "Principal Coordinating Investigator", body: "Prof. Venkataseshan Sundaram\nDivision of Neonatology, Department of Pediatrics" },
                { icon: "🏥", title: "Institution", body: "Postgraduate Institute of Medical Education and Research (PGIMER)\nSector 12, Chandigarh — 160 012, India" },
                { icon: "📞", title: "Phone", body: "+91 94780 01129" },
                { icon: "✉️", title: "Email", body: "venkatpgi@gmail.com" },
                { icon: "🏛", title: "Ethics Committee Queries", body: "Dr. Ashish Kakkar, Convener IEC\nRoom 6006, Research Block B, PGIMER\n☎ 0172-2755266" },
                { icon: "📋", title: "ICMR Proposal ID", body: "IIRPIG-01-00478" },
              ].map(r => (
                <div className="lp-contact-row" key={r.title}>
                  <div className="lp-contact-icon">{r.icon}</div>
                  <div><h4>{r.title}</h4><p style={{ whiteSpace: "pre-line" }}>{r.body}</p></div>
                </div>
              ))}
            </div>
            <div>
              <div className="lp-map-box">
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 48 }}>📍</div>
                  <p style={{ fontWeight: 700, marginBottom: 4 }}>PGIMER, Chandigarh</p>
                  <p>Sector 12, Chandigarh — 160 012</p>
                  <a href="https://maps.google.com/?q=PGIMER+Chandigarh" target="_blank" rel="noreferrer" className="lp-map-link">Open in Google Maps →</a>
                </div>
              </div>
              <div className="lp-staff-box">
                <h4>Research Staff Login</h4>
                <p>Authorized trial personnel can access the PORTAL data management system.</p>
                <button className="lp-btn-primary" onClick={goLogin} style={{ marginTop: 14 }}>
                  Access PORTAL Data System →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div>
            <div className="lp-footer-logo">PORTAL Trial</div>
            <p className="lp-footer-tagline">Initial Oxygen for Delivery Room Resuscitation of Preterm Neonates — a triple-arm, multi-site, randomized, controlled trial. India, 2024–2027.</p>
            <div className="lp-footer-icmr">🏛 ICMR Funded · IIRPIG-01-00478</div>
          </div>
          <div className="lp-footer-links">
            <div>
              <h5>Trial</h5>
              <a href="#lp-overview">Overview</a>
              <a href="#lp-design">Study Design</a>
              <a href="#lp-centres">Centres</a>
            </div>
            <div>
              <h5>Team & Resources</h5>
              <a href="#lp-team">Research Team</a>
              <a href="#lp-parents">For Parents</a>
              <a href="#lp-contact">Contact</a>
            </div>
            <div>
              <h5>Staff</h5>
              <button className="lp-footer-login" onClick={goLogin}>Research Staff Login</button>
            </div>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <p>© 2025 PORTAL Trial · PGIMER, Chandigarh · All rights reserved · No patient data is displayed on this website</p>
          <p>Funded by ICMR · Approved by IEC · Registered in CTRI · Protocol v0.3 · December 2024</p>
        </div>
      </footer>

    </div>
  );
}
