export interface Store {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface Product {
  name: string;
  type: string;
  category: string;
  store: Store;
  price: number;
  unit: string;
}

export interface Route {
  stores: Store[];
  products: Product[];
  distance: number;
  time: number;
  score: number;
}