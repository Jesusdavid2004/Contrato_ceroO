import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextType } from '../context/AuthContext';
import { Home } from '../pages/Home';
import i18n from '../i18n';

vi.mock('../services/contracts', () => ({
  ContractApiError: class extends Error {
    messageKey: string;
    constructor(messageKey: string) {
      super(messageKey);
      this.messageKey = messageKey;
    }
  },
  uploadAndAnalyzeContract: vi.fn(),
}));

vi.mock('../lib/fileHash', () => ({ preHashFile: vi.fn() }));

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

function renderHome() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue()}>
        <Home />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('Home upload view', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the greeting, dropzone, and product modules in English', () => {
    renderHome();
    expect(screen.getByText(/Hello, Alex/)).toBeInTheDocument();
    expect(screen.getByText('Upload contract')).toBeInTheDocument();
    expect(screen.getByText('PDF or Images (max 10MB)')).toBeInTheDocument();
    expect(screen.getByText('Instant Scan')).toBeInTheDocument();
    expect(screen.getByText('AI Analysis')).toBeInTheDocument();
    expect(screen.getByText('Take Action')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload contract')).toBeInTheDocument();
  });

  it('renders the same structure in Spanish', async () => {
    await i18n.changeLanguage('es');
    renderHome();
    expect(screen.getByText(/Hola, Alex/)).toBeInTheDocument();
    expect(screen.getByText('Subir contrato')).toBeInTheDocument();
    await i18n.changeLanguage('en');
  });
});
