const modifierPriority = (modifier: string): number => {
  if (modifier === 'on sale') return 0;
  if (modifier === 'in season') return 1;
  return 2;
};

const compareText = (first: string, second: string): number =>
  first < second ? -1 : first > second ? 1 : 0;

export const sortModifiersForDisplay = (
  modifiers: readonly string[],
): readonly string[] =>
  [...new Set(modifiers)].sort(
    (first, second) =>
      modifierPriority(first) - modifierPriority(second) ||
      compareText(first, second),
  );

export const routeModifierBadges = (
  productModifiers: readonly string[],
  requestedModifiers: readonly string[],
): readonly string[] => {
  const productModifierSet = new Set(productModifiers);
  return sortModifiersForDisplay([
    ...productModifiers.filter(
      (modifier) => modifier === 'on sale' || modifier === 'in season',
    ),
    ...requestedModifiers.filter((modifier) => productModifierSet.has(modifier)),
  ]);
};