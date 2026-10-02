const SCALE = 1_000_000;

export function cleanMark(value) {
  const rounded = Math.round(value * SCALE) / SCALE;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function calculateAttemptedMarks(groups) {
  return cleanMark(groups.reduce((sum, group) => sum + group.attempt * group.marksEach, 0));
}

export function formatMark(value) {
  return cleanMark(value).toLocaleString("en-US", { maximumFractionDigits: 6, useGrouping: false });
}

export function marksEqual(a, b) {
  return Math.abs(cleanMark(a - b)) < 1 / SCALE;
}
