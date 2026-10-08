/** Local filter for the Gestation log. GET /ga-check/ already returns the full list. */
export function collapseSearchSpaces(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function gaCheckMatchesQuery(entry, query) {
  const q = collapseSearchSpaces(query);
  if (!q) return true;
  const name = collapseSearchSpaces(entry?.mother_name);
  const id = String(entry?.mother_uid || "").trim().toLowerCase();
  const idQuery = q.replace(/ /g, "");
  return name.includes(q) || (idQuery && id.includes(idQuery));
}

export function filterGaChecks(entries, query) {
  const list = entries || [];
  if (!collapseSearchSpaces(query)) return list;
  return list.filter((e) => gaCheckMatchesQuery(e, query));
}
