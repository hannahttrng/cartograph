import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 20,
  },
  heading: {
    color: '#1F2933',
    fontSize: 24,
    fontWeight: '600',
  },
  supportingText: {
    color: '#52606D',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 4,
  },
  label: {
    color: '#334E68',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 22,
  },
  input: {
    borderColor: '#9AA5B1',
    borderRadius: 8,
    borderWidth: 1,
    color: '#1F2933',
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  itemInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  itemNameInput: {
    flex: 1,
  },
  priceInput: {
    width: 92,
  },
  button: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  addButton: {
    backgroundColor: '#334E68',
    marginTop: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  feedbackText: {
    color: '#B42318',
    fontSize: 14,
    marginTop: 8,
  },
  itemList: {
    gap: 8,
    marginTop: 12,
  },
  itemRow: {
    alignItems: 'center',
    borderBottomColor: '#D9E2EC',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 52,
    paddingVertical: 8,
  },
  itemName: {
    color: '#1F2933',
    flex: 1,
    fontSize: 16,
  },
  itemPrice: {
    color: '#52606D',
    fontSize: 15,
    marginHorizontal: 12,
  },
  removeText: {
    color: '#9B2C2C',
    fontSize: 14,
    fontWeight: '600',
  },
  collectionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  collectionButton: {
    borderColor: '#9AA5B1',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  collectionButtonSelected: {
    backgroundColor: '#334E68',
    borderColor: '#334E68',
  },
  collectionText: {
    color: '#334E68',
    fontSize: 14,
    fontWeight: '500',
  },
  collectionTextSelected: {
    color: '#FFFFFF',
  },
  collectionInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  collectionInput: {
    flex: 1,
  },
  createButton: {
    backgroundColor: '#D9E2EC',
  },
  createButtonText: {
    color: '#243B53',
    fontSize: 15,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#243B53',
    marginTop: 24,
  },
});