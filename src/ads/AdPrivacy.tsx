import { useEffect, useRef, useState } from 'react';
import { Action, Card, Copy, Heading } from '../components/ui';
import { useAds } from './AdsProvider';

export function AdPrivacy() {
  const ads = useAds();
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function open() {
    const success = await ads.controller.openPrivacy();
    if (mounted.current) setMessage(success ? 'Preferencias publicitarias actualizadas.' : 'No se pudieron abrir las opciones. Puedes seguir usando AclaraDoc e intentarlo más tarde.');
  }
  return <Card>
    <Heading>Privacidad de los anuncios</Heading>
    <Copy>En Android usamos Google AdMob para mostrar publicidad. Su SDK puede recoger y compartir identificadores del dispositivo (incluido el identificador publicitario), dirección IP y ubicación aproximada derivada, interacciones con anuncios y datos de diagnóstico, con fines publicitarios, de medición y prevención del fraude.</Copy>
    <Copy>Solicitamos anuncios no personalizados solo cuando Google UMP permite hacerlo. En el EEE, Reino Unido y Suiza, UMP gestiona los formularios que correspondan. Puedes cambiar tus opciones con el botón inferior cuando Google indique que están disponibles. Rechazar o no poder obtener el consentimiento no impide analizar documentos.</Copy>
    <Copy>No enviamos a AdMob documentos, imágenes, PDF, nombres de archivo, resultados, fechas ni datos de Gemini. No usamos su contenido para publicidad ni asociamos el identificador publicitario con el identificador de cuotas. El consentimiento publicitario es independiente del consentimiento para enviar documentos.</Copy>
    <Copy>Guardamos localmente un contador de análisis completados (hasta tres) y la fecha del último intento de intersticial para limitar su frecuencia, sin documentos ni identificadores.</Copy>
    {ads.privacyRequired ? <Action title="Privacidad de los anuncios" secondary disabled={ads.resolving} onPress={() => void open()} /> :
      <Copy>Google no indica opciones publicitarias disponibles en este momento. En web, iOS y Expo Go no se muestran anuncios.</Copy>}
    {message && <Copy>{message}</Copy>}
  </Card>;
}
