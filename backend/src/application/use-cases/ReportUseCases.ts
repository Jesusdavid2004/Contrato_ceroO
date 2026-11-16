import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import type { FactsRepository } from '../../domain/repositories/FactsRepository';
import type { ProposalsRepository } from '../../domain/repositories/ProposalsRepository';
import type { PdfGenerator, PdfReportSection } from '../../domain/services/InfrastructureInterfaces';
import {
  ContractNotFoundError,
  ContractOwnershipError,
} from '../../domain/exceptions/index';

function es(locale: string): boolean {
  return locale.toLowerCase().startsWith('es');
}

/**
 * Expediente del caso en PDF: contexto, resumen, hallazgos con fragmentos,
 * datos confirmados, propuestas, carta, fuentes, cobertura y advertencias.
 * Nada se envia; es un documento para preparar revision humana.
 */
export class GenerateCaseReportUseCase {
  constructor(
    private readonly contractRepository: ContractRepository,
    private readonly pdfGenerator: PdfGenerator,
    private readonly factsRepository?: FactsRepository,
    private readonly proposalsRepository?: ProposalsRepository,
  ) {}

  public async execute(input: {
    contractId: string;
    userId: string;
  }): Promise<{ buffer: Buffer; filename: string; title: string }> {
    const contract = await this.contractRepository.findById(input.contractId);
    if (!contract) throw new ContractNotFoundError(input.contractId);
    if (contract.ownerId !== input.userId) throw new ContractOwnershipError(input.contractId);

    const spanish = es(contract.locale);
    const facts = await this.factsRepository?.getFacts(contract.id) ?? [];
    const proposals = await this.proposalsRepository?.listByContract(contract.id) ?? [];
    const letter = await this.contractRepository.getObjectionLetter(contract.id);

    const flagged = contract.flaggedClauses();
    const needsReview = contract.clauses.filter((clause) => clause.requiresReview);
    const byRisk = (level: string): number =>
      contract.clauses.filter((clause) => clause.riskLevel === level).length;
    const confirmedFacts = facts.filter(
      (fact) => fact.status === 'confirmed' || fact.status === 'corrected',
    );
    const sources = new Map<string, string>();
    for (const clause of contract.clauses) {
      for (const basis of clause.legalBasis) {
        if (!sources.has(basis.reference)) {
          sources.set(basis.reference, basis.sourceUrl || (spanish ? 'sin URL verificada' : 'no verified URL'));
        }
      }
    }

    const sections: PdfReportSection[] = [
      {
        heading: spanish ? 'Contexto' : 'Context',
        body: [
          `${spanish ? 'Contrato' : 'Contract'}: ${contract.title}`,
          `${spanish ? 'Tipo' : 'Type'}: ${contract.contractType} · ${
            spanish ? 'Jurisdicción' : 'Jurisdiction'}: ${contract.jurisdiction} · ${
            spanish ? 'Idioma' : 'Locale'}: ${contract.locale}`,
          `${spanish ? 'Cobertura' : 'Coverage'}: ${contract.coverageStatus} (${
            contract.coverageRulesVersion}) · ${spanish ? 'Estado' : 'Status'}: ${contract.status}`,
        ],
      },
      {
        heading: spanish ? 'Resumen' : 'Summary',
        body: [
          `${spanish ? 'Riesgo global' : 'Global risk'}: ${contract.globalRiskScore} · ${
            contract.clauses.length} ${spanish ? 'cláusulas' : 'clauses'} ` +
          `(high ${byRisk('high')}, medium ${byRisk('medium')}, low ${byRisk('low')})`,
          `${spanish ? 'Requieren revisión' : 'Need review'}: ${needsReview.length}`,
          `${spanish ? 'Datos confirmados' : 'Confirmed facts'}: ${confirmedFacts.length}`,
        ],
      },
      {
        heading: spanish ? 'Hallazgos' : 'Findings',
        body: flagged.length === 0
          ? [spanish ? 'Sin cláusulas de riesgo medio o alto.' : 'No medium- or high-risk clauses.']
          : flagged.map((clause) =>
            `[${clause.riskLevel}] ${clause.originalText.slice(0, 280)} — ${
              clause.plainExplanation} (${spanish ? 'confianza' : 'confidence'} ${
              Math.round(clause.confidence * 100)}%${
              clause.requiresReview ? (spanish ? '; requiere revisión' : '; needs review') : ''})`,
          ),
      },
      {
        heading: spanish ? 'Datos confirmados' : 'Confirmed facts',
        body: confirmedFacts.length === 0
          ? [spanish ? 'Ninguno.' : 'None.']
          : confirmedFacts.map((fact) => `${fact.key}: ${fact.value ?? '—'} (${fact.status})`),
      },
      {
        heading: spanish ? 'Propuestas' : 'Proposals',
        body: proposals.length === 0
          ? [spanish ? 'Ninguna.' : 'None.']
          : proposals.map((proposal) =>
            `[${proposal.status}] ${proposal.originalText.slice(0, 120)} → ${
              proposal.proposedText.slice(0, 120)} (${spanish ? 'motivo' : 'reason'}: ${proposal.reason})`),
      },
      {
        heading: spanish ? 'Carta' : 'Letter',
        body: [letter ? letter.content : (spanish ? 'No generada.' : 'Not generated.')],
      },
      {
        heading: spanish ? 'Fuentes' : 'Sources',
        body: sources.size === 0
          ? [spanish ? 'Sin citas con respaldo.' : 'No backed citations.']
          : [...sources.entries()].map(([reference, url]) => `${reference}: ${url}`),
      },
      {
        heading: spanish ? 'Cobertura y advertencias' : 'Coverage and warnings',
        body: [
          contract.coverageStatus === 'experimental'
            ? (spanish
              ? 'Cobertura experimental: no validado jurídicamente, sin afirmaciones categóricas.'
              : 'Experimental coverage: not legally validated, no categorical claims.')
            : `${spanish ? 'Cobertura' : 'Coverage'}: ${contract.coverageStatus}.`,
          ...(contract.status === 'FAILED'
            ? [`${spanish ? 'Análisis fallido' : 'Failed analysis'}: ${contract.failureReason ?? ''}`]
            : []),
          spanish
            ? 'Información general, no asesoría legal.'
            : 'General information, not legal advice.',
        ],
      },
    ];

    const title = spanish ? `Expediente — ${contract.title}` : `Case file — ${contract.title}`;
    const buffer = await this.pdfGenerator.generateCaseReportPdf(title, sections);
    const filename = `${contract.title.normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .toLowerCase() || 'case'}-report.pdf`;
    return { buffer, filename, title };
  }
}
