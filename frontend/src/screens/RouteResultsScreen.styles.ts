import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  centeredState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    color: '#1F2933',
    fontSize: 24,
    fontWeight: '600',
  },
  subtitle: {
    color: '#52606D',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
  routeModes: {
    marginBottom: 14,
    marginTop: 16,
  },
  routeCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D9E2EC',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  routeCardSelected: {
    borderColor: '#147C36',
    borderWidth: 2,
  },
  routeCardPressed: {
    backgroundColor: '#F0F4F8',
  },
  routeCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  routeLabel: {
    color: '#243B53',
    fontSize: 17,
    fontWeight: '600',
  },
  score: {
    color: '#147C36',
    fontSize: 14,
    fontWeight: '600',
  },
  metrics: {
    flexDirection: 'row',
    marginTop: 16,
  },
  metric: {
    flex: 1,
  },
  metricValue: {
    color: '#1F2933',
    fontSize: 15,
    fontWeight: '600',
  },
  metricLabel: {
    color: '#7B8794',
    fontSize: 12,
    marginTop: 3,
  },
  routeStores: {
    color: '#52606D',
    fontSize: 14,
    marginTop: 16,
  },
  detailsSection: {
    borderTopColor: '#D9E2EC',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 24,
  },
  sectionTitle: {
    color: '#1F2933',
    fontSize: 20,
    fontWeight: '600',
  },
  detailHeading: {
    color: '#334E68',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 20,
  },
  storeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 12,
  },
  storeNumber: {
    alignItems: 'center',
    backgroundColor: '#E6F6F4',
    borderRadius: 14,
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '600',
    height: 28,
    justifyContent: 'center',
    overflow: 'hidden',
    textAlign: 'center',
    textAlignVertical: 'center',
    width: 28,
  },
  storeText: {
    flex: 1,
    marginLeft: 12,
  },
  storeName: {
    color: '#1F2933',
    fontSize: 16,
    fontWeight: '500',
  },
  storeAddress: {
    color: '#7B8794',
    fontSize: 13,
    marginTop: 2,
  },
  productGroup: {
    marginTop: 12,
  },
  productStore: {
    color: '#52606D',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  productRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  productName: {
    color: '#1F2933',
    flex: 1,
    fontSize: 15,
    marginRight: 16,
  },
  productPrice: {
    color: '#52606D',
    fontSize: 14,
  },
  requestedItem: {
    color: '#1F2933',
    fontSize: 15,
    marginTop: 8,
  },
  mapButton: {
    alignItems: 'center',
    backgroundColor: '#147C36',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  mapButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  stateTitle: {
    color: '#1F2933',
    fontSize: 20,
    fontWeight: '600',
  },
  stateText: {
    color: '#52606D',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: '#243B53',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 48,
    paddingHorizontal: 20,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
