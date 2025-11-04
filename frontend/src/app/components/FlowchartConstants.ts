export const TIMELINE_EVENT_LIMIT_OPTIONS = [
  100, 250, 500, 1000, 2500, 5000, 10000, 20000,
];

export const FLOWCHAIN_TIME_WINDOW_OPTIONS = [
  { label: "6 hours", value: 6 * 60 * 60 * 1000 },
  { label: "24 hours", value: 24 * 60 * 60 * 1000 },
  { label: "3 days", value: 3 * 24 * 60 * 60 * 1000 },
  { label: "7 days", value: 7 * 24 * 60 * 60 * 1000 },
  { label: "14 days", value: 14 * 24 * 60 * 60 * 1000 },
  { label: "30 days", value: 30 * 24 * 60 * 60 * 1000 },
  { label: "90 days", value: 90 * 24 * 60 * 60 * 1000 },
  { label: "No limit", value: Number.POSITIVE_INFINITY },
];
