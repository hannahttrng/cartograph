import type { Product, Route, Store } from '../types/models';

export interface SeededRoute {
  id: string;
  route: Route;
}

const storesByFixtureId: Record<1 | 2, Store> = {
  1: {
    name: 'Cartograph Market',
    address: '100 Main Street, Redlands, CA',
    latitude: 34.056,
    longitude: -117.195,
  },
  2: {
    name: 'Fresh Fields',
    address: '220 Citrus Avenue, Redlands, CA',
    latitude: 34.0612,
    longitude: -117.1884,
  },
};

const productsByFixtureId: Record<10 | 20 | 30 | 40, Product> = {
  10: {
    name: 'Milk One',
    type: 'Milk',
    category: 'Dairy',
    store: storesByFixtureId[1],
    price: 3,
    unit: 'each',
  },
  20: {
    name: 'Milk Two',
    type: 'Milk',
    category: 'Dairy',
    store: storesByFixtureId[2],
    price: 2,
    unit: 'each',
  },
  30: {
    name: 'Bread One',
    type: 'Bread',
    category: 'Bakery',
    store: storesByFixtureId[1],
    price: 4,
    unit: 'each',
  },
  40: {
    name: 'Bread Two',
    type: 'Bread',
    category: 'Bakery',
    store: storesByFixtureId[2],
    price: 5,
    unit: 'each',
  },
};

export const routeOptimizerFixture: readonly SeededRoute[] = [
  {
    id: 'optimizer-route-1',
    route: {
      stores: [storesByFixtureId[1]],
      products: [productsByFixtureId[30], productsByFixtureId[10]],
      distance: 2.5,
      time: 7,
      score: 13.583333,
    },
  },
  {
    id: 'optimizer-route-2',
    route: {
      stores: [storesByFixtureId[2]],
      products: [productsByFixtureId[40], productsByFixtureId[20]],
      distance: 4.5,
      time: 11,
      score: 16.316667,
    },
  },
  {
    id: 'optimizer-route-3',
    route: {
      stores: [storesByFixtureId[1], storesByFixtureId[2]],
      products: [productsByFixtureId[30], productsByFixtureId[20]],
      distance: 4.25,
      time: 11,
      score: 17.641667,
    },
  },
];