import React from "react";
import { SITE_ORDER, siteDisplayName } from "../../utils/siteNames";

/**
 * Cross-site dashboard filter — only shown for global users (superadmin / global_scientist).
 * value="" means all sites (omit API `site` query param).
 */
export default function GlobalSiteFilter({
  value = "",
  onChange,
  sites,
  className = "global-site-filter",
}) {
  const options = sites?.length ? sites : SITE_ORDER;
  return (
    <label className={className}>
      <span className="global-site-filter__label">Site</span>
      <select
        className="global-site-filter__select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filter by site"
      >
        <option value="">All sites</option>
        {options.map((code) => (
          <option key={code} value={code}>
            {siteDisplayName(code)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Build axios params: omit `site` when showing all sites. */
export function siteQueryParams(apiSite) {
  return apiSite ? { site: apiSite } : {};
}
