import { formatTagLabel } from '../../../frontend/src/utils/tags';

test('title-cases normalized Tags and modifiers for display', () => {
  expect(formatTagLabel('milk')).toBe('Milk');
  expect(formatTagLabel('ground beef')).toBe('Ground Beef');
  expect(formatTagLabel('brand: horizon')).toBe('Brand: Horizon');
  expect(formatTagLabel('ground beef 80/20')).toBe('Ground Beef 80/20');
});