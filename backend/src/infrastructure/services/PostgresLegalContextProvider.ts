import type { LegalProvisionRepository } from '../../domain/repositories/LegalProvisionRepository';
import type {
  LegalContextProvider,
  LegalContextProvision,
} from '../../domain/services/LegalContextProvider';
import type { TextEmbeddingProvider } from '../../domain/services/TextEmbeddingProvider';

const PROVISIONS_PER_CLAUSE = 3;

export class PostgresLegalContextProvider implements LegalContextProvider {
  constructor(
    private readonly provisionRepository: LegalProvisionRepository,
    private readonly embeddingProvider: TextEmbeddingProvider,
  ) {}

  public async retrieve(
    jurisdiction: string,
    clauses: Array<{ id: string; text: string }>,
  ): Promise<LegalContextProvision[]> {
    const provisionsByClause = await Promise.all(clauses.map(async (clause) => {
      const embedding = await this.embeddingProvider.embed(clause.text, 'query');
      const provisions = await this.provisionRepository.findTopRelevant(
        jurisdiction,
        embedding,
        PROVISIONS_PER_CLAUSE,
      );
      return provisions.map((provision) => ({
        clauseId: clause.id,
        sourceName: provision.sourceName,
        sourceUrl: provision.sourceUrl,
        reference: provision.reference,
        text: provision.text,
      }));
    }));
    return provisionsByClause.flat();
  }
}
