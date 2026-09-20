export interface DocumentPage {
  id: string;
  uri: string;
  kind: 'image' | 'pdf';
  name: string;
  /** null for a whole PDF whose page count has not been read. */
  pageCount: number | null;
}
export interface SelectedDocument { id: string; createdAt: string; pages: DocumentPage[] }
export interface DetectedDeadline { id: string; description: string; date: string | null; requiresVerification: boolean }
export interface RecommendedAction { id: string; description: string; priority: 'high' | 'normal' }
export interface AnalysisResult {
  id: string;
  createdAt: string;
  simulated: true;
  summary: string;
  issuer: string;
  communicationType: string;
  actions: RecommendedAction[];
  deadlines: DetectedDeadline[];
  consequences: string;
  confidence: { level: 'unavailable'; explanation: string };
}
