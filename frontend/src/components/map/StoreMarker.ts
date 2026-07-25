import type { Store } from '../../types/models';
import type { StoreMarker as StoreMarkerModel } from '../../types/maps';

const markerId = (store: Store, sequence: number): string =>
  `${sequence}-${store.name}-${store.latitude}-${store.longitude}`;

export const toStoreMarker = (store: Store, sequence: number): StoreMarkerModel => ({
  ...store,
  id: markerId(store, sequence),
  sequence,
  coordinate: {
    latitude: store.latitude,
    longitude: store.longitude,
  },
});