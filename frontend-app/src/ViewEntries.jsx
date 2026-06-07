// src/ViewEntries.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./ViewEntries.css";

const ViewEntries = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const navigate = useNavigate();

  // =========================
  // FETCH DATA
  // =========================
  const fetchEntries = async () => {
    try {
      const res = await api.get("/screenings/");
      setEntries(res.data);
    } catch (err) {
      console.error("Error fetching entries:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  // =========================
  // DELETE
  // =========================
  const handleDelete = async (id) => {
    if (window.confirm(`Delete entry ID: ${id}?`)) {
      try {
        await api.delete(`/screenings/${id}`);
        setEntries(entries.filter((e) => e.id !== id));
      } catch (err) {
        console.error("Delete failed:", err);
        alert("Failed to delete");
      }
    }
  };

  // =========================
  // EDIT (IMPORTANT)
  // =========================
  const handleEdit = (screeningId) => {
    localStorage.setItem("current_screening_id", screeningId);
    navigate(`/form-a/${screeningId}`);
  };

  if (loading) return <p>Loading entries...</p>;

  return (
    <div className="view-container">
      <h2>All Screening Entries</h2>

      {entries.length === 0 ? (
        <p>No entries found.</p>
      ) : (
        <table className="entries-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Screening ID</th>
              <th>Enrollment ID</th>
              <th>Site</th>
              <th>Gestation</th>
              <th>Status</th>
              <th>Consent</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{e.id}</td>

                <td>{e.screening_id}</td>

                <td>{e.enrollment_id || "—"}</td>

                <td>{e.site_name || "-"}</td>

                <td>
                  {e.gestation_weeks != null
                    ? `${e.gestation_weeks} wks`
                    : "-"}
                </td>

                <td>{e.screening_status || "-"}</td>

                <td>{e.consent_given || "-"}</td>

                <td className="actions">
                  <button
                    onClick={() => handleEdit(e.screening_id)}
                    className="edit-btn"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => handleDelete(e.id)}
                    className="delete-btn"
                  >
                    Delete
                  </button>

                  <button
                    onClick={() => setSelectedEntry(e)}
                    className="view-btn"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ========================= */}
      {/* MODAL VIEW */}
      {/* ========================= */}
      {selectedEntry && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Screening Details</h3>

            <button
              className="close-btn"
              onClick={() => setSelectedEntry(null)}
            >
              X
            </button>

            <div className="modal-body">
              {Object.entries(selectedEntry).map(([key, value]) => (
                <p key={key}>
                  <strong>{key.replaceAll("_", " ")}:</strong>{" "}
                  {value?.toString() || "-"}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewEntries;