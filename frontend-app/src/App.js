// src/App.js

import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import { ClipboardList, Home, Plus } from "lucide-react";

import { FormProgressProvider } from "./context/FormProgressContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PatientProvider } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";

import ScreeningForm from "./ScreeningForm";
import BirthResuscitation from "./BirthResuscitationForm";
import FormC from "./FormC";
import FormD from "./FormD";
import FormE from "./FormE";
import FormF from "./FormF";
import FormG from "./FormG";
import FormH from "./FormH";
import FormI from "./FormI";
import FormJ from "./FormJ";

import FiO2AUC from "./FiO2AUC";
import RespCVNeuroLog from "./RespCVNeuroLog";
import InfectGIHemaLog from "./InfectGIHemaLog";
import MetabRenalVascEyeLog from "./MetabRenalVascEyeLog";

import FormY_SAE from "./FormY_SAE";
import AdverseEventsForm from "./AdverseEventsForm";
import SeriousAdverseEventsList from "./SeriousAdverseEventsList";

import ViewEntries from "./ViewEntries";
import EditScreening from "./EditScreening";
import Dashboard from "./Dashboard";
import Login from "./Login";
import LandingPage from "./LandingPage";

import ProtectedRoute from "./components/ProtectedRoute";
import FloatingLogout from "./components/FloatingLogout";
import FormLayout from "./layouts/FormLayout";

import "./App.css";


function AppContent() {
  const { token } = useAuth();
  const { resetProgress } = useFormProgress();
  const location = useLocation();

  const isLandingPage = location.pathname === "/";
  const isLoginPage   = location.pathname === "/login";

  const isFormPage =
    location.pathname.includes("/form-") ||
    location.pathname.includes("/fio2-") ||
    location.pathname.includes("/vs6-1") ||
    location.pathname.includes("/infect-") ||
    location.pathname.includes("/metab-") ||
    location.pathname.includes("/adverse-") ||
    location.pathname.includes("/sae-");

  return (
    <div className={`app-container ${isFormPage ? "form-page-layout" : ""}`}>

      {/* ===== HEADER — hidden on landing page and form pages only ===== */}
      {!isFormPage && !isLandingPage && (
        <header className="app-header">
          <div className="header-inner">

            {/* LEFT — PORTAL logo */}
            <div className="header-logo-panel">
              <div className="header-logo-box">
                <img src="/portal-logo.png" alt="PORTAL Trial Logo" className="header-logo-img" />
              </div>
              <span className="header-logo-label">PORTAL</span>
            </div>

            {/* CENTER — Title */}
            <div className="header-titles">
              <h1>PORTAL Trial</h1>
              <p className="header-subtitle">
                Initial Oxygen for Delivery Room Resuscitation of Preterm Neonates
              </p>
              <p className="header-subtitle-small">
                A triple-arm, multisite, randomized, controlled trial
              </p>
              <div className="header-badges">
                <span>PGIMER Chandigarh</span>
                <span>ICMR Funded</span>
                <span className="badge-green">Multi-site RCT</span>
              </div>
            </div>

            {/* RIGHT — ICMR logo */}
            <div className="header-logo-panel">
              <div className="header-logo-box">
                <img src="/icmr-logo.svg" alt="ICMR Logo" className="header-logo-img" />
              </div>
              <span className="header-logo-label">ICMR</span>
            </div>

          </div>
          {/* Research Staff Login button in header */}
          {!token && (
            <div className="header-login-bar">
              <a href="/login" className="header-login-btn">
                🔐 Research Staff Login
              </a>
            </div>
          )}
          <div className="header-glow-bar"></div>
        </header>
      )}

        {/* ===== NAVBAR — hidden on landing page and login page ===== */}
        {token && !isFormPage && !isLandingPage && !isLoginPage && (
          <nav className="nav-bar">
            <div className="nav-links">
              <NavLink
                to="/dashboard"
                className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}
              >
                <Home size={16} /> <span>Dashboard</span>
              </NavLink>

              <NavLink
                to="/form-a"
                className="nav-btn primary"
                onClick={() => {
                  localStorage.removeItem("current_screening_id");
                  localStorage.removeItem("current_enrollment_id");
                  localStorage.removeItem("enrollment_locked");
                  window.dispatchEvent(new Event("storage"));
                  window.location.href = "/form-a";
                }}
              >
                <Plus size={16} /> <span>New Entry</span>
              </NavLink>

              <NavLink
                to="/entries"
                className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}
              >
                <ClipboardList size={16} /> <span>View Entries</span>
              </NavLink>
            </div>

            <div className="nav-right">
              <div className="nav-divider"></div>
              <FloatingLogout />
            </div>
          </nav>
        )}

        {/* ===== ROUTES ===== */}
        <PatientProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="*"
              element={
                <main className="app-main">
                  <div className="content-wrapper">
                    <Routes>
                      <Route path="/" element={<LandingPage />} />
                      <Route path="/home" element={<Navigate to="/dashboard" />} />
                      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                      <Route path="/entries" element={<ProtectedRoute><ViewEntries /></ProtectedRoute>} />
                      <Route path="/edit/:id" element={<ProtectedRoute><EditScreening /></ProtectedRoute>} />
                      <Route path="/form-a/:screeningId?" element={<ProtectedRoute><FormLayout currentForm="form_a"><ScreeningForm /></FormLayout></ProtectedRoute>} />
                      <Route path="/form-b/:screeningId" element={<ProtectedRoute><FormLayout currentForm="form_b"><BirthResuscitation /></FormLayout></ProtectedRoute>} />
                      <Route path="/form-c/:enrollmentId" element={<ProtectedRoute><FormLayout currentForm="form_c"><FormC /></FormLayout></ProtectedRoute>} />
                      <Route path="/form-d/:enrollmentId" element={<ProtectedRoute><FormLayout currentForm="form_d"><FormD /></FormLayout></ProtectedRoute>} />
                      <Route path="/form-e/:enrollmentId" element={<ProtectedRoute><FormLayout currentForm="form_e"><FormE /></FormLayout></ProtectedRoute>} />
                      <Route path="/form-f/:enrollmentId" element={<ProtectedRoute><FormLayout currentForm="form_f"><FormF /></FormLayout></ProtectedRoute>} />
                      <Route path="/form-g/:enrollmentId" element={<ProtectedRoute><FormLayout currentForm="form_g"><FormG /></FormLayout></ProtectedRoute>} />
                      <Route path="/form-h/:enrollmentId" element={<ProtectedRoute><FormLayout currentForm="form_h"><FormH /></FormLayout></ProtectedRoute>} />
                      <Route path="/form-i/:enrollmentId" element={<ProtectedRoute><FormLayout currentForm="form_i"><FormI /></FormLayout></ProtectedRoute>} />
                      <Route path="/form-j/:enrollmentId" element={<ProtectedRoute><FormLayout currentForm="form_j"><FormJ /></FormLayout></ProtectedRoute>} />
                      <Route path="/fio2-auc/:enrollmentId" element={<ProtectedRoute><FormLayout currentForm="fio2_auc"><FiO2AUC /></FormLayout></ProtectedRoute>} />
                      <Route path="/vs6-1/:enrollmentId?" element={<ProtectedRoute><FormLayout currentForm="vs6_1"><RespCVNeuroLog /></FormLayout></ProtectedRoute>} />
                      <Route path="/infect-gi-hema-log/:enrollmentId" element={<ProtectedRoute><FormLayout currentForm="infect_gi_hema"><InfectGIHemaLog /></FormLayout></ProtectedRoute>} />
                      <Route path="/metab-renal-vasc-eye-log/:enrollmentId" element={<ProtectedRoute><FormLayout currentForm="metab_renal_vasc_eye"><MetabRenalVascEyeLog /></FormLayout></ProtectedRoute>} />
                      <Route path="/form-y-sae/:enrollmentId" element={<ProtectedRoute><FormLayout currentForm="form_y_sae"><FormY_SAE /></FormLayout></ProtectedRoute>} />
                      <Route path="/adverse-events/:enrollmentId" element={<ProtectedRoute><FormLayout currentForm="adverse_events"><AdverseEventsForm /></FormLayout></ProtectedRoute>} />
                      <Route path="/sae-list/:enrollmentId" element={<ProtectedRoute><FormLayout currentForm="sae_list"><SeriousAdverseEventsList /></FormLayout></ProtectedRoute>} />
                    </Routes>
                  </div>
                </main>
              }
            />
          </Routes>
        </PatientProvider>

        {/* ===== FOOTER ===== */}
        {!isFormPage && !isLandingPage && (
          <footer className="app-footer">
            <p>© 2025 PORTAL Trial | Developed for Clinical Research Data Entry</p>
          </footer>
        )}

      </div>
  );
}


function App() {
  return (
    <Router>
      <FormProgressProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </FormProgressProvider>
    </Router>
  );
}

export default App;