import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  AIProviderUnavailableError,
  AIRequestInvalidError,
  AIResponseInvalidError,
  NoFlaggedClausesError,
} from '../../domain/exceptions/index';
import type {
  AIModelTier,
  AIProvider,
  ClassifyClausesRequest,
  ClauseClassificationResult,
  ClassifiedClauseDTO,
  ObjectionLetterRequest,
} from '../../domain/services/AIProvider';
import { logger } from '../../shared/logger';
import {
  buildClauseClassificationSystemPrompt,
  buildClauseClassificationUserPrompt,
  CLAUSE_CLASSIFICATION_PROMPT_VERSION,
} from './prompts/clauseClassificationV1';
import {
  buildObjectionLetterSystemPrompt,
  buildObjectionLetterUserPrompt,
} from './prompts/objectionLetterV1';

const MAX_CLAUSES_PER_BATCH = 8;
const MAX_LETTER_TOKENS = 2048;
const MAX_VALIDATION_ATTEMPTS = 2;
const MAX_LETTER_WORDS = 350;
const LETTER_PLACEHOLDERS: Record<'en' | 'es', string[]> = {
  en: ['[YOUR NAME]', '[RECIPIENT]', '[DATE]', '[CONTRACT REFERENCE]'],
  es: ['[SU NOMBRE]', '[DESTINATARIO]', '[FECHA]', '[REFERENCIA DEL CONTRATO]'],
};

const classificationTool = {
  name: 'classify_contract_clauses',
  description: 'Classify the supplied contract clauses using the required schema.',
  input_schema: {
    type: 'object' as const,
    properties: {
      clauses: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            clause_id: { type: 'string' },
            risk_level: { type: 'string', enum: ['low', 'medium', 'high'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            plain_explanation: { type: 'string' },
            why_risky: { type: ['string', 'null'] },
            legal_basis: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  reference: { type: 'string' },
                  summary: { type: 'string' },
                },
                required: ['reference', 'summary'],
                additionalProperties: false,
              },
            },
            suggested_change: { type: ['string', 'null'] },
          },
          required: [
            'clause_id',
            'risk_level',
            'confidence',
            'plain_explanation',
            'why_risky',
            'legal_basis',
            'suggested_change',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['clauses'],
    additionalProperties: false,
  },
};

const classifiedClauseSchema = z
  .object({
    clause_id: z.string().min(1),
    risk_level: z.enum(['low', 'medium', 'high']),
    confidence: z.number().min(0).max(1),
    plain_explanation: z.string().min(1),
    why_risky: z.string().nullable(),
    legal_basis: z.array(
      z.object({
        reference: z.string().min(1),
        summary: z.string().min(1),
      }).strict(),
    ),
    suggested_change: z.string().nullable(),
  })
  .strict();
const classificationResponseSchema = z
  .object({
    clauses: z.array(classifiedClauseSchema).min(1).max(MAX_CLAUSES_PER_BATCH),
  })
  .strict();

export interface AnthropicAIProviderOptions {
  fastModel: string;
  smartModel: string;
  maxTokens: number;
  timeoutMs: number;
}

export class AnthropicAIProvider implements AIProvider {
  constructor(
    private readonly client: Anthropic,
    private readonly options: AnthropicAIProviderOptions,
  ) {}

  public async classifyClauses(
    request: ClassifyClausesRequest,
    tier: AIModelTier = 'fast',
  ): Promise<ClauseClassificationResult> {
    if (request.clauses.length === 0 || request.clauses.length > MAX_CLAUSES_PER_BATCH) {
      throw new AIRequestInvalidError(`Clause batches must contain between 1 and ${MAX_CLAUSES_PER_BATCH} clauses.`);
    }

    const model = tier === 'fast' ? this.options.fastModel : this.options.smartModel;
    let feedback: string | undefined;
    let inputTokens = 0;
    let outputTokens = 0;

    for (let attempt = 0; attempt < MAX_VALIDATION_ATTEMPTS; attempt += 1) {
      const response = await this.createMessage(
        model,
        this.options.maxTokens,
        buildClauseClassificationSystemPrompt({
          localeName: this.getLocaleName(request.locale),
          jurisdiction: request.jurisdiction,
          contractType: request.contractType,
        }),
        [
          {
            role: 'user',
            content: buildClauseClassificationUserPrompt(request, feedback),
          },
        ],
        classificationTool,
        'classify_contract_clauses',
      );
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      const toolResult = response.content.find(
        (block) => block.type === 'tool_use' && block.name === classificationTool.name,
      );
      const parsed = toolResult?.type === 'tool_use'
        ? classificationResponseSchema.safeParse(toolResult.input)
        : null;
      const validationError = this.getClassificationValidationError(
        parsed,
        request,
        toolResult?.type === 'tool_use',
      );

      if (!validationError && parsed?.success) {
        return {
          clauses: parsed.data.clauses.map((clause) => ({
            ...clause,
            legal_basis: clause.legal_basis.filter((basis) => request.legalContext?.some(
              (provision) =>
                provision.clauseId === clause.clause_id
                && provision.reference.toLocaleLowerCase() === basis.reference.toLocaleLowerCase(),
            )),
          })),
          usage: { model, inputTokens, outputTokens },
        };
      }

      feedback = validationError || 'The response did not match the required schema.';
    }

    logger.warn('AI clause classification failed schema validation', {
      promptVersion: CLAUSE_CLASSIFICATION_PROMPT_VERSION,
      clauseCount: request.clauses.length,
    });
    throw new AIResponseInvalidError({ reason: 'The AI response remained invalid after one retry.' });
  }

  public async generateObjectionLetter(request: ObjectionLetterRequest): Promise<string> {
    const flaggedClauses = request.flaggedClauses.filter(
      (clause) => clause.riskLevel === 'high' || clause.riskLevel === 'medium',
    );
    if (flaggedClauses.length === 0) {
      throw new NoFlaggedClausesError();
    }

    const filteredRequest = { ...request, flaggedClauses };
    let feedback: string | undefined;
    for (let attempt = 0; attempt < MAX_VALIDATION_ATTEMPTS; attempt += 1) {
      const response = await this.createMessage(
        this.options.smartModel,
        MAX_LETTER_TOKENS,
        buildObjectionLetterSystemPrompt(this.getLocaleName(request.locale)),
        [{ role: 'user', content: buildObjectionLetterUserPrompt({
          ...filteredRequest,
          localeName: this.getLocaleName(request.locale),
        }, feedback) }],
      );
      const letter = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();
      const validationErrors = this.getLetterValidationErrors(letter, request.locale);
      if (validationErrors.length === 0) return letter;
      feedback = validationErrors.join(' ');
    }
    throw new AIResponseInvalidError({ reason: 'The AI response remained invalid after one retry.' });
  }

  private async createMessage(
    model: string,
    maxTokens: number,
    system: string,
    messages: Anthropic.Messages.MessageCreateParamsNonStreaming['messages'],
    tool?: typeof classificationTool,
    toolName?: string,
  ): Promise<Anthropic.Messages.Message> {
    try {
      return await this.client.messages.create(
        {
          model,
          max_tokens: maxTokens,
          system,
          messages,
          ...(tool ? { tools: [tool], tool_choice: { type: 'tool' as const, name: toolName! } } : {}),
        },
        { timeout: this.options.timeoutMs, maxRetries: 1 },
      );
    } catch (error) {
      logger.error('Anthropic request failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw new AIProviderUnavailableError();
    }
  }

  private getClassificationValidationError(
    parsed: ReturnType<typeof classificationResponseSchema.safeParse> | null,
    request: ClassifyClausesRequest,
    hasToolResult: boolean,
  ): string | null {
    if (!hasToolResult) {
      return 'Return the result using the classify_contract_clauses tool.';
    }
    if (!parsed?.success) {
      return parsed && !parsed.success
        ? parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
        : 'Return a valid clauses array.';
    }

    const actualIds = parsed.data.clauses.map((clause) => clause.clause_id);
    const expectedIds = request.clauses.map((clause) => clause.id);
    if (
      actualIds.length !== expectedIds.length ||
      actualIds.some((id, index) => id !== expectedIds[index])
    ) {
      return 'Return exactly one result for each supplied clause_id, in the same order.';
    }
    return null;
  }

  private getLocaleName(locale: string): string {
    return locale.toLowerCase().startsWith('es') ? 'Spanish' : 'English';
  }

  private getLetterValidationErrors(letter: string, locale: string): string[] {
    const errors: string[] = [];
    if (!letter) errors.push('Return a non-empty letter.');
    if (letter.split(/\s+/).length > MAX_LETTER_WORDS) {
      errors.push(`Keep the letter within ${MAX_LETTER_WORDS} words.`);
    }
    const placeholders = locale.toLowerCase().startsWith('es')
      ? LETTER_PLACEHOLDERS.es
      : LETTER_PLACEHOLDERS.en;
    const missingPlaceholders = placeholders.filter((placeholder) => !letter.includes(placeholder));
    if (missingPlaceholders.length > 0) {
      errors.push(`Include each required placeholder exactly as provided: ${missingPlaceholders.join(', ')}.`);
    }
    return errors;
  }
}
