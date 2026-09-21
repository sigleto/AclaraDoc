export type {
  AnalysisResult,
  Analysis,
  Statement,
} from "../../shared/analysis";
export interface DocumentPage {
  id: string;
  uri: string;
  kind: "image" | "pdf";
  name: string;
  mimeType?: string;
  size?: number;
  pageCount: number | null;
}
export interface SelectedDocument {
  id: string;
  createdAt: string;
  pages: DocumentPage[];
}
export type DetectedDeadline =
  import("../../shared/analysis").Analysis["plazos"][number];
export type RecommendedAction =
  import("../../shared/analysis").Analysis["accionesRecomendadas"][number];
