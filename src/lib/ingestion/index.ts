export {
  parseStructuredIngestionBody,
  structuredIngestionBodySchema,
  type StructuredIngestionBody,
} from "@/lib/ingestion/structured-schema";

export {
  runStructuredIngestion,
  type StructuredIngestError,
  type StructuredIngestSuccess,
} from "@/lib/ingestion/structured-service";
