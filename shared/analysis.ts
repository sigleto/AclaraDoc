import { z } from "zod";

export const LEGAL_NOTICE =
  "AclaraDoc no es una aplicación oficial. Comprueba siempre la información con el organismo emisor. Este resultado no es asesoramiento jurídico.";
export const CONSENT_TEXT =
  "Para analizar el documento, su contenido será enviado a Google Gemini. En el nivel gratuito, Google puede utilizar los datos enviados para mejorar sus productos. No envíes documentos con datos personales sensibles sin ocultarlos previamente. AclaraDoc no conservará el archivo después del análisis. Para limitar el consumo, se envía al backend un identificador aleatorio de esta instalación; solo se guarda su hash con los contadores diarios, sin el documento.";
export const QUOTA_MESSAGE =
  "Se ha alcanzado temporalmente el límite gratuito de análisis. Inténtalo más tarde.";
export const LIMITS = {
  files: 6,
  pages: 6,
  fileBytes: 4 * 1024 * 1024,
  totalBytes: 10 * 1024 * 1024,
} as const;
const text = z.string().trim().min(1).max(1200);
const origin = z.enum(["hecho", "interpretacion", "no_consta"]);
export const statementSchema = z.object({ texto: text, origen: origin });
const statements = z.array(statementSchema).max(12);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

// The same allowlist validates the provider response, HTTP response and local history.
export const analysisSchema = z.object({
  titulo: z.string().trim().min(1).max(160),
  resumenSencillo: statementSchema,
  organismoEmisor: text.nullable(),
  tipoComunicacion: text.nullable(),
  esMeramenteInformativo: z.boolean(),
  requiereActuacion: z.boolean(),
  accionesRecomendadas: statements,
  fechasDetectadas: z
    .array(z.object({ descripcion: text, fechaLiteral: text, fechaISO: date }))
    .max(12),
  plazos: z
    .array(
      z.object({
        descripcion: text,
        origen: origin,
        fechaNotificacion: date,
        fechaLimite: date,
        calculado: z.boolean(),
      }),
    )
    .max(12),
  consecuenciasDeNoActuar: statements,
  documentosQuePuedeNecesitar: statements,
  viasDeContactoMencionadas: statements,
  advertencias: z.array(text).max(12),
  partesIlegibles: z.array(text).max(12),
  nivelConfianza: z.enum(["alto", "medio", "bajo"]),
  necesitaRevisionProfesional: z.boolean(),
  motivoRevisionProfesional: text.nullable(),
  avisoLegal: text,
});
export type Analysis = z.infer<typeof analysisSchema>;
export type Statement = z.infer<typeof statementSchema>;

export function validateAnalysis(input: unknown): Analysis {
  const result = analysisSchema.parse(input);
  if (result.esMeramenteInformativo && result.requiereActuacion)
    throw new Error("Contradictory result");
  if (result.necesitaRevisionProfesional && !result.motivoRevisionProfesional)
    throw new Error("Missing review reason");
  for (const deadline of result.plazos) {
    if (
      deadline.calculado &&
      (!deadline.fechaNotificacion || !deadline.fechaLimite)
    )
      throw new Error("Missing notification date");
  }
  const dates = [
    ...result.fechasDetectadas.map((d) => d.fechaISO),
    ...result.plazos.flatMap((d) => [d.fechaNotificacion, d.fechaLimite]),
  ];
  for (const value of dates)
    if (
      value &&
      (Number.isNaN(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      throw new Error("Invalid calendar date");
  if (result.partesIlegibles.length) result.nivelConfianza = "bajo";
  else if (result.advertencias.length && result.nivelConfianza === "alto")
    result.nivelConfianza = "medio";
  result.avisoLegal = LEGAL_NOTICE;
  return result;
}

export const resultSchema = z.object({
  id: z.string().min(1).max(100),
  createdAt: z.iso.datetime(),
  simulated: z.boolean(),
  analysis: analysisSchema,
});
export type AnalysisResult = z.infer<typeof resultSchema>;
export function validateResult(input: unknown): AnalysisResult {
  const result = resultSchema.parse(input);
  result.analysis = validateAnalysis(result.analysis);
  return result;
}

export function mockAnalysis(): Analysis {
  return {
    titulo: "Ejemplo ficticio de solicitud de documentación",
    resumenSencillo: {
      texto:
        "Ejemplo ficticio: una administración pide documentación adicional. Este texto no describe tu documento.",
      origen: "interpretacion",
    },
    organismoEmisor: null,
    tipoComunicacion: "Ejemplo: solicitud de documentación",
    esMeramenteInformativo: false,
    requiereActuacion: true,
    accionesRecomendadas: [
      {
        texto: "Comprueba el documento original con el organismo emisor.",
        origen: "interpretacion",
      },
    ],
    fechasDetectadas: [],
    plazos: [],
    consecuenciasDeNoActuar: [],
    documentosQuePuedeNecesitar: [],
    viasDeContactoMencionadas: [],
    advertencias: [
      "Simulación: no se ha leído el documento. No se han detectado fechas ni plazos reales.",
    ],
    partesIlegibles: [],
    nivelConfianza: "bajo",
    necesitaRevisionProfesional: false,
    motivoRevisionProfesional: null,
    avisoLegal: LEGAL_NOTICE,
  };
}
