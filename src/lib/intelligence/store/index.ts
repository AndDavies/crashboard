export { getTursoIntelligenceStore, TursoIntelligenceStore } from "./turso";
export type * from "./types";

export function intelligenceUsesTurso() {
  return process.env.INTELLIGENCE_STORE?.trim().toLocaleLowerCase() === "turso";
}
