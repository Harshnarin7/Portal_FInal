import React, { useEffect, useRef, useState } from "react";
import { SITE_ORDER } from "../../utils/siteNames";
import { formatSiteName } from "./siteLabels";

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
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const current = value ? formatSiteName(value) : "All sites";

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const choose = (next) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className={className} ref={rootRef}>
      <span className="global-site-filter__label">Site</span>
      <button
        type="button"
        className="global-site-filter__select"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        {current}
      </button>
      {open && (
        <ul className="global-site-filter__menu" role="listbox" aria-label="Filter by site">
          <li>
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              className={value === "" ? "is-active" : ""}
              onClick={() => choose("")}
            >
              All sites
            </button>
          </li>
          {options.map((code) => (
            <li key={code}>
              <button
                type="button"
                role="option"
                aria-selected={code === value}
                className={code === value ? "is-active" : ""}
                onClick={() => choose(code)}
              >
                {formatSiteName(code)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Build axios params: omit `site` when showing all sites. */
export function siteQueryParams(apiSite) {
  return apiSite ? { site: apiSite } : {};
}
