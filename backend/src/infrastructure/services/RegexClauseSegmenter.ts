import type {
  HeadingClauseSegmenter,
  SegmentedClause,
} from '../../domain/services/InfrastructureInterfaces';

export class RegexClauseSegmenter implements HeadingClauseSegmenter {
  /**
   * Matches headings:
   * 1. (CLÁUSULA|CLAUSULA|CLAUSE|ARTÍCULO|ARTICULO) + identifier + delimiter
   * 2. Numbered items: 1. , 1.1. , 1.1.1.
   */
  private readonly clauseRegex =
    /(?:^|\n)\s*(?:(?:CL[AÁ]USULA|CLAUSE|ART[IÍ]CULO)\s+[A-ZÁÉÍÓÚÑ0-9.]*[\s.:\-]+|\d+(?:\.\d+)*(?:\.)?[\s:)\-]+)/gi;

  public async segment(text: string): Promise<SegmentedClause[]> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const clauses = this.segmentHeadings(text);
    if (clauses.length >= 2) {
      return clauses;
    }

    const paragraphs = text
      .split(/\n\s*\n+/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 20);

    return paragraphs.map((paragraph, index) => ({
      orderIndex: index + 1,
      text: paragraph,
    }));
  }

  public segmentHeadings(text: string): SegmentedClause[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const matches = [...text.matchAll(this.clauseRegex)];

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
