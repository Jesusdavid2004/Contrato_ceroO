import { z } from 'zod';

export const contractTypeSchema = z.enum(['LEASE', 'SERVICE', 'EMPLOYMENT', 'OTHER']);

export const factKeySchema = z.enum([
  'party_a',
  'party_b',
  'amount',
  'currency',
  'periodicity',
  'duration',
  'start_date',
  'end_date',
  'termination',
]);

export const confirmFactBodySchema = z.object({
  key: factKeySchema,
  status: z.enum(['confirmed', 'corrected']),
  value: z.string().trim().min(1).max(500).optional(),
});

export const createProposalBodySchema = z.object({
  proposed_text: z.string().trim().min(1).max(2000).optional(),
  reason: z.string().trim().min(1).max(1000),
});

export const updateProposalBodySchema = z.object({
  action: z.enum(['accept', 'discard']).optional(),
  proposed_text: z.string().trim().min(1).max(2000).optional(),
  reason: z.string().trim().min(1).max(1000).optional(),
}).refine(
  (body) => body.action !== undefined || body.proposed_text !== undefined || body.reason !== undefined,
  { message: 'Provide an action or fields to update.' },
);

export const userRoleSchema = z.enum(['tenant', 'consumer', 'employee', 'other']);

export const uploadContractBodySchema = z.object({
  title: z.string().trim().max(255).optional(),
  contract_type: contractTypeSchema.optional(),
  contractType: contractTypeSchema.optional(),
  user_role: userRoleSchema.optional(),
  userRole: userRoleSchema.optional(),
  jurisdiction: z
    .string()
    .trim()
    .min(2, 'Jurisdiction must be at least 2 characters')
    .max(10, 'Jurisdiction must not exceed 10 characters')
    .toUpperCase()
    .optional()
    .default('CO'),
  locale: z.enum(['es', 'en']).optional().default('es'),
});

export const updateLetterBodySchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Letter content is required')
    .refine(
      (text) => text.split(/\s+/).filter(Boolean).length <= 350,
      'Letter content must not exceed 350 words',
    ),
});

export const contractIdParamSchema = z.object({
  id: z.string().min(1, 'Contract ID is required'),
});

export type UploadContractBodyDTO = z.infer<typeof uploadContractBodySchema>;
export type UpdateLetterBodyDTO = z.infer<typeof updateLetterBodySchema>;
