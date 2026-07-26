import type { DemoUser } from '../types/demo';

// TODO(ERIC): Replace with backend endpoint response from the authenticated profile and location source.
export const mockUser: DemoUser = {
  id: 'demo-user',
  name: 'Carter',
  location: {
    latitude: 34.0556,
    longitude: -117.1825,
    label: 'Redlands, CA',
  },
};