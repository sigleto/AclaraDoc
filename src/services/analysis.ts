import type { AnalysisResult, SelectedDocument } from '../types/document';

export async function analyzeDocument(document: SelectedDocument): Promise<AnalysisResult> {
  if (!document.pages.length) throw new Error('Añade al menos una imagen o un PDF.');
  // Never reads or transmits the document: all output is explicitly fictional.
  return {
    id: document.id, createdAt: new Date().toISOString(), simulated: true,
    summary: 'Ejemplo ficticio: una administración solicita documentación adicional para continuar un trámite. Este texto no describe tu documento.',
    issuer: 'Organismo de ejemplo (no identificado en tu documento)',
    communicationType: 'Ejemplo: solicitud de documentación',
    actions: [
      { id: '1', description: 'Lee la comunicación original y comprueba quién la envía.', priority: 'high' },
      { id: '2', description: 'Consulta con el organismo emisor qué documentación debes aportar y cómo presentarla.', priority: 'normal' },
    ],
    deadlines: [{ id: '1', description: 'Sin plazo ni fecha detectados. Consulta la fecha de notificación y el plazo en el original.', date: null, requiresVerification: true }],
    consequences: 'Ejemplo ficticio: el trámite podría quedar pendiente. Las consecuencias reales dependen de la comunicación y deben confirmarse con el organismo emisor.',
    confidence: { level: 'unavailable', explanation: 'No evaluable: simulación sin lectura del documento ni inteligencia artificial.' },
  };
}
