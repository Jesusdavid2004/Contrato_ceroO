import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextType } from '../context/AuthContext';
import { Results } from '../pages/Results';
import i18n from '../i18n';
import {
  generateObjectionLetter,
  type ContractAnalysisResult,
} from '../services/contracts';

vi.mock('../services/contracts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/contracts')>();
  return {
    ...actual,
    generateObjectionLetter: vi.fn(),
    updateObjectionLetter: vi.fn(),
    downloadObjectionLetterPdf: vi.fn(),
  };
});

const RISKY_CLAUSE = {
  id: 'clause-risky',
  original_text: 'This agreement renews automatically every year unless notice is given.',
  risk_level: 'high' as const,
  plain_explanation: 'It renews unless you act.',
  confidence: 0.94,
  why_risky: 'A missed deadline extends the agreement.',
  legal_basis: [],
  suggested_change: 'Request a reminder.',
};

const SAFE_CLAUSE = {
  ...RISKY_CLAUSE,
  id: 'clause-safe',
  original_text: 'Notices will be sent to the contact details provided by each party.',
  risk_level: 'low' as const,
  why_risky: null,
  suggested_change: null,
};

function analysis(clauses: typeof RISKY_CLAUSE[]): ContractAnalysisResult {
  return { id: 'c1', status: 'READY', global_risk_score: 50, clauses };
}

function authValue(): AuthContextType {
  return {
    user: { id: 'u1', name: 'Alex Rivera', email: 'alex@example.test' },
    token: 'token-1',
    login: vi.fn() as unknown as AuthContextType['login'],
    register: vi.fn() as unknown as AuthContextType['register'],
    logout: vi.fn(),
    isLoading: false,
    isRestoring: false,
    error: null,
    clearError: () => {},
  };
}

function renderResults(contractData: ContractAnalysisResult) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/results', state: { contractData } }]}>
      <AuthContext.Provider value={authValue()}>
        <Results />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('Results view', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.mocked(generateObjectionLetter).mockResolvedValue({
      id: 'letter-1',
      contract_id: 'c1',
      locale: 'en',
      content: 'Dear [RECIPIENT],\n\nPlease review [CONTRACT REFERENCE].\n\nSincerely,\n[YOUR NAME]\n[DATE]',
      created_at: '2026-11-03T00:00:00.000Z',
    });
  });

  it('shows the score, clauses, and letter CTA for flagged contracts', async () => {
    renderResults(analysis([RISKY_CLAUSE, SAFE_CLAUSE]));
    expect(screen.getByText(/This information is general and is not legal advice/)).toBeInTheDocument();
    expect(screen.getByText(/This agreement renews automatically/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate Objection Letter' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Generate Objection Letter' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Editable objection letter text')).toBeInTheDocument();
    });
  });

  it('shows the no-flagged-clauses state and no letter button', () => {
    renderResults(analysis([SAFE_CLAUSE]));
    expect(
      screen.getByText('No medium- or high-risk clauses were found, so an objection letter is not needed.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generate Objection Letter' })).not.toBeInTheDocument();
  });
});
