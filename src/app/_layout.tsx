import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from '../state/AppProvider';
export default function RootLayout() {
  return <AppProvider><StatusBar style="dark" /><Stack screenOptions={{ headerStyle: { backgroundColor: '#F3F6F2' }, headerTintColor: '#173E37', headerShadowVisible: false }}>
    <Stack.Screen name="index" options={{ title: 'AclaraDoc' }} />
    <Stack.Screen name="revision" options={{ title: 'Revisión del documento' }} />
    <Stack.Screen name="resultado" options={{ title: 'Resultado del análisis' }} />
    <Stack.Screen name="historial" options={{ title: 'Historial' }} />
    <Stack.Screen name="privacidad" options={{ title: 'Información y privacidad' }} />
  </Stack></AppProvider>;
}
