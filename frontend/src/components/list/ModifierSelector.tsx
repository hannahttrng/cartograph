import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import ExpandIcon from '../../../assets/svg icons/keyboard_arrow_up.svg';
import { colors, radius, spacing, typography } from '../../theme';
import { sortModifiersForDisplay } from '../../utils/modifiers';
import { formatTagLabel } from '../../utils/tags';
import { DesignIcon } from '../common';

interface ModifierSelectorProps {
  disabled?: boolean;
  error: string | null;
  isExpanded: boolean;
  isLoading: boolean;
  itemTag: string;
  onRetry: () => void;
  onToggle: () => void;
  onToggleModifier: (modifier: string) => void;
  options: readonly string[];
  selected: readonly string[];
}

const ModifierOption = ({
  disabled,
  itemTag,
  modifier,
  onToggle,
  selected,
}: {
  disabled: boolean;
  itemTag: string;
  modifier: string;
  onToggle: () => void;
  selected: boolean;
}) => (
  <Pressable
    accessibilityLabel={`${formatTagLabel(modifier)} modifier for ${formatTagLabel(itemTag)}`}
    accessibilityRole="checkbox"
    accessibilityState={{ checked: selected, disabled }}
    disabled={disabled}
    onPress={onToggle}
    style={({ pressed }) => [
      styles.option,
      selected && styles.optionSelected,
      pressed && styles.pressed,
      disabled && styles.disabled,
    ]}
  >
    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
      {formatTagLabel(modifier)}
    </Text>
  </Pressable>
);

export function ModifierSelector({
  disabled = false,
  error,
  isExpanded,
  isLoading,
  itemTag,
  onRetry,
  onToggle,
  onToggleModifier,
  options,
  selected,
}: ModifierSelectorProps) {
  const [query, setQuery] = useState('');
  const orderedOptions = useMemo(
    () => sortModifiersForDisplay(options),
    [options],
  );
  const unavailableSelections = useMemo(() => {
    const optionSet = new Set(options);
    return sortModifiersForDisplay(
      selected.filter((modifier) => !optionSet.has(modifier)),
    );
  }, [options, selected]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = normalizedQuery
    ? orderedOptions.filter((modifier) => modifier.includes(normalizedQuery))
    : orderedOptions.slice(0, 4);

  useEffect(() => {
    if (!isExpanded) setQuery('');
  }, [isExpanded]);

  const selectionSummary = selected.length === 0
    ? 'None selected'
    : sortModifiersForDisplay(selected).map(formatTagLabel).join(', ');
  const itemLabel = formatTagLabel(itemTag);

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityLabel={`Modifiers for ${itemLabel}: ${selectionSummary}`}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: isExpanded }}
        disabled={disabled}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.disclosure,
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        <Text style={styles.disclosureLabel}>Modifiers</Text>
        <Text numberOfLines={1} style={styles.selectionSummary}>
          {selectionSummary}
        </Text>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.expandIcon, !isExpanded && styles.expandIconCollapsed]}
        >
          <ExpandIcon height={18} width={18} />
        </View>
      </Pressable>

      {isExpanded ? (
        <View style={styles.panel}>
          {isLoading ? (
            <View style={styles.statusRow}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text accessibilityLiveRegion="polite" style={styles.statusText}>
                Loading modifiers...
              </Text>
            </View>
          ) : error ? (
            <View style={styles.statusRow}>
              <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
                {error}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={disabled}
                onPress={onRetry}
                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
              >
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.searchRow}>
                <DesignIcon name="search" size={16} />
                <TextInput
                  accessibilityLabel={`Search ${itemLabel} modifiers`}
                  editable={!disabled}
                  onChangeText={setQuery}
                  placeholder="Search modifiers"
                  placeholderTextColor={colors.textMuted}
                  style={styles.searchInput}
                  value={query}
                />
              </View>

              {visibleOptions.length > 0 ? (
                <View accessibilityLabel="Modifier options" style={styles.options}>
                  {visibleOptions.map((modifier) => (
                    <ModifierOption
                      disabled={disabled}
                      itemTag={itemTag}
                      key={modifier}
                      modifier={modifier}
                      onToggle={() => onToggleModifier(modifier)}
                      selected={selected.includes(modifier)}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>
                  {orderedOptions.length === 0
                    ? 'No modifiers are available for this item.'
                    : 'No modifiers match your search.'}
                </Text>
              )}

              {unavailableSelections.length > 0 ? (
                <View style={styles.unavailable}>
                  <Text style={styles.unavailableLabel}>Unavailable selections</Text>
                  <View style={styles.options}>
                    {unavailableSelections.map((modifier) => (
                      <ModifierOption
                        disabled={disabled}
                        itemTag={itemTag}
                        key={modifier}
                        modifier={modifier}
                        onToggle={() => onToggleModifier(modifier)}
                        selected
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomColor: '#E3E1E2',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  disclosure: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 36,
    paddingHorizontal: 13,
  },
  disclosureLabel: {
    ...typography.caption,
    color: colors.primary,
  },
  selectionSummary: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
    fontFamily: 'Monda_400Regular',
    marginLeft: spacing.xs,
  },
  expandIcon: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  expandIconCollapsed: {
    transform: [{ rotate: '180deg' }],
  },
  panel: {
    backgroundColor: colors.backgroundMuted,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: spacing.sm,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 44,
  },
  statusText: {
    ...typography.caption,
    marginLeft: spacing.xs,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    flex: 1,
  },
  retryButton: {
    alignItems: 'center',
    borderColor: colors.primary,
    borderRadius: radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.sm,
  },
  retryText: {
    ...typography.caption,
    color: colors.primary,
  },
  searchRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontFamily: 'Monda_400Regular',
    fontSize: 12,
    marginLeft: spacing.xs,
    minHeight: 42,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  option: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  optionSelected: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  optionText: {
    ...typography.caption,
    color: colors.text,
  },
  optionTextSelected: {
    color: colors.primary,
  },
  emptyText: {
    ...typography.caption,
    fontFamily: 'Monda_400Regular',
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
  unavailable: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  unavailableLabel: {
    ...typography.caption,
    color: colors.warning,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.45,
  },
});