export interface LegalUpdateProps {
  id: string;
  sourceId: string;
  tema: string;
  title: string;
  sourceUrl: string;
  /** SHA-256 of the normalized source content that produced this update. */
  contentHash: string;
  detectedAt?: Date;
}

/** A detected change in an official legal source, tied to one curated topic. */
export class LegalUpdate {
  public readonly id: string;
  public readonly sourceId: string;
  public readonly tema: string;
  public readonly title: string;
  public readonly sourceUrl: string;
  public readonly contentHash: string;
  public readonly detectedAt: Date;

  constructor(props: LegalUpdateProps) {
    this.id = props.id;
    this.sourceId = props.sourceId;
    this.tema = props.tema;
    this.title = props.title;
    this.sourceUrl = props.sourceUrl;
    this.contentHash = props.contentHash;
    this.detectedAt = props.detectedAt ?? new Date();
  }

  public toJSON() {
    return {
      id: this.id,
      source_id: this.sourceId,
      tema: this.tema,
      title: this.title,
      source_url: this.sourceUrl,
      detected_at: this.detectedAt.toISOString(),
    };
  }
}
