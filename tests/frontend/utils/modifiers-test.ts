import {
  routeModifierBadges,
  sortModifiersForDisplay,
} from '../../../frontend/src/utils/modifiers';

test('prioritizes sale and season before alphabetical modifiers', () => {
  expect(sortModifiersForDisplay([
    'organic',
    'brand: horizon',
    'in season',
    'on sale',
    'organic',
  ])).toEqual([
    'on sale',
    'in season',
    'brand: horizon',
    'organic',
  ]);
});

test('shows special Product attributes and fulfilled requests only', () => {
  expect(routeModifierBadges(
    ['brand: horizon', 'in season', 'on sale', 'organic'],
    ['grass fed', 'organic'],
  )).toEqual(['on sale', 'in season', 'organic']);
});
