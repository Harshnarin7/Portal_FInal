// src/LandingPage.jsx — Public PORTAL Trial site
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./styles/LandingPage.css";

const CENTRES = [
  {
    city: "Chandigarh",
    name: "Post Graduate Institute of Medical Education and Research (PGIMER)",
    dept: "Division of Neonatology, Department of Pediatrics",
    role: "Coordinating centre",
  },
  {
    city: "Chandigarh",
    name: "Government Medical College and Hospital, Sector-32",
    dept: "Department of Neonatology",
    role: "Participating centre",
  },
  {
    city: "Chennai",
    name: "Institute of Obstetrics and Gynaecology (IOG), Egmore",
    dept: "Department of Neonatology",
    role: "Participating centre",
  },
  {
    city: "Pune",
    name: "Armed Forces Medical College (AFMC)",
    dept: "Department of Neonatology",
    role: "Participating centre",
  },
  {
    city: "Dibrugarh",
    name: "Assam Medical College",
    dept: "Department of Pediatrics",
    role: "Participating centre",
  },
  {
    city: "Aurangabad",
    name: "Government Medical College, Aurangabad",
    dept: "Department of Neonatology",
    role: "Participating centre",
  },
];

const TEAM = [
  {
    name: "Prof. Venkataseshan Sundaram",
    title: "Professor, Division of Neonatology",
    inst: "PGIMER, Chandigarh",
    role: "Chief Investigator / PI",
  },
  {
    name: "Prof. Praveen Kumar",
    title: "Professor, Division of Neonatology",
    inst: "PGIMER, Chandigarh",
    role: "Co-Principal Investigator",
  },
  {
    name: "Dr Jogender Kumar",
    title: "Associate Professor, Neonatology",
    inst: "PGIMER, Chandigarh",
    role: "Co-Investigator",
  },
  {
    name: "Prof. Kushaljit Singh Sodhi",
    title: "Professor, Radiodiagnosis & Imaging",
    inst: "PGIMER, Chandigarh",
    role: "Neuroradiology",
  },
  {
    name: "Prof. Sameer Vyas",
    title: "Professor, Radiodiagnosis & Imaging",
    inst: "PGIMER, Chandigarh",
    role: "Neuroradiology · MRI substudy",
  },
  {
    name: "Prof. Vanita Jain",
    title: "Professor, Obstetrics & Gynaecology",
    inst: "PGIMER, Chandigarh",
    role: "Obstetrics",
  },
];

const JOURNEY = [
  {
    step: "01",
    title: "Antenatal consent",
    body: "When a mother is admitted with threatened preterm birth and there is enough time, the research team explains the study and seeks written informed consent from a parent.",
  },
  {
    step: "02",
    title: "Birth & eligibility",
    body: "If the baby is born before 32 weeks and needs positive pressure ventilation in the delivery room, they may be randomised into the trial.",
  },
  {
    step: "03",
    title: "Blinded oxygen start",
    body: "A computer-generated sequence assigns 30%, 60%, or 90% initial oxygen. The resuscitating doctors do not see which concentration is set.",
  },
  {
    step: "04",
    title: "Titration to targets",
    body: "Once a reliable pulse-oximeter reading appears, oxygen is adjusted to published SpO₂ targets — the same way careful resuscitation is meant to work.",
  },
  {
    step: "05",
    title: "NICU care & follow-up",
    body: "Standard hospital care continues. Outcomes are assessed through hospital stay up to 44 weeks post-menstrual age. A subset may have an MRI at term-equivalent age.",
  },
];

const OUTCOMES = [
  {
    label: "Primary",
    title: "Death or BPD",
    body: "All-cause mortality or bronchopulmonary dysplasia by 44 weeks post-menstrual age — the main clinical question the trial is powered to answer.",
  },
  {
    label: "Secondary",
    title: "Composite adverse outcome",
    body: "Death, BPD, retinopathy of prematurity needing treatment, necrotising enterocolitis, or major brain injury — a broader picture of serious harm.",
  },
  {
    label: "Exploratory",
    title: "Brain MRI subset",
    body: "About one in four enrolled babies may have a brain MRI around term age to compare structural changes across the three oxygen arms.",
  },
];

const FAQS = [
  {
    q: "What does PORTAL stand for?",
    a: "Preterm Oxygen for Resuscitation Trial At deLivery — a name that reflects the focus on the first oxygen given when very preterm babies need help breathing at birth.",
  },
  {
    q: "Why compare three oxygen levels?",
    a: "Earlier trials usually compared only “low” versus “high” oxygen. Evidence suggests 30%, mid-range (~60%), and high (≥90%) may each behave differently. A triple-arm design can separate those effects.",
  },
  {
    q: "Is this safe for my baby?",
    a: "All babies still receive resuscitation according to current ILCOR/NRP guidance. The study only changes the starting oxygen concentration, which is then titrated to saturation targets. Ethics committees at each hospital must approve the protocol before enrolment starts. Serious events are reported to the IEC and an independent Data and Safety Monitoring Board.",
  },
  {
    q: "Will doctors know which group my baby is in?",
    a: "No. The air–oxygen blender is screened so the resuscitating team cannot see the set FiO₂. Outcome assessors are also blinded. That protects the fairness of the results.",
  },
  {
    q: "Can we refuse or withdraw?",
    a: "Yes. Consent is voluntary. You may decline or withdraw at any time, for any reason, and your baby’s clinical care will not be affected.",
  },
  {
    q: "Who pays for the study?",
    a: "The trial is funded by the Indian Council of Medical Research (ICMR), proposal ID IIRPIG-01-00478. Investigators declare no conflict of interest. No pharmaceutical company designs or analyses the study.",
  },
  {
    q: "How is privacy protected?",
    a: "Personal identifiers are stored separately from research data. The electronic database is password-protected with an audit trail. Published results never name families or babies.",
  },
  {
    q: "What will success look like?",
    a: "Clear evidence on which starting oxygen concentration best reduces death or lung disease (BPD) — and related serious outcomes — so guidelines for very preterm resuscitation can be updated worldwide.",
  },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`lp-faq-item${open ? " is-open" : ""}`}>
      <button type="button" className="lp-faq-q" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{q}</span>
        <span className="lp-faq-icon" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="lp-faq-a">{a}</div>}
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = root.querySelectorAll("[data-reveal]");
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-revealed");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const goLogin = () => navigate("/login");

  return (
    <div className="lp-root" ref={rootRef}>
      <header className="lp-nav">
        <a href="#top" className="lp-nav-brand" aria-label="PORTAL Trial home">
          <img src="/logo.png" alt="" className="lp-nav-mark" />
          <span className="lp-nav-word">
            P<span className="lp-o">O</span>RTAL
          </span>
        </a>
        <nav className="lp-nav-links" aria-label="Page sections">
          <a href="#about">About</a>
          <a href="#design">Design</a>
          <a href="#journey">How it works</a>
          <a href="#parents">Parents</a>
          <a href="#centres">Centres</a>
          <a href="#faq">FAQ</a>
        </nav>
        <button type="button" className="lp-nav-cta" onClick={goLogin}>
          Research Staff Login
        </button>
      </header>

      {/* ── Hero ── */}
      <section className="lp-hero" id="top">
        <div className="lp-hero-atmosphere" aria-hidden="true">
          <div className="lp-orb lp-orb-a" />
          <div className="lp-orb lp-orb-b" />
          <div className="lp-grid-fade" />
        </div>

        <div className="lp-hero-inner">
          <div className="lp-hero-copy">
            <div className="lp-hero-funders lp-anim-in">
              <img src="/logo.png" alt="PORTAL Trial" className="lp-hero-logo" />
              <img src="/icmr-logo.jpg" alt="Indian Council of Medical Research" className="lp-hero-icmr" />
            </div>

            <p className="lp-kicker lp-anim-in lp-delay-1">ICMR · IIRPIG-01-00478</p>

            <h1 className="lp-brand-title lp-anim-in lp-delay-2">
              P<span className="lp-o">O</span>RTAL
            </h1>

            <p className="lp-headline lp-anim-in lp-delay-3">
              Finding the right first oxygen for very preterm newborns
            </p>

            <p className="lp-lede lp-anim-in lp-delay-4">
              A triple-arm, multi-site, randomized, blinded trial comparing 30%, 60%, and 90%
              initial FiO₂ for delivery-room resuscitation of neonates born before 32 weeks.
            </p>

            <div className="lp-hero-actions lp-anim-in lp-delay-5">
              <a href="#about" className="lp-btn-primary">
                Learn about the trial
              </a>
              <button type="button" className="lp-btn-ghost" onClick={goLogin}>
                Research Staff Login
              </button>
            </div>
          </div>

          <div className="lp-hero-visual lp-anim-in lp-delay-3" aria-hidden="true">
            <div className="lp-visual-frame">
              <img src="/logo.png" alt="" className="lp-visual-logo" />
              <div className="lp-breath" />
            </div>
          </div>
        </div>

        <a href="#about" className="lp-scroll-hint" aria-label="Scroll to about">
          <span />
        </a>
      </section>

      {/* ── Full title strip ── */}
      <section className="lp-titleband" data-reveal>
        <div className="lp-titleband-inner">
          <p className="lp-titleband-label">Official study title</p>
          <p className="lp-titleband-text">
            Initial Oxygen for Delivery Room Resuscitation of Preterm Neonates:
            a triple-arm, multi-site, randomized, controlled trial
          </p>
        </div>
      </section>

      {/* ── About ── */}
      <section className="lp-section" id="about">
        <div className="lp-section-inner" data-reveal>
          <p className="lp-section-label">Why this trial</p>
          <h2 className="lp-section-title">
            The first minutes of oxygen may shape a lifetime of outcomes
          </h2>
          <p className="lp-section-text">
            Prematurity remains a leading cause of neonatal death in India and worldwide.
            Very preterm infants (born before 32 weeks) often need oxygen during delivery-room
            resuscitation — yet the ideal starting concentration is still uncertain.
          </p>
          <p className="lp-section-text lp-section-text-follow">
            Guidelines currently favour starting at 21–30% FiO₂. A recent individual-participant
            data network meta-analysis of 12 trials raised the possibility that higher initial
            oxygen (≥90%) may reduce mortality — challenging that recommendation. PORTAL was
            designed in an Indian multi-centre setting to settle the question with patient-centred
            hard outcomes.
          </p>
        </div>
      </section>

      {/* ── Design ── */}
      <section className="lp-section lp-section-alt" id="design">
        <div className="lp-section-inner" data-reveal>
          <p className="lp-section-label">Study design</p>
          <h2 className="lp-section-title">Three initial oxygen arms. One primary question.</h2>
          <p className="lp-section-text">
            Eligible inborn neonates requiring positive pressure ventilation are randomized 1:1:1,
            stratified by gestation (&lt;28 vs 28–31 weeks) and study site. Allocation uses opaque
            sealed envelopes. The resuscitation team is blinded to the assigned concentration.
          </p>

          <div className="lp-arms" data-reveal>
            <div className="lp-arm">
              <span className="lp-arm-pct">30%</span>
              <span className="lp-arm-name">Control</span>
              <span className="lp-arm-desc">Initial FiO₂, then titrated to SpO₂ targets</span>
            </div>
            <div className="lp-arm lp-arm-mid">
              <span className="lp-arm-pct">60%</span>
              <span className="lp-arm-name">Experimental</span>
              <span className="lp-arm-desc">Intermediate initial oxygen</span>
            </div>
            <div className="lp-arm lp-arm-high">
              <span className="lp-arm-pct">90%</span>
              <span className="lp-arm-name">Experimental</span>
              <span className="lp-arm-desc">High initial oxygen</span>
            </div>
          </div>

          <ul className="lp-facts" data-reveal>
            <li><strong>700</strong> neonates (target enrollment)</li>
            <li><strong>6</strong> tertiary centres across India</li>
            <li><strong>Blinded</strong> allocation from the resuscitating team</li>
            <li><strong>MRI subset</strong> at term-equivalent age (~25%)</li>
          </ul>
        </div>
      </section>

      {/* ── Outcomes ── */}
      <section className="lp-section" id="outcomes">
        <div className="lp-section-inner" data-reveal>
          <p className="lp-section-label">What we measure</p>
          <h2 className="lp-section-title">Outcomes that matter to families</h2>
          <p className="lp-section-text">
            The trial focuses on hard clinical endpoints — not laboratory markers alone — so
            results can change practice.
          </p>
          <div className="lp-outcomes">
            {OUTCOMES.map((o) => (
              <article key={o.title} className="lp-outcome" data-reveal>
                <span className="lp-outcome-label">{o.label}</span>
                <h3>{o.title}</h3>
                <p>{o.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Journey ── */}
      <section className="lp-section lp-section-alt" id="journey">
        <div className="lp-section-inner" data-reveal>
          <p className="lp-section-label">How the trial works</p>
          <h2 className="lp-section-title">From consent to follow-up</h2>
          <p className="lp-section-text">
            A clear path for families and clinicians — designed for the urgency of the delivery room
            without compromising informed choice.
          </p>
          <ol className="lp-journey">
            {JOURNEY.map((j) => (
              <li key={j.step} data-reveal>
                <span className="lp-journey-step">{j.step}</span>
                <div>
                  <h3>{j.title}</h3>
                  <p>{j.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Eligibility ── */}
      <section className="lp-section" id="eligibility">
        <div className="lp-section-inner lp-split" data-reveal>
          <div>
            <p className="lp-section-label">Who can join</p>
            <h2 className="lp-section-title">Inclusion &amp; exclusion</h2>
            <p className="lp-section-text">
              Antenatal consent is sought when there is adequate time before birth. Participation
              can be withdrawn at any time without affecting clinical care.
            </p>
          </div>
          <div className="lp-criteria">
            <div>
              <h3>Included</h3>
              <p>
                Inborn preterm neonates of less than 32 completed weeks who require delivery-room
                resuscitation with positive pressure ventilation (PPV), as per current NRP guidance.
              </p>
            </div>
            <div>
              <h3>Not included</h3>
              <p>
                Insufficient antenatal time for consent; major structural anomalies; decision to
                forego resuscitation; or refusal of consent.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Parents ── */}
      <section className="lp-section lp-section-alt" id="parents">
        <div className="lp-section-inner" data-reveal>
          <p className="lp-section-label">For parents &amp; families</p>
          <h2 className="lp-section-title">Your questions come first</h2>
          <p className="lp-section-text">
            If you are offered participation, the research team will share a parent information
            sheet in a language you understand, explain possible benefits and risks, and give you
            time to ask questions. Clinical care for mother and baby continues whether you join
            or not.
          </p>
          <div className="lp-parent-points" data-reveal>
            <div>
              <h3>No payment to join</h3>
              <p>Families are not paid to enrol. Hospital charges follow each site’s usual rules.</p>
            </div>
            <div>
              <h3>Standard care continues</h3>
              <p>Resuscitation follows ILCOR 2020 guidance; only the starting oxygen concentration is assigned by the trial.</p>
            </div>
            <div>
              <h3>Right to withdraw</h3>
              <p>You may leave the study at any time. Withdrawal never changes the quality of care your baby receives.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Ethics ── */}
      <section className="lp-section" id="ethics">
        <div className="lp-section-inner" data-reveal>
          <p className="lp-section-label">Ethics &amp; oversight</p>
          <h2 className="lp-section-title">Built for accountability</h2>
          <p className="lp-section-text">
            The study begins at each hospital only after Institutional Ethics Committee approval.
            Investigators hold valid Good Clinical Practice training. The protocol will be registered
            with the Clinical Trials Registry of India (CTRI).
          </p>
          <ul className="lp-ethics" data-reveal>
            <li>
              <strong>Technical Advisory Committee</strong>
              <span>Independent technical oversight of protocol quality and progress</span>
            </li>
            <li>
              <strong>Trial Management Committee</strong>
              <span>Site principal investigators coordinate day-to-day conduct and training</span>
            </li>
            <li>
              <strong>Data &amp; Safety Monitoring Board</strong>
              <span>Independent board reviews interim safety and outcome data</span>
            </li>
            <li>
              <strong>SAE reporting</strong>
              <span>Serious adverse events are reported to IEC and DSMB; study-related harm follows Government of India compensation rules</span>
            </li>
          </ul>
        </div>
      </section>

      {/* ── Impact ── */}
      <section className="lp-section lp-section-alt" id="impact">
        <div className="lp-section-inner" data-reveal>
          <p className="lp-section-label">Expected impact</p>
          <h2 className="lp-section-title">Evidence that can change practice</h2>
          <p className="lp-section-text">
            PORTAL aims to identify which initial FiO₂ best reduces death or BPD — and related
            serious outcomes — in very preterm infants. Results are intended to inform neonatal
            resuscitation guidelines in India and internationally, including updates considered by
            bodies such as the American Academy of Pediatrics NRP programme.
          </p>
          <p className="lp-section-text lp-section-text-follow">
            Priority areas: perinatal care and prematurity. Area of research: Discovery.
            Keywords: prematurity, delivery room, resuscitation, oxygen, mortality, BPD.
          </p>
        </div>
      </section>

      {/* ── Centres ── */}
      <section className="lp-section" id="centres">
        <div className="lp-section-inner" data-reveal>
          <p className="lp-section-label">Network</p>
          <h2 className="lp-section-title">Six centres. One national trial.</h2>
          <p className="lp-section-text">
            Delivery rooms and Level-3 NICUs across North, South, East, and West India — selected
            for volume of very preterm births, round-the-clock neonatal coverage, and blended
            oxygen capability in the delivery room.
          </p>
          <ul className="lp-centres">
            {CENTRES.map((c) => (
              <li key={c.name} data-reveal>
                <span className="lp-centre-city">{c.city}</span>
                <span className="lp-centre-name">{c.name}</span>
                <span className="lp-centre-dept">{c.dept}</span>
                <span className="lp-centre-role">{c.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Team ── */}
      <section className="lp-section lp-section-alt" id="team">
        <div className="lp-section-inner" data-reveal>
          <p className="lp-section-label">Investigators</p>
          <h2 className="lp-section-title">PI, co-investigators &amp; core team</h2>
          <p className="lp-section-text">
            Coordinating investigators at PGIMER, Chandigarh. The PI’s group previously led India’s
            first blinded delivery-room oxygen trial in preterm neonates and contributed to the
            JAMA Pediatrics 2024 IPD network meta-analysis on initial oxygen.
          </p>
          <ul className="lp-team">
            {TEAM.map((m) => (
              <li key={m.name} data-reveal>
                <span className="lp-team-role">{m.role}</span>
                <span className="lp-team-name">{m.name}</span>
                <span className="lp-team-title">{m.title}</span>
                <span className="lp-team-inst">{m.inst}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="lp-section" id="faq">
        <div className="lp-section-inner" data-reveal>
          <p className="lp-section-label">FAQ</p>
          <h2 className="lp-section-title">Common questions</h2>
          <div className="lp-faq">
            {FAQS.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Staff CTA ── */}
      <section className="lp-staff" id="staff">
        <div className="lp-staff-inner" data-reveal>
          <div>
            <p className="lp-section-label lp-label-on-dark">Electronic data capture</p>
            <h2 className="lp-staff-title">Research staff access</h2>
            <p>
              Site investigators and research nurses use the PORTAL webforms for screening,
              resuscitation, and follow-up data. Public visitors stay on this page — login is for
              authorised trial personnel only.
            </p>
          </div>
          <button type="button" className="lp-btn-primary lp-btn-on-dark" onClick={goLogin}>
            Go to staff login
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer" id="contact">
        <div className="lp-footer-inner">
          <div className="lp-footer-brands">
            <img src="/logo.png" alt="PORTAL Trial" />
            <img src="/icmr-logo.jpg" alt="ICMR" className="lp-footer-icmr" />
          </div>
          <div className="lp-footer-meta">
            <p>
              <strong>PORTAL</strong> — Preterm Oxygen for Resuscitation Trial At deLivery
            </p>
            <p>
              Funded by the Indian Council of Medical Research (ICMR). Proposal ID IIRPIG-01-00478.
              Protocol version 0.1 · 17 September 2024.
            </p>
            <p>
              Coordinating centre: Division of Neonatology, PGIMER, Chandigarh.
              Investigators declare no conflict of interest.
            </p>
          </div>
          <div className="lp-footer-links">
            <Link to="/login">Research Staff Login</Link>
            <a href="#about">About</a>
            <a href="#journey">How it works</a>
            <a href="#parents">Parents</a>
            <a href="#faq">FAQ</a>
            <a href="#team">Team</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
