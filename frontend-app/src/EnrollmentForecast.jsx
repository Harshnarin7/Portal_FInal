// EnrollmentForecast.jsx — Section 6: Enrollment Trend & Forecast
import React, { useEffect, useState, useMemo } from "react";
import api from "./api/axios";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";
import "./EnrollmentForecast.css";

const DEFAULT_TARGET = 700;
const DEFAULT_START  = "2026-08-15";
const DEFAULT_END    = "2028-07-15";

function daysBetween(a, b) {
  return (new Date(b) - new Date(a)) / 86400000;
}

function addMonths(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function fmtMonthYear(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function fmtFull(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function EnrollmentForecast() {
  const [rawData, setRawData]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [targetN, setTargetN]   = useState(DEFAULT_TARGET);
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate]   = useState(DEFAULT_END);

  useEffect(() => {
    api.get("/dashboard/enrollment-trend")
      .then(res => { setRawData(res.data); setLoading(false); })
      .catch(err => { setError(err.response?.data?.detail || "Failed to load"); setLoading(false); });
  }, []);

  // Build chart dataset
  const chartData = useMemo(() => {
    if (!rawData) return [];

    const today = new Date().toISOString().slice(0, 10);
    const totalDays = daysBetween(startDate, endDate);

    // Cumulative map from DB
    const actualMap = {};
    for (const row of rawData.by_date) actualMap[row.date] = row.cumulative;

    // Collect all meaningful dates: monthly ticks + actual enrollment dates + today + start + end
    const dateSet = new Set();
    dateSet.add(startDate);
    dateSet.add(today);
    for (const row of rawData.by_date) dateSet.add(row.date);

    // Monthly ticks between start and end
    let m = 0;
    let tick = startDate;
    while (tick <= endDate) {
      dateSet.add(tick);
      m++;
      tick = addMonths(startDate, m);
    }
    dateSet.add(endDate);

    const sorted = [...dateSet].sort();
    let lastActual = 0;
    const points = [];

    for (const date of sorted) {
      if (actualMap[date] !== undefined) lastActual = actualMap[date];

      const daysFromStart = daysBetween(startDate, date);
      const ideal = date < startDate
        ? null
        : Math.round(Math.max(0, Math.min(targetN, (targetN * daysFromStart) / totalDays)));

      points.push({
        date,
        ideal,
        actual: date <= today ? lastActual : null,
      });
    }

    return points;
  }, [rawData, targetN, startDate, endDate]);

  // Summary statistics
  const stats = useMemo(() => {
    if (!rawData || !rawData.by_date.length) return null;

    const today = new Date().toISOString().slice(0, 10);
    const current = rawData.total_randomised;
    const firstDate = rawData.by_date[0].date;

    const daysElapsed  = Math.max(1, daysBetween(firstDate, today));
    const dailyRate    = current / daysElapsed;
    const monthlyRate  = dailyRate * 30.44;

    // Projected completion at current rate
    const daysToTarget = dailyRate > 0 ? (targetN - current) / dailyRate : Infinity;
    const projectedDate = isFinite(daysToTarget)
      ? new Date(new Date(today + "T00:00:00").getTime() + daysToTarget * 86400000)
          .toISOString().slice(0, 10)
      : null;

    // Ideal count today
    const totalDays    = Math.max(1, daysBetween(startDate, endDate));
    const daysFromStart = Math.max(0, daysBetween(startDate, today));
    const idealToday   = Math.round((targetN * daysFromStart) / totalDays);
    const deficit      = idealToday - current;

    // Required monthly rate to hit target by endDate
    const daysRemaining      = Math.max(1, daysBetween(today, endDate));
    const requiredMonthlyRate = ((targetN - current) / daysRemaining) * 30.44;

    const pctComplete = ((current / targetN) * 100).toFixed(1);

    return {
      current, targetN, pctComplete,
      monthlyRate: monthlyRate.toFixed(1),
      requiredMonthlyRate: requiredMonthlyRate.toFixed(1),
      projectedDate,
      idealToday, deficit,
    };
  }, [rawData, targetN, startDate, endDate]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="ef-tooltip">
        <div className="ef-tooltip-date">{fmtFull(label)}</div>
        {payload.map(p => p.value != null && (
          <div key={p.dataKey} style={{ color: p.color }}>
            {p.name}: <strong>{p.value}</strong>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return <div className="ef-state">Loading enrollment data…</div>;
  if (error)   return <div className="ef-state ef-error">{error}</div>;
  if (!rawData) return null;

  return (
    <div className="ef-root">
      {/* Controls */}
      <div className="ef-controls">
        <label className="ef-control">
          <span>Target N</span>
          <input type="number" value={targetN} min={1}
            onChange={e => setTargetN(Number(e.target.value))} />
        </label>
        <label className="ef-control">
          <span>Trial Start</span>
          <input type="date" value={startDate}
            onChange={e => setStartDate(e.target.value)} />
        </label>
        <label className="ef-control">
          <span>Target End</span>
          <input type="date" value={endDate}
            onChange={e => setEndDate(e.target.value)} />
        </label>
      </div>

      {/* Summary stats */}
      {stats && (
        <div className="ef-stats">
          <div className="ef-stat">
            <div className="ef-stat-label">Enrolled</div>
            <div className="ef-stat-value">{stats.current} / {stats.targetN}</div>
            <div className="ef-stat-sub">{stats.pctComplete}% complete</div>
          </div>
          <div className="ef-stat">
            <div className="ef-stat-label">Current rate</div>
            <div className="ef-stat-value">{stats.monthlyRate}</div>
            <div className="ef-stat-sub">per month</div>
          </div>
          <div className="ef-stat">
            <div className="ef-stat-label">Required rate</div>
            <div className="ef-stat-value">{stats.requiredMonthlyRate}</div>
            <div className="ef-stat-sub">per month to finish on time</div>
          </div>
          <div className={`ef-stat ${stats.deficit > 0 ? "ef-behind" : "ef-ahead"}`}>
            <div className="ef-stat-label">vs ideal today</div>
            <div className="ef-stat-value">
              {stats.deficit > 0
                ? `${stats.deficit} behind`
                : stats.deficit < 0
                  ? `${Math.abs(stats.deficit)} ahead`
                  : "On track"}
            </div>
            <div className="ef-stat-sub">ideal = {stats.idealToday}</div>
          </div>
          <div className="ef-stat ef-projected">
            <div className="ef-stat-label">Projected completion</div>
            <div className="ef-stat-value">{fmtFull(stats.projectedDate)}</div>
            <div className="ef-stat-sub">at current rate</div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="ef-chart-wrap">
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData} margin={{ top: 16, right: 48, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tickFormatter={fmtMonthYear}
              tick={{ fill: "#64748b", fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={60}
            />
            <YAxis
              domain={[0, targetN + Math.ceil(targetN * 0.05)]}
              tick={{ fill: "#64748b", fontSize: 11 }}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ color: "#4a5568", fontSize: 12, paddingTop: 8 }}
            />
            <ReferenceLine
              y={targetN}
              stroke="#b45309"
              strokeDasharray="5 3"
              label={{ value: `N = ${targetN}`, fill: "#b45309", fontSize: 11, position: "right" }}
            />
            <Line
              dataKey="ideal"
              name="Ideal trajectory"
              stroke="#94a3b8"
              strokeDasharray="8 4"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              dataKey="actual"
              name="Actual enrolment"
              stroke="#0e7c7b"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#0e7c7b", strokeWidth: 0 }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="ef-timestamp">
        Data as of {new Date(rawData.generated_at).toLocaleString()}
      </div>
    </div>
  );
}
