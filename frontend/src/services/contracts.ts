import { z } from 'zod';

const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '';
const STATUS_POLL_INTERVALS_MS = [500, 1000, 2000, 4000, 8000];
const ANALYSIS_TIMEOUT_MS = 10 * 60 * 1000;

const riskLevelSchema = z.enum(['low', 'medium', 'high']);
const legalBasisSchema = z.object({
  reference: z.string(),
  summary: z.string(),
});
const clauseDtoSchema = z.object({
  id: z.string().min(1),
  original_text: z.string(),
  risk_level: riskLevelSchema,
  plain_explanation: z.string(),
  confidence: z.number().min(0).max(1),
  why_risky: z.string().nullable(),
  legal_basis: z.array(legalBasisSchema),
  suggested_change: z.string().nullable(),
});
const contractDtoSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  global_risk_score: z.number().min(0).max(100),
  clauses: z.array(clauseDtoSchema),
});
const contractStatusSchema = z.object({
  status: z.string(),
  failure_message_key: z.string().nullable(),
});
const contractSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  file_name: z.string(),
  status: z.string(),
  global_risk_score: z.number().min(0).max(100),
  uploaded_at: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'invalid date' }),
});
const objectionLetterSchema = z.object({
  id: z.string(),
  contract_id: z.string(),
  locale: z.string(),
  content: z.string(),
  created_at: z.string(),
});
const errorKeySchema = z.object({ message_key: z.string() });

export type RiskLevel = z.infer<typeof riskLevelSchema>;

export interface ContractClauseResponse extends z.infer<typeof clauseDtoSchema> {
  text?: string;
}

type ContractDto = z.infer<typeof contractDtoSchema>;

export interface ContractAnalysisResult {
  id: string;
  status: string;
  global_risk_score: number;
  clauses: ContractClauseResponse[];
}

export type ContractSummary = z.infer<typeof contractSummarySchema>;

export type ObjectionLetterResponse = z.infer<typeof objectionLetterSchema>;

type ContractStatusResponse = z.infer<typeof contractStatusSchema>;

export class ContractApiError extends Error {
  constructor(public readonly messageKey: string) {
    super(messageKey);
    this.name = 'ContractApiError';
  }
}

export function isRiskLevel(value: unknown): value is RiskLevel {
  return riskLevelSchema.safeParse(value).success;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    throw new ContractApiError('errors.api_error');
  }
}

export function getErrorKey(responseBody: unknown): string {
  const parsed = errorKeySchema.safeParse(responseBody);
  return parsed.success ? parsed.data.message_key : 'errors.api_error';
}

async function requestJson(url: string, token: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  const body = await readJson(response);
  if (!response.ok) throw new ContractApiError(getErrorKey(body));
  return body;
}

export function parseStatus(value: unknown): ContractStatusResponse {
  const parsed = contractStatusSchema.safeParse(value);
  if (!parsed.success) throw new ContractApiError('errors.api_error');
  return parsed.data;
}

export function parseContract(value: unknown): ContractDto {
  const parsed = contractDtoSchema.safeParse(value);
  if (!parsed.success) throw new ContractApiError('errors.api_error');
  return parsed.data;
}

function toResultsViewModel(contract: ContractDto) {
  return {
    id: contract.id,
    status: contract.status,
    global_risk_score: contract.global_risk_score,
    clauses: contract.clauses.map((clause) => ({
      ...clause,
      text: clause.original_text,
    })),
  };
}

export function parseContractSummary(value: unknown): ContractSummary {
  const parsed = contractSummarySchema.safeParse(value);
  if (!parsed.success) throw new ContractApiError('errors.api_error');
  return parsed.data;
}

const uploadAcceptedSchema = z.object({ id: z.string().min(1) });

export async function listContracts(token: string): Promise<ContractSummary[]> {
  const response = await requestJson(`${API_URL}/api/contracts`, token);
  if (!Array.isArray(response)) throw new ContractApiError('errors.api_error');
  return response.map(parseContractSummary);
}

export async function getContractAnalysisResult(
  contractId: string,
  token: string,
) {
  const response = await requestJson(
    `${API_URL}/api/contracts/${encodeURIComponent(contractId)}`,
    token,
  );
  return toResultsViewModel(parseContract(response));
}

export async function deleteContract(contractId: string, token: string): Promise<void> {
  await requestJson(
    `${API_URL}/api/contracts/${encodeURIComponent(contractId)}`,
    token,
    { method: 'DELETE' },
  );
}

export async function deleteAccount(token: string): Promise<void> {
  await requestJson(`${API_URL}/api/v1/auth/me`, token, { method: 'DELETE' });
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function uploadAndAnalyzeContract(
  file: File,
  locale: string,
  token: string,
  onStage?: (stage: string) => void,
) {
  const formData = new FormData();
  formData.append('contract', file);
  formData.append('locale', locale);

  const upload = uploadAcceptedSchema.safeParse(
    await requestJson(`${API_URL}/api/contracts`, token, {
      method: 'POST',
      body: formData,
    }),
  );
  if (!upload.success) {
    throw new ContractApiError('errors.api_error');
  }
  const contractId = upload.data.id;

  const deadline = Date.now() + ANALYSIS_TIMEOUT_MS;
  let attempt = 0;
  onStage?.('UPLOADED');
  while (Date.now() < deadline) {
    const delay = STATUS_POLL_INTERVALS_MS[Math.min(attempt, STATUS_POLL_INTERVALS_MS.length - 1)];
    await wait(delay);
    attempt += 1;
    const status = parseStatus(await requestJson(
      `${API_URL}/api/contracts/${encodeURIComponent(contractId)}/status`,
      token,
    ));
    onStage?.(status.status);
    if (status.status === 'FAILED') {
      throw new ContractApiError(status.failure_message_key || 'errors.analysis_failed');
    }
    if (status.status === 'READY') {
      const contract = parseContract(await requestJson(
        `${API_URL}/api/contracts/${encodeURIComponent(contractId)}`,
        token,
      ));
      return toResultsViewModel(contract);
    }
  }
  throw new ContractApiError('errors.analysis_timeout');
}

export function parseObjectionLetter(value: unknown): ObjectionLetterResponse {
  const parsed = objectionLetterSchema.safeParse(value);
  if (!parsed.success) throw new ContractApiError('errors.api_error');
  return parsed.data;
}

export async function generateObjectionLetter(
  contractId: string,
  token: string,
): Promise<ObjectionLetterResponse> {
  const response = await requestJson(
    `${API_URL}/api/contracts/${encodeURIComponent(contractId)}/letter`,
    token,
    { method: 'POST' },
  );
  const letter = parseObjectionLetter(response);
  if (letter.contract_id !== contractId) throw new ContractApiError('errors.api_error');
  return letter;
}

export async function updateObjectionLetter(
  contractId: string,
  content: string,
  token: string,
): Promise<ObjectionLetterResponse> {
  const response = await requestJson(
    `${API_URL}/api/contracts/${encodeURIComponent(contractId)}/letter`,
    token,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    },
  );
  const letter = parseObjectionLetter(response);
  if (letter.contract_id !== contractId) throw new ContractApiError('errors.api_error');
  return letter;
}

export async function downloadObjectionLetterPdf(
  contractId: string,
  token: string,
): Promise<Blob> {
  const response = await fetch(
    `${API_URL}/api/contracts/${encodeURIComponent(contractId)}/letter/pdf`,
    { headers: { Authorization: 'Bearer ' + token } },
  );
  if (!response.ok) {
    throw new ContractApiError(getErrorKey(await readJson(response)));
  }
  const blob = await response.blob();
  if (blob.type !== 'application/pdf') {
    throw new ContractApiError('errors.api_error');
  }
  return blob;
}

export function isContractAnalysisResult(value: unknown): value is ContractAnalysisResult {
  try {
    parseContract(value);
    return true;
  } catch {
    return false;
  }
}
