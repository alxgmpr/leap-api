import type { LeapModel } from "./model.ts";

/**
 * The subset of the model the browser actually reads: the search index needs
 * names, URLs and operation ids, and nothing else. Full schema nodes, frames,
 * descriptions, narrative markdown and the frame logs are all rendered at
 * build time and never touched client-side.
 *
 * Shipping the whole model was a 1.1MB download on every page; the frame logs
 * alone were 92KB of it, fetched to draw a list the server already knows.
 */
export type ClientModel = {
  resources: {
    name: string;
    operations: { url: string; operationId: string }[];
  }[];
  schemas: { name: string }[];
  commandTable: { commandType: string }[];
};

export function toClientModel(model: LeapModel): ClientModel {
  return {
    resources: model.resources.map((resource) => ({
      name: resource.name,
      operations: resource.operations.map((operation) => ({
        url: operation.url,
        operationId: operation.operationId,
      })),
    })),
    schemas: model.schemas.map((schema) => ({ name: schema.name })),
    commandTable: model.commandTable.map((row) => ({
      commandType: row.commandType,
    })),
  };
}
