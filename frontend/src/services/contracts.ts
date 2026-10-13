const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const STATUS_POLL_INTERVAL_MS = 500;
const ANALYSIS_TIMEOUT_MS = 60_000;

interface ContractClauseResponse {
  id: string;
  original_text: string;
  risk_level: 'low' | 'medium' | 'high';
  plain_explanation: string;
  confidence: number;
  why_risky: string | null;
  legal_basis: Array<{ reference: string; summary: string }>;
  suggested_change: string | null;
}

interface ContractResponse {
  id: string;
  status: string;
  global_risk_score: number;
  clauses: ContractClauseResponse[];
}

interface ContractStatusResponse {
  status: string;
  failure_message_key: string | null;
}

export class ContractApiError extends Error {
  constructor(public readonly messageKey: string) {
    super(messageKey);
    this.name = 'ContractApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRiskLevel(value: unknown): value is ContractClauseResponse['risk_level'] {
  return value === 'low' || value === 'medium' || value === 'high';
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    throw new ContractApiError('errors.api_error');
  }
}

function getErrorKey(responseBody: unknown): string {
  if (isRecord(responseBody) && typeof responseBody.message_key === 'string') {
    return responseBody.message_key;
  }
  return 'errors.api_error';
}

async function requestJson(url: string, token: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
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

function parseStatus(value: unknown): ContractStatusResponse {
  if (
    !isRecord(value) ||
    typeof value.status !== 'string' ||
    !(typeof value.failure_message_key === 'string' || value.failure_message_key === null)
  ) {
    throw new ContractApiError('errors.api_error');
  }
  return {
    status: value.status,
    failure_message_key: value.failure_message_key,
  };
}

function parseContract(value: unknown): ContractResponse {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    typeof value.status !== 'string' ||
    typeof value.global_risk_score !== 'number' ||
    value.global_risk_score < 0 ||
    value.global_risk_score > 100 ||
    !Array.isArray(value.clauses)
  ) {
    throw new ContractApiError('errors.api_error');
  }
  const clauses = value.clauses.map((clause): ContractClauseResponse => {
    if (
      !isRecord(clause) ||
      typeof clause.id !== 'string' ||
      typeof clause.original_text !== 'string' ||
      !isRiskLevel(clause.risk_level) ||
      typeof clause.plain_explanation !== 'string' ||
      typeof clause.confidence !== 'number' ||
      clause.confidence < 0 ||
      clause.confidence > 1 ||
      !(typeof clause.why_risky === 'string' || clause.why_risky === null) ||
      !Array.isArray(clause.legal_basis) ||
      !(typeof clause.suggested_change === 'string' || clause.suggested_change === null)
    ) {
      throw new ContractApiError('errors.api_error');
    }
    const legalBasis = clause.legal_basis.map((basis) => {
      if (
        !isRecord(basis) ||
        typeof basis.reference !== 'string' ||
        typeof basis.summary !== 'string'
      ) {
        throw new ContractApiError('errors.api_error');
      }
      return { reference: basis.reference, summary: basis.summary };
    });
    return {
      id: clause.id,
      original_text: clause.original_text,
      risk_level: clause.risk_level,
      plain_explanation: clause.plain_explanation,
      confidence: clause.confidence,
      why_risky: clause.why_risky,
      legal_basis: legalBasis,
      suggested_change: clause.suggested_change,
    };
  });
  return {
    id: value.id,
    status: value.status,
    global_risk_score: value.global_risk_score,
    clauses,
  };
}

function toResultsViewModel(contract: ContractResponse) {
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

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function uploadAndAnalyzeContract(
  file: File,
  locale: string,
  token: string,
) {
  const formData = new FormData();
  formData.append('contract', file);
  formData.append('locale', locale);

  const upload = await requestJson(`${API_URL}/api/contracts`, token, {
    method: 'POST',
    body: formData,
  });
  if (!isRecord(upload) || typeof upload.id !== 'string') {
    throw new ContractApiError('errors.api_error');
  }

  const deadline = Date.now() + ANALYSIS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await wait(STATUS_POLL_INTERVAL_MS);
    const status = parseStatus(await requestJson(
      `${API_URL}/api/contracts/${encodeURIComponent(upload.id)}/status`,
      token,
    ));
    if (status.status === 'FAILED') {
      throw new ContractApiError(status.failure_message_key || 'errors.analysis_failed');
    }
    if (status.status === 'READY') {
      const contract = parseContract(await requestJson(
        `${API_URL}/api/contracts/${encodeURIComponent(upload.id)}`,
        token,
      ));
      return toResultsViewModel(contract);
    }
  }
  throw new ContractApiError('errors.analysis_timeout');
}
