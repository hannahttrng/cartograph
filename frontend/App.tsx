import { NavigationContainer } from '@react-navigation/native';
import { Monda_400Regular, Monda_700Bold, useFonts } from '@expo-google-fonts/monda';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from './src/navigation';

export default function App() {
  const [fontsLoaded] = useFonts({ Monda_400Regular, Monda_700Bold });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
