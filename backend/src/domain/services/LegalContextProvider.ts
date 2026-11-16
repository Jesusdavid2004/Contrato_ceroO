export interface LegalContextProvision {
  clauseId: string;
  sourceName: string;
  sourceUrl: string;
  reference: string;
  text: string;
  tema: string;
  fuenteVerificadaEn?: string;
}

export interface LegalRetrievalScope {
  contractType: string;
}

export interface LegalContextProvider {
  retrieve(
    jurisdiction: string,
    clauses: Array<{ id: string; text: string }>,
    scope?: LegalRetrievalScope,
  ): Promise<LegalContextProvision[]>;
}
