/** Bare paths (no :id) that would not match a parameterized route → blank main area. */

export const SCREENING_ID_FORM_REDIRECTS = [
  { basePath: "/form-b", currentForm: "form_b", label: "Form B" },
];

export const ENROLLMENT_ID_FORM_REDIRECTS = [
  { basePath: "/form-c", currentForm: "form_c", label: "Form C" },
  { basePath: "/form-d", currentForm: "form_d", label: "Form D" },
  { basePath: "/form-e", currentForm: "form_e", label: "Form E" },
  { basePath: "/form-f", currentForm: "form_f", label: "Form F" },
  { basePath: "/form-g", currentForm: "form_g", label: "Form G" },
  { basePath: "/form-h", currentForm: "form_h", label: "Form H" },
  { basePath: "/form-i", currentForm: "form_i", label: "Form I" },
  { basePath: "/form-j", currentForm: "form_j", label: "Form J" },
  { basePath: "/form-k", currentForm: "form_k", label: "Form K" },
  { basePath: "/form-l", currentForm: "form_l", label: "Form L" },
  { basePath: "/minimal-monitoring", currentForm: "minimal_monitoring", label: "Daily Monitoring Sheet (DMS)" },
  { basePath: "/vs6-1", currentForm: "vs6_1", label: "Helper 2 (Resp/CV/Neuro)" },
  { basePath: "/fio2-auc", currentForm: "fio2_auc", label: "Helper 3 (FiO₂ Logging)" },
  { basePath: "/infect-gi-hema-log", currentForm: "infect_gi_hema", label: "Helper 4" },
  { basePath: "/metab-renal-vasc-eye-log", currentForm: "metab_renal_vasc_eye", label: "Helper 5" },
  { basePath: "/form-y-sae", currentForm: "form_y_sae", label: "Form Y (SAE)" },
  { basePath: "/adverse-events", currentForm: "adverse_events", label: "Adverse Events" },
  { basePath: "/sae-list", currentForm: "sae_list", label: "SAE Listing" },
];
