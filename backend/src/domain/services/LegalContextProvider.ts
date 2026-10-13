export interface LegalContextProvision {
  clauseId: string;
  sourceName: string;
  sourceUrl: string;
  reference: string;
  text: string;
}

export interface LegalContextProvider {
  retrieve(
    jurisdiction: string,
    clauses: Array<{ id: string; text: string }>,
  ): Promise<LegalContextProvision[]>;
}
