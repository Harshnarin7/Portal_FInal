import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer
} from "recharts";

import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";

import "./Dashboard.css";
import api from "./api/axios";

const COLORS = {
  primary: "#6366f1",
  success: "#22c55e",
  danger: "#ef4444",
  warning: "#f59e0b",
  grid: "#334155",
};

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const syncFromFirebase = async () => {
    try {
      const snapshot = await getDocs(collection(db, "patients"));

      for (const docSnap of snapshot.docs) {
        const raw = docSnap.data();
        const formA = raw.form_a || raw;

        await api.post("/import-from-firebase/", {
          screening_id: docSnap.id,
          enrollment_id: formA.enrollmentId || "",
          mother_first_name: formA.motherFirstName || "",
          maternal_uid: formA.maternalUid || "",
          site_id: formA.siteId || "",
          site_name: formA.site || "",
        });
      }

      alert("✅ Sync completed");
    } catch (err) {
      console.error(err);
      alert("❌ Sync failed");
    }
  };

  const openEnrollment = async (enrollmentId) => {
    try {
      const res = await api.get(`/enrollment-status/${enrollmentId}`);
      const next = res.data.next_form;
      navigate(`/${next}`);
    } catch {
      alert("Failed to load enrollment status");
    }
  };

  useEffect(() => {
    api.get("/screenings/")
      .then(res => setData(res.data))
      .finally(() => setLoading(false));
  }, []);

  const total = data.length;
  const eligible = data.filter(d => d.screening_status === "Eligible").length;
  const screenFailure = data.filter(d => d.screening_status === "Screen Failure").length;
  const notEligible = data.filter(d => d.screening_status === "Not Eligible").length;

  const pieData = [
    { name: "Eligible", value: eligible },
    { name: "Screen Failure", value: screenFailure },
    { name: "Not Eligible", value: notEligible },
  ];

  const siteMap = {};
  data.forEach(d => {
    if (!d.site_name) return;
    siteMap[d.site_name] = (siteMap[d.site_name] || 0) + 1;
  });

  const barData = Object.keys(siteMap).map(site => ({
    site,
    count: siteMap[site]
  }));

  if (loading) return <div className="loader">Loading dashboard...</div>;

  return (
    <div className="dashboard-page">

      {/* HEADER */}
      <div className="dashboard-header glass">
        <div>
          <h2>📊 Study Dashboard</h2>
          <p className="sub-text">Overview of screenings and enrollments</p>
        </div>

        <button onClick={syncFromFirebase} className="primary-btn">
          🔄 Sync Data
        </button>
      </div>

      {/* KPI */}
      <div className="summary-row">
        <div className="summary-card glass">
          <p>Total Screened</p>
          <span>{total}</span>
        </div>

        <div className="summary-card glass success">
          <p>Eligible</p>
          <span>{eligible}</span>
        </div>

        <div className="summary-card glass warning">
          <p>Not Eligible</p>
          <span>{notEligible}</span>
        </div>

        <div className="summary-card glass danger">
          <p>Failures</p>
          <span>{screenFailure}</span>
        </div>
      </div>

      {/* CHARTS */}
      <div className="chart-row">

        <div className="chart-card glass">
          <h3>Screening Outcome</h3>

          {total === 0 ? (
            <div className="empty-chart">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} dataKey="value" innerRadius={70} outerRadius={100}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={["#22c55e", "#ef4444", "#f59e0b"][i]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-card glass">
          <h3>By Site</h3>

          {total === 0 ? (
            <div className="empty-chart">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData}>
                <CartesianGrid stroke={COLORS.grid} />
                <XAxis dataKey="site" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill={COLORS.primary} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

      </div>

      {/* TABLE */}
      <div className="table-section glass">
        <h3>Enrolled Participants</h3>

        <table className="dashboard-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Site</th>
              <th>Gestation</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {data.map(row => (
              <tr key={row.enrollment_id}>
                <td className="bold">{row.enrollment_id}</td>
                <td>{row.site_name || "-"}</td>
                <td>{row.gestation_weeks ?? "-"}</td>

                <td>
                  <span className={`status-chip ${row.screening_status?.replace(" ", "-").toLowerCase()}`}>
                    {row.screening_status}
                  </span>
                </td>

                <td>
                  <button className="link-btn" onClick={() => openEnrollment(row.enrollment_id)}>
                    → Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

      </div>

    </div>
  );
}