import { StyleSheet, Text, View } from 'react-native';

import { colors, fontFamily } from '../../theme';

interface GreetingHeaderProps {
  displayName: string;
}

export function GreetingHeader({ displayName }: GreetingHeaderProps) {
  return (
    <View>
      <Text style={styles.greeting}>Hi, {displayName}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  greeting: { color: colors.textInverse, fontFamily: fontFamily.bold, fontSize: 17, lineHeight: 23 },
});