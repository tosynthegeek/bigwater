export const ONE_MINUTE = 60 * 1000;

export function startOfDayUtc(date: Date) {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}
