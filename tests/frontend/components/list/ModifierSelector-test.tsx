import { fireEvent, render, screen } from '@testing-library/react-native';

import { ModifierSelector } from '../../../../frontend/src/components/list/ModifierSelector';

const options = [
  'brand: horizon',
  'grass fed',
  'in season',
  'local',
  'on sale',
  'organic',
];

const baseProps = {
  error: null,
  isExpanded: true,
  isLoading: false,
  itemTag: 'milk',
  onRetry: jest.fn(),
  onToggle: jest.fn(),
  onToggleModifier: jest.fn(),
  options,
  selected: ['organic'],
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('shows four prioritized suggestions with checked accessibility state', async () => {
  await render(<ModifierSelector {...baseProps} />);

  expect(screen.getByLabelText('On Sale modifier for Milk')).toBeOnTheScreen();
  expect(screen.getByLabelText('In Season modifier for Milk')).toBeOnTheScreen();
  expect(screen.getByLabelText('Brand: Horizon modifier for Milk')).toBeOnTheScreen();
  expect(screen.getByLabelText('Grass Fed modifier for Milk')).toBeOnTheScreen();
  expect(screen.queryByLabelText('Local modifier for Milk')).not.toBeOnTheScreen();
  expect(screen.getByLabelText('Modifiers for Milk: Organic').props.accessibilityState)
    .toEqual({ disabled: false, expanded: true });

  await fireEvent.changeText(screen.getByLabelText('Search Milk modifiers'), 'o');

  expect(screen.getByLabelText('Local modifier for Milk')).toBeOnTheScreen();
  expect(screen.getByLabelText('Organic modifier for Milk').props.accessibilityState)
    .toEqual({ checked: true, disabled: false });
});

test('dispatches modifier and disclosure toggles', async () => {
  await render(<ModifierSelector {...baseProps} />);

  await fireEvent.press(screen.getByLabelText('On Sale modifier for Milk'));
  await fireEvent.press(screen.getByLabelText('Modifiers for Milk: Organic'));

  expect(baseProps.onToggleModifier).toHaveBeenCalledWith('on sale');
  expect(baseProps.onToggle).toHaveBeenCalledTimes(1);
});

test('keeps unavailable saved modifiers visible and removable', async () => {
  await render(
    <ModifierSelector
      {...baseProps}
      options={['organic']}
      selected={['legacy choice', 'organic']}
    />,
  );

  expect(screen.getByText('Unavailable selections')).toBeOnTheScreen();
  const unavailable = screen.getByLabelText('Legacy Choice modifier for Milk');
  expect(unavailable.props.accessibilityState).toEqual({
    checked: true,
    disabled: false,
  });

  await fireEvent.press(unavailable);
  expect(baseProps.onToggleModifier).toHaveBeenCalledWith('legacy choice');
});

test('renders retry and empty search states', async () => {
  const { rerender } = await render(
    <ModifierSelector {...baseProps} error="Modifier options unavailable." />,
  );

  expect(screen.getByText('Modifier options unavailable.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Retry'));
  expect(baseProps.onRetry).toHaveBeenCalledTimes(1);

  await rerender(<ModifierSelector {...baseProps} options={[]} selected={[]} />);
  expect(screen.getByText('No modifiers are available for this item.')).toBeOnTheScreen();
});