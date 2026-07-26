import type { DemoRouteSummary } from '../types/demo';

// TODO(ERIC): Replace with backend endpoint response from optimized route candidates.
// This file is intentionally not connected to RoutePreviewScreen while backend integration is active.
export const mockRoutes: DemoRouteSummary[] = [
  {
    id: 'demo-best-overall',
    title: 'Best Overall',
    storeCount: 3,
    distanceMiles: 2.5,
    estimatedMinutes: 24,
    estimatedSavings: 15,
    storeNames: ['Target', 'Trader Joe’s', 'Sprouts'],
  },
];