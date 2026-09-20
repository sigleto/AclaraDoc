import type { PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
export function Screen({ children }: PropsWithChildren) { return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView contentContainerStyle={styles.screen}><View style={styles.content}>{children}</View></ScrollView></SafeAreaView>; }
export function Title({ children }: PropsWithChildren) { return <Text accessibilityRole="header" style={styles.title}>{children}</Text>; }
export function Copy({ children }: PropsWithChildren) { return <Text style={styles.copy}>{children}</Text>; }
export function Card({ children }: PropsWithChildren) { return <View style={styles.card}>{children}</View>; }
export function Heading({ children }: PropsWithChildren) { return <Text accessibilityRole="header" style={styles.heading}>{children}</Text>; }
export function Action({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, (pressed || disabled) && { opacity: 0.5 }]}><Text style={[styles.buttonText, secondary && { color: '#14594E' }]}>{title}</Text></Pressable>;
}
export function Notice() { return <View style={styles.notice}><Text style={styles.noticeText}>Aplicación no oficial · Modo demostración. El análisis es ficticio y debe comprobarse con el organismo emisor. No sustituye asesoramiento profesional.</Text></View>; }
export function ErrorMessage({ message }: { message: string | null }) { return message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null; }
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F6F2' }, screen: { padding: 20, paddingBottom: 40 }, content: { width: '100%', maxWidth: 680, alignSelf: 'center', gap: 16 },
  title: { fontSize: 32, fontWeight: '700', color: '#173E37', letterSpacing: -0.8 }, heading: { fontSize: 20, fontWeight: '600', color: '#173E37' },
  copy: { fontSize: 16, lineHeight: 25, color: '#40534E' }, card: { padding: 20, gap: 12, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE5DE' },
  button: { padding: 16, minHeight: 52, borderRadius: 14, backgroundColor: '#14594E', alignItems: 'center', justifyContent: 'center' }, secondary: { backgroundColor: '#E4EDE5' }, buttonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  notice: { padding: 16, borderRadius: 14, backgroundColor: '#FFF0CE' }, noticeText: { color: '#684C10', fontSize: 14, lineHeight: 21 }, error: { color: '#A12626', fontSize: 15, lineHeight: 22 },
});
