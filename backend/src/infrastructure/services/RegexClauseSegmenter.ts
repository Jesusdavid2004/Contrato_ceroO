import type { ClauseSegmenter, SegmentedClause } from '../../domain/services/InfrastructureInterfaces';

export class RegexClauseSegmenter implements ClauseSegmenter {
  /**
   * Matches headings:
   * 1. (CLÁUSULA|CLAUSULA|CLAUSE|ARTÍCULO|ARTICULO) + identifier + delimiter
   * 2. Numbered items: 1. , 1.1. , 1.1.1.
   */
  private readonly clauseRegex = /(?:^|\n)\s*(?:(?:CL[AÁ]USULA|CLAUSE|ART[IÍ]CULO)\s+[A-ZÁÉÍÓÚÑ0-9.]*[\s.:\-]+|\d+(?:\.\d+)*\.\s+)/gi;

  public async segment(text: string): Promise<SegmentedClause[]> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const matches = [...text.matchAll(this.clauseRegex)];

    if (matches.length < 2) {
      // Fallback: split by double linebreaks into paragraphs if headings are not found
      const paragraphs = text
        .split(/\n\s*\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 20);

      return paragraphs.map((p, idx) => ({
        orderIndex: idx + 1,
        text: p,
      }));
    }

    const clauses: SegmentedClause[] = [];
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      // Skip the leading newline/whitespace if captured by (?:^|\n)\s*
      const matchText = match[0];
      const matchIndex = match.index ?? 0;
      const leadingWhitespaceLen = matchText.match(/^[\r\n\s]*/)?.[0].length || 0;
      const startIndex = matchIndex + leadingWhitespaceLen;

      const nextMatch = matches[i + 1];
      const nextIndex = nextMatch
        ? (nextMatch.index ?? text.length) + (nextMatch[0].match(/^[\r\n\s]*/)?.[0].length || 0)
        : text.length;

      const clauseText = text.substring(startIndex, nextIndex).trim();
      if (clauseText.length > 0) {
        clauses.push({
          orderIndex: clauses.length + 1,
          text: clauseText,
        });
      }
    }

    return clauses;
  }
}
