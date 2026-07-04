import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import './CONSORTFlow.css';

/**
 * CONSORT Participant Flow Table Component
 * Displays Box 1-11 participant flow from screening through follow-up
 * 
 * Issue #2: CONSORT participant flow table — implementation specification
 */

const CONSORTFlow = () => {
  const { user, token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedBoxes, setExpandedBoxes] = useState(new Set());

  useEffect(() => {
    fetchCONSORTData();
  }, [token]);

  const fetchCONSORTData = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/dashboard/consort`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const jsonData = await response.json();
      setData(jsonData);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load CONSORT data');
      console.error('CONSORT fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (boxNumber) => {
    const newExpanded = new Set(expandedBoxes);
    if (newExpanded.has(boxNumber)) {
      newExpanded.delete(boxNumber);
    } else {
      newExpanded.add(boxNumber);
    }
    setExpandedBoxes(newExpanded);
  };

  const downloadCSV = () => {
    if (!data) return;

    let csv = 'CONSORT Participant Flow\n';
    csv += `Generated: ${data.generated_at}\n\n`;
    csv += 'Label,Overall,' + data.sites.join(',') + '\n';

    data.rows.forEach(row => {
      csv += `"${row.label}",${row.overall}`;
      data.sites.forEach(site => {
        csv += `,${row.by_site[site] || 0}`;
      });
      csv += '\n';

      if (row.sub_rows && row.sub_rows.length > 0) {
        row.sub_rows.forEach(subRow => {
          csv += `"  — ${subRow.label}",${subRow.overall}`;
          data.sites.forEach(site => {
            csv += `,${subRow.by_site[site] || 0}`;
          });
          csv += '\n';
        });
      }
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CONSORT_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="consort-container">
        <div className="loading">Loading CONSORT data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="consort-container">
        <div className="error">
          <strong>Error:</strong> {error}
          <button onClick={fetchCONSORTData} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="consort-container">
        <div className="error">No data available</div>
      </div>
    );
  }

  const isSuperadmin = user?.role === 'superadmin';
  const displaySites = isSuperadmin ? data.sites : (user?.site_name ? [user.site_name] : []);

  return (
    <div className="consort-container">
      <div className="consort-header">
        <div>
          <h1>CONSORT Participant Flow</h1>
          <p className="subtitle">Trial participant recruitment and follow-up funnel</p>
          <p className="data-timestamp">
            Data as of: <strong>{new Date(data.generated_at).toLocaleString()}</strong>
          </p>
        </div>
        {isSuperadmin && (
          <button onClick={downloadCSV} className="download-btn">
            📥 Download CSV
          </button>
        )}
      </div>

      <div className="consort-table-wrapper">
        <table className="consort-table">
          <thead>
            <tr>
              <th className="label-col">Label</th>
              <th className="numeric-col">Overall</th>
              {displaySites.map(site => (
                <th key={site} className="numeric-col">
                  {site}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, idx) => {
              const hasSubRows = row.sub_rows && row.sub_rows.length > 0;
              const isExpanded = expandedBoxes.has(row.box);

              return (
                <React.Fragment key={row.box}>
                  {/* Main row */}
                  <tr
                    className={`consort-row box-${row.box} ${
                      row.label.includes('Awaiting') ? 'status-awaiting' : ''
                    } ${row.label.includes('Lost to follow-up') ? 'status-ltfu' : ''} ${
                      row.label.includes('Died') ? 'status-died' : ''
                    }`}
                  >
                    <td className="label-col">
                      <div className="label-content">
                        {hasSubRows && (
                          <button
                            className="expand-btn"
                            onClick={() => toggleExpanded(row.box)}
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                        )}
                        <span className="box-number">Box {row.box}</span>
                        <span className="box-label">{row.label}</span>
                      </div>
                    </td>
                    <td className="numeric-col">
                      <strong>{row.overall}</strong>
                    </td>
                    {displaySites.map(site => (
                      <td key={site} className="numeric-col">
                        {row.by_site[site] || 0}
                      </td>
                    ))}
                  </tr>

                  {/* Sub-rows (collapsed by default) */}
                  {hasSubRows &&
                    isExpanded &&
                    row.sub_rows.map((subRow, subIdx) => (
                      <tr
                        key={`${row.box}-sub-${subIdx}`}
                        className={`consort-sub-row box-${row.box} ${
                          subRow.label.includes('Awaiting') ? 'status-awaiting' : ''
                        } ${subRow.label.includes('Lost to follow-up') ? 'status-ltfu' : ''} ${
                          subRow.label.includes('Died') ? 'status-died' : ''
                        }`}
                      >
                        <td className="label-col">
                          <div className="label-content">
                            <span className="sub-indicator">—</span>
                            <span className="sub-label">{subRow.label}</span>
                          </div>
                        </td>
                        <td className="numeric-col">{subRow.overall}</td>
                        {displaySites.map(site => (
                          <td key={site} className="numeric-col">
                            {subRow.by_site[site] || 0}
                          </td>
                        ))}
                      </tr>
                    ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="consort-legend">
        <h3>Legend</h3>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-box status-awaiting"></span>
            <span>Awaiting assessment</span>
          </div>
          <div className="legend-item">
            <span className="legend-box status-ltfu"></span>
            <span>Lost to follow-up</span>
          </div>
          <div className="legend-item">
            <span className="legend-box status-died"></span>
            <span>Died</span>
          </div>
        </div>
        <p className="legend-note">
          <strong>Note:</strong> Sub-categories are not mutually exclusive. A participant may appear in multiple sub-rows if they have multiple reasons for a status.
        </p>
      </div>
    </div>
  );
};

export default CONSORTFlow;
