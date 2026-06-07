// src/ViewScreenings.jsx
import React, { useEffect, useState } from "react";
import api from "./api/axios";
import "./ViewScreenings.css";
import { useNavigate } from "react-router-dom";


const ViewScreenings = () => {
  const [screenings, setScreenings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get("/screenings/");
        setScreenings(res.data);
      } catch (error) {
        console.error("Error fetching screenings:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredData = screenings.filter(
    (s) =>
      s.screening_id?.toLowerCase().includes(search.toLowerCase()) ||
      s.enrollment_id?.toLowerCase().includes(search.toLowerCase()) ||
      s.site_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="loader">Loading screenings...</div>;

  return (
    <div className="view-container">
      <header className="view-header">
        <h1>PORTAL Trial – Screening Records</h1>
        <p>Initial Oxygen for Delivery Room Resuscitation of Preterm Neonates</p>
      </header>
    
   
 
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search by Screening ID, Enrollment ID, or Site..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="table-container">
        {filteredData.length === 0 ? (
          <p className="no-data">No screenings found.</p>
        ) : (
          <table className="screening-table">
            <thead>
              <tr>
                <th>Screening ID</th>
                <th>Enrollment ID</th>
                <th>Site Name</th>
                <th>Screened By</th>
                <th>Gestation (wks)</th>
                <th>Expected Delivery</th>
                <th>Final Decision</th>
                <th>Consent Given</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((s) => (
                <tr key={s.id}>
                  <td>{s.screening_id}</td>
                  <td>{s.enrollment_id}</td>
                  <td>{s.site_name}</td>
                  <td>{s.screened_by || "—"}</td>
                  <td>{s.gestation_weeks}</td>
                  <td>{s.expected_delivery_date}</td>
                  <td>{s.final_decision}</td>
                  <td>{s.consent_given}</td>
                  <td>{s.created_at ? new Date(s.created_at).toLocaleString() : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ViewScreenings;
