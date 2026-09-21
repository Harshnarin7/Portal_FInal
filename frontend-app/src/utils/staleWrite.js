export const STALE_WRITE_MESSAGE =
  "Another nurse saved this day. Showing their latest version — add your answers again and save.";

export function isStaleWrite(err) {
  return err?.response?.status === 409;
}

export function expectedUpdatedAtConfig(updatedAt) {
  if (!updatedAt) return {};
  return { params: { expected_updated_at: updatedAt } };
}
