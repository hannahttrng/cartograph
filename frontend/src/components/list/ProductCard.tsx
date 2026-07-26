import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../theme';
import type { Product } from '../../types/models';
import { AppCard } from '../common/AppCard';

export function ProductCard({ product }: { product: Product }) {
  return <AppCard style={styles.card}><View style={styles.copy}><Text style={styles.name}>{product.name}</Text><Text style={styles.detail}>{product.store.name} · {product.category}</Text></View><View><Text style={styles.price}>${product.price.toFixed(2)}</Text><Text style={styles.unit}>{product.unit}</Text></View></AppCard>;
}

const styles = StyleSheet.create({ card: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, copy: { flex: 1, marginRight: spacing.md }, name: typography.bodyStrong, detail: { ...typography.caption, marginTop: 2 }, price: { ...typography.bodyStrong, color: colors.primary, textAlign: 'right' }, unit: { ...typography.caption, textAlign: 'right' } });