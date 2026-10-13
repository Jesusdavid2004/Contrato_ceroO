import type { ClassifiedClauseDTO } from '../../domain/services/AIProvider';
import type { AIClassificationCache } from '../../domain/services/InfrastructureInterfaces';

const MAX_CACHE_ENTRIES = 500;

export class InMemoryAIClassificationCache implements AIClassificationCache {
  private readonly entries = new Map<string, ClassifiedClauseDTO[]>();

  public async get(key: string): Promise<ClassifiedClauseDTO[] | null> {
    const clauses = this.entries.get(key);
    return clauses ? structuredClone(clauses) : null;
  }

  public async set(key: string, clauses: ClassifiedClauseDTO[]): Promise<void> {
    if (this.entries.size >= MAX_CACHE_ENTRIES && !this.entries.has(key)) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey) this.entries.delete(oldestKey);
    }
    this.entries.set(key, structuredClone(clauses));
  }
}
