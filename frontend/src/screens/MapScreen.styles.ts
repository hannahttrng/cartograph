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
  status: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 24,
  },
  statusText: {
    color: '#52606D',
    fontSize: 14,
    marginLeft: 10,
  },
  errorState: {
    marginTop: 12,
  },
  errorText: {
    color: '#B42318',
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: '#243B53',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 40,
    paddingHorizontal: 14,
  },
  retryButtonText: {
    color: '#243B53',
    fontSize: 14,
    fontWeight: '600',
  },
});