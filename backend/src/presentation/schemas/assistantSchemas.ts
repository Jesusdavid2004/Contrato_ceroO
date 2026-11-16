import { z } from 'zod';

export const ASSISTANT_QUESTION_MAX_LENGTH = 1000;
export const ASSISTANT_CLAUSE_ID_MAX_LENGTH = 128;

export const askAssistantBodySchema = z.object({
  question: z.string().trim().min(1).max(ASSISTANT_QUESTION_MAX_LENGTH),
  /** Clause the user is asking about; it is always part of the context pack. */
  clause_id: z.string().trim().min(1).max(ASSISTANT_CLAUSE_ID_MAX_LENGTH).optional(),
});
