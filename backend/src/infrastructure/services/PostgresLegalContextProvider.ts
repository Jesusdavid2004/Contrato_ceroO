import type { LegalProvisionRepository } from '../../domain/repositories/LegalProvisionRepository';
import type {
  LegalContextProvider,
  LegalContextProvision,
  LegalRetrievalScope,
} from '../../domain/services/LegalContextProvider';
import type { TextEmbeddingProvider } from '../../domain/services/TextEmbeddingProvider';

const PROVISIONS_PER_CLAUSE = 3;

/**
 * Temas curados por tipo contractual. Sin entrada no se recupera nada (ni
 * siquiera se calculan embeddings): mejor sin citas que con normas de otro
 * ambito por parecido semantico.
 */
const TEMAS_BY_CONTRACT_TYPE: Record<string, string[]> = {
  LEASE: ['arriendo'],
  SERVICE: ['consumo'],
};

export class PostgresLegalContextProvider implements LegalContextProvider {
  constructor(
    private readonly provisionRepository: LegalProvisionRepository,
    private readonly embeddingProvider: TextEmbeddingProvider,
  ) {}

  public async retrieve(
    jurisdiction: string,
    clauses: Array<{ id: string; text: string }>,
    scope?: LegalRetrievalScope,
  ): Promise<LegalContextProvision[]> {
    const allowedTemas = scope ? (TEMAS_BY_CONTRACT_TYPE[scope.contractType] ?? []) : null;
    if (allowedTemas !== null && allowedTemas.length === 0) return [];
    const provisionsByClause = await Promise.all(clauses.map(async (clause) => {
      const embedding = await this.embeddingProvider.embed(clause.text, 'query');
      const provisions = await this.provisionRepository.findTopRelevant(
        jurisdiction,
        embedding,
        PROVISIONS_PER_CLAUSE,
      );
      return provisions
        .filter((provision) => allowedTemas === null || allowedTemas.includes(provision.tema))
        .map((provision) => ({
          clauseId: clause.id,
          sourceName: provision.sourceName,
          sourceUrl: provision.sourceUrl,
          reference: provision.reference,
          text: provision.text,
          tema: provision.tema,
          fuenteVerificadaEn: provision.fuenteVerificadaEn,
        }));
    }));
    return provisionsByClause.flat();
  }
}
