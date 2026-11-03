import { z } from 'zod';
import {
  AIProviderUnavailableError,
  AIRequestInvalidError,
  AIResponseInvalidError,
  NoFlaggedClausesError,
} from '../../domain/exceptions/index';
import type {
  AIProvider,
  ClassifyClausesRequest,
  ClauseClassificationResult,
  ObjectionLetterRequest,
} from '../../domain/services/AIProvider';
import { logger } from '../../shared/logger';
import {
  buildClauseClassificationSystemPrompt,
  buildClauseClassificationUserPrompt,
  CLAUSE_CLASSIFICATION_PROMPT_VERSION,
} from './prompts/clauseClassificationV1';
import { buildObjectionLetterSystemPrompt, buildObjectionLetterUserPrompt } from './prompts/objectionLetterV1';

const MAX_CLAUSES_PER_BATCH = 8;
const MAX_LETTER_TOKENS = 2048;
const MAX_VALIDATION_ATTEMPTS = 2;
const MAX_LETTER_WORDS = 350;
const LETTER_PLACEHOLDERS: Record<'en' | 'es', string[]> = {
  en: ['[YOUR NAME]', '[RECIPIENT]', '[DATE]', '[CONTRACT REFERENCE]'],
  es: ['[SU NOMBRE]', '[DESTINATARIO]', '[FECHA]', '[REFERENCIA DEL CONTRATO]'],
};

const legalBasisSchema = z.object({
  reference: z.string(),
  summary: z.string(),
});
const classifiedClauseSchema = z.object({
  clause_id: z.string(),
  risk_level: z.enum(['low', 'medium', 'high']),
  confidence: z.number().min(0).max(1),
  plain_explanation: z.string(),
  why_risky: z.string().nullable(),
  legal_basis: z.array(legalBasisSchema),
  suggested_change: z.string().nullable(),
});
const classificationResponseSchema = z.object({
  clauses: z.array(classifiedClauseSchema),
});

// Gemini responseSchema mirrors the Zod schema above (no additionalProperties).
const classificationResponseJsonSchema = {
  type: 'object',
  properties: {
    clauses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          clause_id: { type: 'string' },
          risk_level: { type: 'string', enum: ['low', 'medium', 'high'] },
          confidence: { type: 'number' },
          plain_explanation: { type: 'string' },
          why_risky: { type: 'string' },
          legal_basis: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                reference: { type: 'string' },
                summary: { type: 'string' },
              },
              required: ['reference', 'summary'],
            },
          },
          suggested_change: { type: 'string' },
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
      },
    },
  },
  required: ['clauses'],
} as const;

interface GeminiOptions {
  apiKey: string;
  fastModel: string;
  smartModel: string;
  maxTokens: number;
  timeoutMs: number;
}

interface GeminiUsage {
  inputTokens: number;
  outputTokens: number;
}

function retryReason(error: AIResponseInvalidError): string | undefined {
  const details = error.details as { reason?: unknown } | undefined;
  return typeof details?.reason === 'string' ? details.reason : undefined;
}

export class GeminiAIProvider implements AIProvider {
  constructor(private readonly options: GeminiOptions) {
    if (!options.apiKey) throw new AIRequestInvalidError('Gemini API key is required.');
  }

  public async classifyClauses(
    request: ClassifyClausesRequest,
    tier: 'fast' | 'smart' = 'fast',
  ): Promise<ClauseClassificationResult> {
    const model = tier === 'fast' ? this.options.fastModel : this.options.smartModel;
    let inputTokens = 0;
    let outputTokens = 0;
    let feedback: string | undefined;

    for (let attempt = 0; attempt < MAX_VALIDATION_ATTEMPTS; attempt += 1) {
      let response: Awaited<ReturnType<typeof this.generateContent>>;
      try {
        response = await this.generateContent(
          model,
          buildClauseClassificationSystemPrompt({
            localeName: this.getLocaleName(request.locale),
            jurisdiction: request.jurisdiction,
            contractType: request.contractType,
          }),
          buildClauseClassificationUserPrompt(request, feedback),
          classificationResponseJsonSchema,
        );
      } catch (error) {
        if (error instanceof AIResponseInvalidError && attempt + 1 < MAX_VALIDATION_ATTEMPTS) {
          feedback = retryReason(error) ?? 'Return valid JSON matching the required schema.';
          logger.warn('AI clause classification failed schema validation', {
            promptVersion: CLAUSE_CLASSIFICATION_PROMPT_VERSION,
            clauseCount: request.clauses.length,
          });
          continue;
        }
        throw error;
      }
      inputTokens += response.usage.inputTokens;
      outputTokens += response.usage.outputTokens;

      const parsed = classificationResponseSchema.safeParse(response.json);
      const validationError = this.getClassificationValidationError(parsed, request);
      if (!validationError && parsed.success) {
        return {
          clauses: parsed.data.clauses.map((clause) => ({
            ...clause,
            legal_basis: clause.legal_basis.filter((basis) => request.legalContext?.some(
              (provision) =>
                provision.clauseId === clause.clause_id
                && provision.reference.toLocaleLowerCase() === basis.reference.toLocaleLowerCase(),
            ) ?? []),
          })),
          usage: { model, inputTokens, outputTokens },
        };
      }
      feedback = validationError || 'The response did not match the required schema.';
      logger.warn('AI clause classification failed schema validation', {
        promptVersion: CLAUSE_CLASSIFICATION_PROMPT_VERSION,
        clauseCount: request.clauses.length,
      });
    }
    throw new AIResponseInvalidError({ reason: 'The AI response remained invalid after one retry.' });
  }

  public async generateObjectionLetter(request: ObjectionLetterRequest): Promise<string> {
    const flaggedClauses = request.flaggedClauses.filter(
      (clause) => clause.riskLevel === 'high' || clause.riskLevel === 'medium',
    );
    if (flaggedClauses.length === 0) throw new NoFlaggedClausesError();

    const filteredRequest = { ...request, flaggedClauses };
    let feedback: string | undefined;
    for (let attempt = 0; attempt < MAX_VALIDATION_ATTEMPTS; attempt += 1) {
      let response: Awaited<ReturnType<typeof this.generateContent>>;
      try {
        response = await this.generateContent(
          this.options.smartModel,
          buildObjectionLetterSystemPrompt(this.getLocaleName(request.locale)),
          buildObjectionLetterUserPrompt(
            { ...filteredRequest, localeName: this.getLocaleName(request.locale) },
            feedback,
          ),
        );
      } catch (error) {
        if (error instanceof AIResponseInvalidError && attempt + 1 < MAX_VALIDATION_ATTEMPTS) {
          feedback = retryReason(error) ?? 'Return a non-empty letter with all placeholders.';
          continue;
        }
        throw error;
      }
      const validationErrors = this.getLetterValidationErrors(response.text, request.locale);
      if (validationErrors.length === 0) return response.text;
      feedback = validationErrors.join(' ');
    }
    throw new AIResponseInvalidError({ reason: 'The AI response remained invalid after one retry.' });
  }

  private async generateContent(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    responseSchema?: unknown,
    retried = false,
  ): Promise<{ text: string; json: unknown; usage: GeminiUsage }> {
    const body: Record<string, unknown> = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        maxOutputTokens: this.options.maxTokens,
        ...(responseSchema
          ? { responseMimeType: 'application/json', responseSchema }
          : { responseMimeType: 'text/plain' }),
      },
    };
    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.options.apiKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.options.timeoutMs),
        },
      );
      // Free-tier spikes: single backoff retry on rate limits/overload.
      if ((res.status === 429 || res.status === 503) && !retried) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return this.generateContent(model, systemPrompt, userPrompt, responseSchema, true);
      }
    } catch (error) {
      logger.error('Gemini request failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw new AIProviderUnavailableError();
    }
    if (!res.ok) {
      logger.error('Gemini request failed', { status: res.status });
      throw new AIProviderUnavailableError();
    }
    let payload: unknown;
    try {
      payload = await res.json() as unknown;
    } catch {
      throw new AIResponseInvalidError({ reason: 'The Gemini response was not JSON.' });
    }
    const parsed = z.object({
      candidates: z.array(z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }),
      })).min(1),
      usageMetadata: z.object({
        promptTokenCount: z.number().optional(),
        candidatesTokenCount: z.number().optional(),
      }).optional(),
    }).safeParse(payload);
    if (!parsed.success) {
      throw new AIResponseInvalidError({ reason: 'The Gemini response had no candidates.' });
    }
    const text = parsed.data.candidates[0].content.parts.map((p) => p.text ?? '').join('');
    if (!text.trim()) throw new AIResponseInvalidError({ reason: 'The Gemini response was empty.' });
    let json: unknown = null;
    if (responseSchema) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        throw new AIResponseInvalidError({ reason: 'The Gemini response was not valid JSON.' });
      }
    }
    return {
      text: text.trim(),
      json,
      usage: {
        inputTokens: parsed.data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: parsed.data.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }

  private getClassificationValidationError(
    parsed: ReturnType<typeof classificationResponseSchema.safeParse>,
    request: ClassifyClausesRequest,
  ): string | null {
    if (!parsed.success) {
      return parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
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
