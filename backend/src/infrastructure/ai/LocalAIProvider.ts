import { AIProviderUnavailableError, NoFlaggedClausesError } from '../../domain/exceptions/index';
import { logger } from '../../shared/logger';
import type {
  AIProvider,
  ClassifyClausesRequest,
  ClauseClassificationResult,
  ObjectionLetterRequest,
} from '../../domain/services/AIProvider';
import type { TextEmbeddingProvider } from '../../domain/services/TextEmbeddingProvider';
import type { RiskLevel } from '../../domain/value-objects/RiskLevel';

/**
 * Local neural AI provider. No external API calls, no API keys.
 *
 * Classification is genuine neural inference: each clause is embedded with a
 * local multilingual transformer (multilingual-e5-small) and ranked by cosine
 * similarity against bilingual risk prototypes ("zero-shot" by embedding).
 * The winning prototype decides the risk level; the margin between the top
 * two similarities decides the confidence.
 *
 * Honest limits, documented for the class demo:
 * - plain_explanation / why_risky / suggested_change come from localized
 *   templates for the winning level (the network decides WHAT, templates say it).
 * - legal_basis is always empty here: embedding similarity does not cite law.
 *   Legal citations only come from the RAG corpus when enabled.
 */
interface RiskPrototype {
  level: RiskLevel;
  text: string;
}

const PROTOTYPES: RiskPrototype[] = [
  {
    level: 'high',
    text: 'El arrendador podrá dar por terminado el contrato de forma unilateral, sin previo aviso y sin indemnización alguna.',
  },
  {
    level: 'high',
    text: 'The tenant waives any right to reclaim the deposit and accepts a penalty of half the annual rent for any delay.',
  },
  {
    level: 'high',
    text: 'Cualquier disputa será resuelta exclusivamente por el árbitro designado por la empresa, renunciando el cliente a acudir a tribunales.',
  },
  {
    level: 'medium',
    text: 'El canon de arrendamiento se reajustará cada año a criterio del arrendador, sin límite máximo establecido.',
  },
  {
    level: 'medium',
    text: 'The landlord may enter the leased property at any time without prior notice for inspections.',
  },
  {
    level: 'medium',
    text: 'En caso de retraso en el pago, se cobrará un interés moratorio adicional a la penalidad pactada.',
  },
  {
    level: 'low',
    text: 'Ambas partes acuerdan un plazo de doce meses, prorrogable por mutuo acuerdo escrito.',
  },
  {
    level: 'low',
    text: 'Both parties agree to keep the property in good condition and report any damage in writing within five days.',
  },
  {
    level: 'low',
    text: 'El depósito será devuelto íntegramente al finalizar el contrato si no existen daños ni deudas pendientes.',
  },
];

const EXPLANATIONS: Record<'en' | 'es', Record<RiskLevel, { plain: string; why: string | null; fix: string | null }>> = {
  en: {
    high: {
      plain: 'The local neural model matched this clause with unfair high-risk terms (unilateral termination, waiver of rights, disproportionate penalties).',
      why: 'The wording may give one party an unfair advantage or remove legal protections.',
      fix: 'Request removal or a balanced term with clear limits and prior notice.',
    },
    medium: {
      plain: 'The local neural model matched this clause with terms that deserve review (discretionary increases, inspections, added charges).',
      why: 'The wording could become abusive depending on how it is applied.',
      fix: 'Request clear caps, notice periods, and mutual agreement for changes.',
    },
    low: {
      plain: 'The local neural model found this clause close to standard balanced terms.',
      why: null,
      fix: null,
    },
  },
  es: {
    high: {
      plain: 'El modelo neuronal local asoció esta cláusula con condiciones injustas de alto riesgo (terminación unilateral, renuncia de derechos, penalidades desproporcionadas).',
      why: 'La redacción podría dar una ventaja injusta a una de las partes o eliminar protecciones legales.',
      fix: 'Solicite eliminar la cláusula o una condición equilibrada con límites claros y aviso previo.',
    },
    medium: {
      plain: 'El modelo neuronal local asoció esta cláusula con condiciones que conviene revisar (incrementos discrecionales, inspecciones, cargos adicionales).',
      why: 'La redacción podría volverse abusiva según cómo se aplique.',
      fix: 'Solicite topes claros, plazos de aviso y acuerdo mutuo para los cambios.',
    },
    low: {
      plain: 'El modelo neuronal local encontró esta cláusula cercana a condiciones estándar equilibradas.',
      why: null,
      fix: null,
    },
  },
};

const LETTER_PLACEHOLDERS: Record<'en' | 'es', string[]> = {
  en: ['[YOUR NAME]', '[RECIPIENT]', '[DATE]', '[CONTRACT REFERENCE]'],
  es: ['[SU NOMBRE]', '[DESTINATARIO]', '[FECHA]', '[REFERENCIA DEL CONTRATO]'],
};

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function clampConfidence(value: number): number {
  return Math.min(0.97, Math.max(0.05, Math.round(value * 100) / 100));
}

export class LocalAIProvider implements AIProvider {
  private prototypeVectorsPromise?: Promise<Array<{ level: RiskLevel; vector: number[] }>>;

  constructor(private readonly embedder: TextEmbeddingProvider) {}

  public async classifyClauses(
    request: ClassifyClausesRequest,
  ): Promise<ClauseClassificationResult> {
    const locale = request.locale.toLowerCase().startsWith('es') ? 'es' : 'en';
    try {
      const prototypes = await this.getPrototypeVectors();
      const clauses = [];
      let estimatedChars = 0;
      for (const clause of request.clauses) {
        estimatedChars += clause.text.length;
        const queryVector = await this.embedder.embed(clause.text, 'query');
        const ranked = prototypes
          .map((p) => ({ level: p.level, similarity: cosineSimilarity(queryVector, p.vector) }))
          .sort((x, y) => y.similarity - x.similarity);
        const best = ranked[0];
        const runnerUp = ranked[1];
        // Very low absolute similarity means "nothing like any prototype": default to low.
        const level: RiskLevel = best.similarity < 0.2 ? 'low' : best.level;
        const margin = best.similarity - (runnerUp?.similarity ?? 0);
        const confidence = clampConfidence(0.5 + margin * 2);
        const text = EXPLANATIONS[locale][level];
        clauses.push({
          clause_id: clause.id,
          risk_level: level,
          confidence,
          plain_explanation: text.plain,
          why_risky: text.why,
          legal_basis: [],
          suggested_change: text.fix,
        });
      }
      return {
        clauses,
        usage: {
          model: 'local:multilingual-e5-small/prototype-v1',
          inputTokens: Math.ceil(estimatedChars / 4),
          outputTokens: 0,
        },
      };
    } catch (error) {
      if (error instanceof AIProviderUnavailableError) throw error;
      logger.warn('Local neural classification failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw new AIProviderUnavailableError();
    }
  }

  public async generateObjectionLetter(request: ObjectionLetterRequest): Promise<string> {
    if (request.flaggedClauses.length === 0) throw new NoFlaggedClausesError();
    const locale = request.locale.toLowerCase().startsWith('es') ? 'es' : 'en';
    const [name, recipient, date, reference] = LETTER_PLACEHOLDERS[locale];
    const rank = (level: string) => (level === 'high' ? 0 : 1);
    const ordered = [...request.flaggedClauses].sort((a, b) => rank(a.riskLevel) - rank(b.riskLevel));
    const excerpt = (text: string) => (text.length > 160 ? `${text.slice(0, 157)}...` : text);
    if (locale === 'es') {
      const items = ordered
        .map((c, i) => `${i + 1}. ${excerpt(c.text)} (riesgo: ${c.riskLevel})`)
        .join('\n');
      return [
        `${name}`,
        `${date}`,
        '',
        `${recipient}`,
        `Referencia: ${reference}`,
        '',
        'Asunto: Objeción a cláusulas del contrato',
        '',
        'Cordial saludo. He revisado el contrato con una herramienta local de análisis y encontré las siguientes cláusulas que considero desequilibradas:',
        '',
        items,
        '',
        'Solicito modificar estas condiciones por unas justas y equilibradas, con límites claros y aviso previo razonable.',
        '',
        'Atentamente,',
        `${name}`,
      ].join('\n');
    }
    const items = ordered.map((c, i) => `${i + 1}. ${excerpt(c.text)} (risk: ${c.riskLevel})`).join('\n');
    return [
      `${name}`,
      `${date}`,
      '',
      `${recipient}`,
      `Reference: ${reference}`,
      '',
      'Subject: Objection to contract clauses',
      '',
      'Kind regards. I reviewed the contract with a local analysis tool and found the following clauses I consider unbalanced:',
      '',
      items,
      '',
      'I request amending these terms into fair and balanced ones, with clear limits and reasonable prior notice.',
      '',
      'Sincerely,',
      `${name}`,
    ].join('\n');
  }

  private getPrototypeVectors(): Promise<Array<{ level: RiskLevel; vector: number[] }>> {
    this.prototypeVectorsPromise ??= (async () =>
      Promise.all(
        PROTOTYPES.map(async (p) => ({
          level: p.level,
          vector: await this.embedder.embed(p.text, 'document'),
        })),
      ))().catch((error: unknown) => {
      this.prototypeVectorsPromise = undefined;
      throw error;
    });
    return this.prototypeVectorsPromise;
  }
}
