export type ChartSortOrder = 'oldest' | 'newest';

export function sortByMonth<T extends { month: string }>(rows: T[], order: ChartSortOrder) {
  return [...rows].sort((a, b) => (
    order === 'oldest'
      ? a.month.localeCompare(b.month)
      : b.month.localeCompare(a.month)
  ));
}

export function sortByDate<T extends { date: string }>(rows: T[], order: ChartSortOrder) {
  return [...rows].sort((a, b) => (
    order === 'oldest'
      ? a.date.localeCompare(b.date)
      : b.date.localeCompare(a.date)
  ));
}
