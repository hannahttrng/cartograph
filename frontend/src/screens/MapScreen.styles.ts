import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  status: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: '#F4F7F4',
    justifyContent: 'center',
  },
  statusText: {
    color: '#52606D',
    fontSize: 14,
    marginTop: 10,
  },
  errorState: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D9E2EC',
    borderRadius: 8,
    borderWidth: 1,
    bottom: 16,
    flexDirection: 'row',
    left: 16,
    padding: 12,
    position: 'absolute',
    right: 16,
  },
  errorText: {
    color: '#B42318',
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    alignItems: 'center',
    borderColor: '#243B53',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    marginLeft: 12,
    minHeight: 40,
    paddingHorizontal: 14,
  },
  retryButtonText: {
    color: '#243B53',
    fontSize: 14,
    fontWeight: '600',
  },
});