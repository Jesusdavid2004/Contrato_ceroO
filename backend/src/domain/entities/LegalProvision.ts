export interface LegalProvisionProps {
  id: string;
  jurisdiction: string;
  sourceName: string;
  sourceUrl?: string;
  reference: string;
  text: string;
  embedding?: number[];
  createdAt?: Date;
  /** Curated legal domain, e.g. 'arriendo', 'consumo', 'laboral'. */
  tema?: string;
  /** ISO date (YYYY-MM-DD) of the norm the text was taken from. */
  vigenciaDesde?: string;
  /** ISO date (YYYY-MM-DD) when the source URL was last checked. */
  fuenteVerificadaEn?: string;
}

export class LegalProvision {
  public readonly id: string;
  public readonly jurisdiction: string;
  public readonly sourceName: string;
  public readonly sourceUrl: string;
  public readonly reference: string;
  public readonly text: string;
  public readonly embedding?: number[];
  public readonly createdAt: Date;
  public readonly tema: string;
  public readonly vigenciaDesde?: string;
  public readonly fuenteVerificadaEn?: string;

  constructor(props: LegalProvisionProps) {
    this.id = props.id;
    this.jurisdiction = props.jurisdiction;
    this.sourceName = props.sourceName;
    this.sourceUrl = props.sourceUrl || '';
    this.reference = props.reference;
    this.text = props.text;
    this.embedding = props.embedding;
    this.createdAt = props.createdAt || new Date();
    this.tema = props.tema || 'general';
    this.vigenciaDesde = props.vigenciaDesde;
    this.fuenteVerificadaEn = props.fuenteVerificadaEn;
  }

  public toJSON() {
    return {
      id: this.id,
      jurisdiction: this.jurisdiction,
      source_name: this.sourceName,
      source_url: this.sourceUrl,
      reference: this.reference,
      text: this.text,
      created_at: this.createdAt.toISOString(),
    };
  }
}
