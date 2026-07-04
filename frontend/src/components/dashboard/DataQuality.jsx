import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import './DataQuality.css';

/**
 * Data Quality Indicators Dashboard
 * Five panels: form completion, daily log status, timeliness, gaps, site activity
 * 
 * Issue #3: Data Quality Indicators — implementation specification
 */

const FormCompletionPanel = ({ data, sites }) => {
  const getCompletionPercentage = (form) => {
    const expected = form.overall?.expected || 0;
    const present = form.overall?.present || 0;
    if (expected === 0) return 0;
    return Math.round((present / expected) * 100);
  };

  const getColorClass = (percentage) => {
    if (percentage >= 90) return 'completion-green';
    if (percentage >= 70) return 'completion-amber';
    return 'completion-red';
  };

  return (
    <div className="panel">
      <h2>Panel 1: Form Completion Matrix</h2>
      <div className="form-completion-table">
        <table>
          <thead>
            <tr>
              <th>Form</th>
              <th className="numeric">Expected</th>
              <th className="numeric">Submitted</th>
              <th className="numeric">% Complete</th>
            </tr>
          </thead>
          <tbody>
            {data.map((form, idx) => {
              const percentage = getCompletionPercentage(form);
              return (
                <tr key={idx} className={`completion-row ${getColorClass(percentage)}`}>
                  <td className="form-name">{form.form}</td>
                  <td className="numeric">{form.overall?.expected || 0}</td>
                  <td className="numeric">{form.overall?.present || 0}</td>
                  <td className="numeric">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${percentage}%` }}
                      ></div>
                      <span className="progress-text">{percentage}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const DailyLogStatusPanel = ({ data }) => {
  return (
    <div className="panel">
      <h2>Panel 2: Daily Log Submission Status Breakdown</h2>
      <div className="daily-log-panels">
        {Object.entries(data).map(([key, logType]) => (
          <div key={key} className="log-type-card">
            <h3>{logType.log_type}</h3>
            <div className="status-grid">
              {Object.entries(logType.overall || {}).map(([status, count]) => (
                <div key={status} className={`status-badge status-${status}`}>
                  <div className="status-label">{status}</div>
                  <div className="status-count">{count}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const TimelinessPanel = ({ data }) => {
  return (
    <div className="panel">
      <h2>Panel 3: Data Entry Timeliness</h2>
      <p className="panel-description">Median days from clinical event to data entry</p>
      <div className="timeliness-table">
        <table>
          <thead>
            <tr>
              <th>Form</th>
              <th className="numeric">Median (days)</th>
              <th className="numeric">P25 (days)</th>
              <th className="numeric">P75 (days)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((metric, idx) => (
              <tr key={idx} className={metric.overall?.median_lag_days < 0 ? 'timeliness-alert' : ''}>
                <td>{metric.form}</td>
                <td className="numeric">
                  <strong>{metric.overall?.median_lag_days?.toFixed(1) || '—'}</strong>
                </td>
                <td className="numeric">{metric.overall?.p25?.toFixed(1) || '—'}</td>
                <td className="numeric">{metric.overall?.p75?.toFixed(1) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const GapsPanel = ({ gaps }) => {
  const [expandedGap, setExpandedGap] = useState(null);

  const gapTypes = {
    consented_no_form_b: {
      title: 'Consented but no Form B',
      color: '#e74c3c',
      icon: '⚠'
    },
    randomised_no_form_c: {
      title: 'Randomised but no Form C',
      color: '#e67e22',
      icon: '⚠'
    },
    randomised_no_form_j: {
      title: 'Randomised but no Form J',
      color: '#f39c12',
      icon: '⚠'
    },
    incomplete_daily_logs: {
      title: 'Incomplete Daily Logs (≥7 days)',
      color: '#f1c40f',
      icon: '⚠'
    }
  };

  return (
    <div className="panel">
      <h2>Panel 4: Cross-form Gaps (Action Required)</h2>
      <div className="gaps-accordion">
        {Object.entries(gaps).map(([gapType, records]) => {
          const gapInfo = gapTypes[gapType];
          const isExpanded = expandedGap === gapType;

          return (
            <div key={gapType} className="gap-card">
              <button
                className="gap-header"
                onClick={() => setExpandedGap(isExpanded ? null : gapType)}
                style={{ borderLeftColor: gapInfo.color }}
              >
                <span className="gap-icon">{gapInfo.icon}</span>
                <span className="gap-title">{gapInfo.title}</span>
                <span className="gap-count">{records.length} records</span>
                <span className="gap-toggle">{isExpanded ? '▼' : '▶'}</span>
              </button>

              {isExpanded && (
                <div className="gap-details">
                  {records.length === 0 ? (
                    <p className="no-gaps">✓ No gaps found</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Site</th>
                          <th>Date</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((record, idx) => (
                          <tr key={idx}>
                            <td className="identifier">{record.identifier}</td>
                            <td>{record.site}</td>
                            <td>{record.date ? new Date(record.date).toLocaleDateString() : '—'}</td>
                            <td className="details">{record.details || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SiteActivityPanel = ({ activity }) => {
  const getActivityColor = (status) => {
    switch (status) {
      case 'active':
        return '#27ae60';
      case 'inactive_14d':
        return '#f39c12';
      default:
        return '#e74c3c';
    }
  };

  const getActivityLabel = (status) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'inactive_14d':
        return 'Inactive (14d)';
      default:
        return 'Inactive (28d)';
    }
  };

  return (
    <div className="panel">
      <h2>Panel 5: Site Activity</h2>
      <div className="site-activity-grid">
        {activity.map((site, idx) => (
          <div
            key={idx}
            className="site-card"
            style={{ borderLeftColor: getActivityColor(site.status) }}
          >
            <div className="site-header">
              <h3>{site.site}</h3>
              <span
                className="activity-badge"
                style={{ backgroundColor: getActivityColor(site.status) }}
              >
                {getActivityLabel(site.status)}
              </span>
            </div>

            <div className="site-details">
              <div className="detail-row">
                <span className="detail-label">Last Entry:</span>
                <span className="detail-value">
                  {site.last_entry_at
                    ? new Date(site.last_entry_at).toLocaleDateString()
                    : 'Never'}
                </span>
              </div>

              <div className="weekly-counts">
                <span className="detail-label">Weekly Entries (last 4w):</span>
                <div className="week-bars">
                  {site.weekly_counts && Object.entries(site.weekly_counts)
                    .slice(-4)
                    .map(([week, count], widx) => {
                      const maxCount = 100; // Adjust as needed
                      const height = (count / maxCount) * 100;
                      return (
                        <div
                          key={widx}
                          className="week-bar"
                          style={{ height: `${Math.max(height, 5)}%` }}
                          title={`Week ${widx + 1}: ${count} entries`}
                        >
                          <span className="bar-label">{count}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const DataQuality = () => {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDataQuality();
  }, [token]);

  const fetchDataQuality = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/dashboard/data-quality`,
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
      setError(err.message || 'Failed to load data quality dashboard');
      console.error('Data quality fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="data-quality-container">
        <div className="loading">Loading data quality dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="data-quality-container">
        <div className="error">
          <strong>Error:</strong> {error}
          <button onClick={fetchDataQuality} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="data-quality-container">
        <div className="error">No data available</div>
      </div>
    );
  }

  return (
    <div className="data-quality-container">
      <div className="dq-header">
        <h1>Data Quality Indicators</h1>
        <p className="dq-timestamp">
          Generated: <strong>{new Date(data.generated_at).toLocaleString()}</strong>
        </p>
      </div>

      <FormCompletionPanel data={data.form_completion} sites={data.sites} />
      <DailyLogStatusPanel data={data.daily_log_status} />
      <TimelinessPanel data={data.timeliness} />
      <GapsPanel gaps={data.gaps} />
      <SiteActivityPanel activity={data.site_activity} />
    </div>
  );
};

export default DataQuality;
