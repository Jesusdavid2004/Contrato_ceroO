import { z } from 'zod';

export const ASSISTANT_QUESTION_MAX_LENGTH = 1000;

export const askAssistantBodySchema = z.object({
  question: z.string().trim().min(1).max(ASSISTANT_QUESTION_MAX_LENGTH),
});
