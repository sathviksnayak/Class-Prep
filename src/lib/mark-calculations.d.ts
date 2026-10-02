export type AttemptedMarkGroup = { attempt: number; marksEach: number };
export function cleanMark(value: number): number;
export function calculateAttemptedMarks(groups: readonly AttemptedMarkGroup[]): number;
export function formatMark(value: number): string;
export function marksEqual(a: number, b: number): boolean;
