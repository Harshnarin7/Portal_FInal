import React, { useState, useEffect } from "react";
import api from "./api/axios";
import { useLocation, useNavigate } from "react-router-dom";
import "./styles/global.css";
import "./styles/Tables.css";
import FormLayout from "./components/FormLayout";
import { usePatient } from "./context/PatientContext";

import { useFormProgress } from "./context/FormProgressContext";
import { useParams } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
const MODES = ["RA", "NC", "HFNC", "CPAP", "NIPPV", "SIMV", "HFOV", "HFO"];
const BLOCKS = ["0–12h", "12–24h"];
const DAYS = [1, 2, 3, 4, 5, 6, 7];
export default function FiO2AUC() {
  const [logs, setLogs] = useState([]);
  const { patientData } = usePatient();
  const [formData, setFormData] = useState({
  enrollment_id: "",
  dob: "",
  gestation: ""
})
useEffect(() => {
  if (!patientData) return;

  const gestationFormatted =
  patientData.gestation_weeks !== null &&
  patientData.gestation_days !== null
    ? `${patientData.gestation_weeks} weeks ${patientData.gestation_days} days`
    : "";

  setFormData(prev => ({
    ...prev,
    enrollment_id: patientData.enrollment_id || "",
    dob: patientData.dob || "",
    gestation: gestationFormatted
  }));
}, [patientData]);


  useEffect(() => {
    const temp = [];
    DAYS.forEach((day) => {
      BLOCKS.forEach((block) => {
        temp.push({
          day,
          block,
          fio2: "",
          mode: "RA",
        });
      });
    });
    setLogs(temp);
  }, []);

  const location = useLocation();
const navigate = useNavigate();
const { markFormCompleted } = useFormProgress();
const { enrollmentId } = useParams();

useEffect(() => {
  if (!enrollmentId) return;

  api.get(`/birth-resuscitation/${enrollmentId}`)
    .then(res => {
      const b = res?.data || {};

      const gestationFormatted =
        b?.gestation_weeks !== null &&
        b?.gestation_days !== null
          ? `${b.gestation_weeks} weeks ${b.gestation_days} days`
          : "";

      setFormData(prev => ({
        ...prev,
        enrollment_id: b?.enrollment_id || enrollmentId,
        dob: b?.date_of_birth
  ? b.date_of_birth.includes("T")
    ? b.date_of_birth.split("T")[0]
    : b.date_of_birth
  : "",
        gestation: gestationFormatted
      }));
    })
    .catch(err => {
      console.log("❌ Error fetching Form B data", err);
    });
}, [enrollmentId]);
  const updateLog = (day, block, field, value) => {
  const updated = logs.map((log) => {
    if (log.day === day && log.block === block) {

      // 🔥 If mode is RA → force FiO2 = 21
      if (field === "mode") {
        return {
          ...log,
          mode: value,
          
        };
      }

      // 🔥 Prevent changing FiO2 if RA
      if (field === "fio2" && log.mode === "RA") {
        return log;
      }

      return { ...log, [field]: value };
    }
    return log;
  });

  setLogs(updated);
};

  const getDayLogs = (day) => logs.filter((l) => l.day === day);

 const calcBlockAUC = (input) => {
  const entries = parseFiO2(input);
  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  if (totalHours !== 12) return 0; // 🚫 block wrong calc

  return entries.reduce(
    (sum, e) => sum + (e.value / 100) * e.hours,
    0
  );
};


const parseFiO2 = (input) => {
  if (!input) return [];

  return input
    .split(/,|\n/)
    .map(item => item.trim())
    .filter(item => item !== "")
    .map(item => {
      const [val, hrs] = item.split("@");

      let fio2 = Number(val);
      let hours = Number(hrs);

      // ✅ Fix invalid FiO2
      if (isNaN(fio2)) fio2 = 21;

      // ✅ Clamp between 21–100
      fio2 = Math.max(21, Math.min(100, fio2));

      // ✅ Fix invalid hours
      if (isNaN(hours) || hours < 0) hours = 0;

      return {
        value: fio2,
        hours: hours
      };
    });
};

  const calcDayAUC = (dayLogs) => {
  const block1 = calcBlockAUC(dayLogs[0]?.fio2 || "");
  const block2 = calcBlockAUC(dayLogs[1]?.fio2 || "");

  return block1 + block2;
};

  const totalAUC = () => {
    let total = 0;
    DAYS.forEach((d) => {
      const logs = getDayLogs(d);
      total += Number(calcDayAUC(logs));
    });
    return total.toFixed(2);
  };

  const meanFiO2 = () => {
    return (totalAUC() / 168).toFixed(3);
  };

  const excessO2 = () => {
    return (totalAUC() - 0.21 * 168).toFixed(2);
  };
  // ✅ Mean AUC per day (correct)
const calcMeanDayAUC = (dayLogs) => {
  const block1 = calcBlockAUC(dayLogs[0]?.fio2 || "");
  const block2 = calcBlockAUC(dayLogs[1]?.fio2 || "");

  return (block1 + block2) / 2;
};

// ✅ Excess AUC per day (correct)
const calcExcessDayO2 = (dayLogs) => {
  const total = calcDayAUC(dayLogs);
  return total - (0.21 * 24);
};
  


  const getTotalHours = (input) => {
  const entries = parseFiO2(input);
  return entries.reduce((sum, e) => sum + e.hours, 0);
};

  const isValid = (entries) => {
  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
  return totalHours === 12;
};
const handleSubmit = async () => {
  try {
    if (!enrollmentId) {
      alert("Enrollment ID missing");
      return;
    }

    await api.post("/fio2-auc/", {
  enrollment_id: enrollmentId,
  total_auc: Number(totalAUC()),
  mean_daily_fio2: Number(meanFiO2()),
  excess_o2_auc: Number(excessO2()),
  fio2_logs: logs
});
    markFormCompleted("fio2_auc");
    // ✅ CORRECT ROUTE FROM App.js
    navigate(`/vs6-1/${enrollmentId}`);
   

  } catch (err) {
    console.error(err);
    alert("Error saving FiO₂ data");
  }
};

  return (
    <div className="screening-form">

      <h2 className="title">
        Helper Form 1 : FiO₂ Logging Sheet for AUC Calculation
      </h2>
      <p className="subtitle">(First 7 Days - Critical Period)</p>
      <p className="subtitle">
        Record FiO₂ (%) at each 6-hour interval. Leave blank if on Room Air (21%).
      </p>

      <div className="id-row">
  <div className="id-cell">
    <label>Enrollment ID:</label>
    <input value={formData.enrollment_id} readOnly className="form-control" />
  </div>

  <div className="id-cell">
    <label>DOB (DD/MM/YY):</label>
    <DatePicker
  selected={
    formData.dob ? new Date(formData.dob) : null
  }
  onChange={(date) =>
    setFormData((prev) => ({
      ...prev,
      dob: date
        ? date.toISOString().split("T")[0]
        : ""
    }))
  }
  dateFormat="dd-MM-yyyy"
  placeholderText="Select date"
  className="form-control"
  disabled
/>
  </div>

  <div className="id-cell">
    <label>Gestation:</label>
    <input value={formData.gestation} readOnly className="form-control"/>
  </div>
</div>

      {/* TABLE */}
      <div className="table-wrapper">
        <table className="auc-table">

          {/* HEADER */}
     <thead>
  <tr>
    <th className="left-header">Time Point</th>

    {DAYS.map((d) => (
      <th key={d} colSpan={4}>Day {d}</th>
    ))}
  </tr>

  <tr>
    <th className="left-header">Hour of Life</th>

    {DAYS.map((d) => (
      <React.Fragment key={d}>
        <th>1–12h</th>
<th>AUC</th>
<th>13–24h</th>
<th>AUC</th>
      </React.Fragment>
    ))}
  </tr>

  
</thead>

          <tbody>
            {/* MODE ROW */}
            <tr>
  <td><strong>Support Mode</strong></td>

  {DAYS.map((d) => {
    const dayLogs = getDayLogs(d);

    return (
      <React.Fragment key={d}>

        {/* 0–12h */}
        <td>
          <select
            value={dayLogs[0]?.mode}
            onChange={(e) =>
              updateLog(d, dayLogs[0].block, "mode", e.target.value)
            }
          >
            <option>RA</option>
            <option>NC</option>
            <option>HFNC</option>
            <option>CPAP</option>
            <option>NIPPV</option>
            <option>SIMV</option>
            <option>HFOV</option>
            <option>HFO</option>
          </select>
        </td>

        {/* AUC column (empty) */}
        <td></td>

        {/* 12–24h */}
        <td>
          <select
            value={dayLogs[1]?.mode}
            onChange={(e) =>
              updateLog(d, dayLogs[1].block, "mode", e.target.value)
            }
          >
            <option>RA</option>
            <option>NC</option>
            <option>HFNC</option>
            <option>CPAP</option>
            <option>NIPPV</option>
            <option>SIMV</option>
            <option>HFOV</option>
            <option>HFO</option>
          </select>
        </td>

        {/* AUC column (empty) */}
        <td></td>

      </React.Fragment>
    );
  })}
</tr>

            {/* FiO2 ROW */}
            <tr>
  <td>
    <strong>
      FiO₂ (%)
      <span className="info-icon">
        ℹ️
        <span className="tooltip">
          Enter as: FiO₂@hours  
          Example: 40@3, 60@4, 55@5  
          Total hours must = 12
        </span>
      </span>
    </strong>
  </td>

  {DAYS.map((d) => {
    const dayLogs = getDayLogs(d);

    return (
      <React.Fragment key={d}>

        {/* 🔹 0–12h */}
        <td>
          <textarea
            value={dayLogs[0]?.fio2}
            disabled={dayLogs[0]?.mode === "RA"}
            rows={3}
            style={{
              width: "100%",
              maxWidth: "100%",
              boxSizing: "border-box",
              resize: "vertical",
              overflow: "auto",
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
              padding: "6px",
              borderRadius: "6px",
              border: getTotalHours(dayLogs[0]?.fio2) !== 12
                ? "1px solid red"
                : "1px solid #ccc",
              backgroundColor: dayLogs[0]?.mode === "RA" ? "#e5e7eb" : "white"
            }}
            placeholder={`40@3\n60@4\n55@5`}
            onChange={(e) =>
              updateLog(d, dayLogs[0].block, "fio2", e.target.value)
            }
          />

          <div style={{ fontSize: "12px", color: "#6b7280" }}>
            Total hours: {getTotalHours(dayLogs[0]?.fio2)}/12
          </div>
        </td>

        {/* 🔥 AUC (0–12) */}
        <td className="auc-cell">
          {calcBlockAUC(dayLogs[0]?.fio2 || "").toFixed(2)}
        </td>

        {/* 🔹 12–24h */}
        <td>
          <textarea
            value={dayLogs[1]?.fio2}
            disabled={dayLogs[1]?.mode === "RA"}
            rows={3}
            style={{
              width: "100%",
              maxWidth: "100%",
              boxSizing: "border-box",
              resize: "vertical",
              overflow: "auto",
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
              padding: "6px",
              borderRadius: "6px",
              border: getTotalHours(dayLogs[1]?.fio2) !== 12
                ? "1px solid red"
                : "1px solid #ccc",
              backgroundColor: dayLogs[1]?.mode === "RA" ? "#e5e7eb" : "white"
            }}
            placeholder={`40@3\n60@4\n55@5`}
            onChange={(e) =>
              updateLog(d, dayLogs[1].block, "fio2", e.target.value)
            }
          />

          <div style={{ fontSize: "12px", color: "#6b7280" }}>
            Total hours: {getTotalHours(dayLogs[1]?.fio2)}/12
          </div>
        </td>

        {/* 🔥 AUC (12–24) */}
        <td className="auc-cell">
          {calcBlockAUC(dayLogs[1]?.fio2 || "").toFixed(2)}
        </td>

      </React.Fragment>
    );
  })}
</tr>

            
            <tr>
  <td className="left-col">Cumulative AUC</td>

  {DAYS.map((d) => {
    const dayLogs = getDayLogs(d);
    const dayAUC = calcDayAUC(dayLogs);

    return (
      <td
        key={d}
        colSpan={4}
        className="auc-cell"
        style={{
          textAlign: "center",
          fontWeight: "bold",
          backgroundColor: "#f3f4f6"
        }}
      >
        {isNaN(dayAUC) ? "0.00" : dayAUC.toFixed(2)}
      </td>
    );
  })}
</tr>
<tr>
  <td className="left-col">Mean AUC (per day)</td>

  {DAYS.map((d) => {
    const dayLogs = getDayLogs(d);
    const mean = calcMeanDayAUC(dayLogs);

    return (
      <td
        key={d}
        colSpan={4}
        className="auc-cell"
        style={{
          textAlign: "center",
          backgroundColor: "#eef2ff",
          fontWeight: "600"
        }}
      >
        {isNaN(mean) ? "0.00" : mean.toFixed(3)}
      </td>
    );
  })}
</tr>
<tr>
  <td className="left-col">Excess O₂ (per day)</td>

  {DAYS.map((d) => {
    const dayLogs = getDayLogs(d);
    const excess = calcExcessDayO2(dayLogs);

    return (
      <td
        key={d}
        colSpan={4}
        className="auc-cell"
        style={{
          textAlign: "center",
          backgroundColor: "#fef3c7",
          fontWeight: "600"
        }}
      >
        {isNaN(excess) ? "0.00" : excess.toFixed(2)}
      </td>
    );
  })}
</tr>

          </tbody>
        </table>
      </div>

      <div className="mode-codes">
  <strong>Mode Codes: </strong> 
  RA = Room Air, NC = Nasal Cannula, HFNC = High Flow, 
  CPAP, NIPPV, SIMV, HFOV, HFO
</div>

      {/* SUMMARY */}
      <h4>Summary</h4>
      <div className="summary-box">
        <div>
          <label>Total AUC (7 days)</label>
          <input value={Number(totalAUC()).toFixed(2)} readOnly />
        </div>

        <div>
          <label>Mean Daily FiO₂</label>
          <input value={meanFiO2()} readOnly />
        </div>

        <div>
          <label>Excess O₂ AUC</label>
          <input value={excessO2()} readOnly />
        </div>
      </div>

      {/* NOTES */}
      <div className="notes-box">
        <h4>Notes</h4>
        <ul>
          <li>Daily AUC = Mean FiO₂ × 24 hours</li>
          <li>Cumulative AUC = Sum of all daily AUCs</li>
          <li>Excess O₂ AUC = Total AUC − (21% × 168 hours)</li>
          <li>If FiO₂ changes within block, record average</li>
          <li>Room air = 21%</li>
        </ul>
      </div>
      <div style={{
  marginTop: "20px",
  display: "flex",
  justifyContent: "space-between"
}}>

  {/* PREVIOUS */}
  

  {/* SAVE & NEXT */}
  <button
    type="button"
    onClick={handleSubmit}
    style={{
      padding: "10px 16px",
      backgroundColor: "#2563eb",
      color: "white",
      border: "none",
      borderRadius: "6px",
      cursor: "pointer"
    }}
  >
    Save & Continue
  </button>

</div>

    </div>
  );
}