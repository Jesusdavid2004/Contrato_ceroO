import { describe, it, expect } from 'vitest';
import { RiskScore, InvalidRiskScoreError } from '../src/domain/value-objects/RiskScore';
import { Contract } from '../src/domain/entities/Contract';
import { Clause } from '../src/domain/entities/Clause';
import {
  UnsupportedFileTypeError,
  FileTooLargeError,
  NoFlaggedClausesError,
  ContractNotFoundError,
  ContractOwnershipError,
} from '../src/domain/exceptions/index';
import { errorHandler } from '../src/shared/errors/errorHandler';
import type { Request, Response } from 'express';

describe('Domain Layer Unit Tests', () => {
  describe('RiskScore Value Object', () => {
    it('accepts valid score within [0, 100]', () => {
      expect(new RiskScore(0).getValue()).toBe(0);
      expect(new RiskScore(50).getValue()).toBe(50);
      expect(new RiskScore(100).getValue()).toBe(100);
      expect(new RiskScore(33.4).getValue()).toBe(33);
      expect(new RiskScore(66.6).getValue()).toBe(67);
    });

    it('rejects scores below 0', () => {
      expect(() => new RiskScore(-1)).toThrow(InvalidRiskScoreError);
    });

    it('rejects scores above 100', () => {
      expect(() => new RiskScore(101)).toThrow(InvalidRiskScoreError);
    });

    it('rejects NaN', () => {
      expect(() => new RiskScore(Number.NaN)).toThrow(InvalidRiskScoreError);
    });
  });

  describe('Contract Global Risk Score Calculation', () => {
    function createClause(id: string, riskLevel: 'low' | 'medium' | 'high', orderIndex: number = 0): Clause {
      return new Clause({
        id,
        orderIndex,
        originalText: `Sample clause ${id}`,
        riskLevel,
        confidence: 0.9,
        plainExplanation: `Explanation ${id}`,
      });
    }

    it('calculates score 0 when contract has no clauses', () => {
      const contract = new Contract({
        id: 'c-0',
        ownerId: 'u-1',
        title: 'Empty Contract',
        fileName: 'empty.pdf',
        contractType: 'LEASE',
        jurisdiction: 'CO',
        locale: 'es',
        clauses: [],
      });
      expect(contract.calculateGlobalRiskScore()).toBe(0);
      expect(contract.globalRiskScore).toBe(0);
    });

    it('calculates score 100 when all clauses are HIGH risk', () => {
      const contract = new Contract({
        id: 'c-1',
        ownerId: 'u-1',
        title: 'High Risk Contract',
        fileName: 'high.pdf',
        contractType: 'LEASE',
        jurisdiction: 'CO',
        locale: 'es',
        clauses: [
          createClause('cl-1', 'high'),
          createClause('cl-2', 'high'),
        ],
      });
      // 100 * (3*2) / (3*2) = 100
      expect(contract.calculateGlobalRiskScore()).toBe(100);
    });

    it('calculates score 0 when all clauses are LOW risk', () => {
      const contract = new Contract({
        id: 'c-2',
        ownerId: 'u-1',
        title: 'Low Risk Contract',
        fileName: 'low.pdf',
        contractType: 'SERVICE',
        jurisdiction: 'CO',
        locale: 'es',
        clauses: [
          createClause('cl-1', 'low'),
          createClause('cl-2', 'low'),
          createClause('cl-3', 'low'),
        ],
      });
      // 100 * (0) / (3*3) = 0
      expect(contract.calculateGlobalRiskScore()).toBe(0);
    });

    it('calculates score 33 for 1 MEDIUM clause', () => {
      const contract = new Contract({
        id: 'c-3',
        ownerId: 'u-1',
        title: 'Single Medium',
        fileName: 'medium.pdf',
        contractType: 'EMPLOYMENT',
        jurisdiction: 'CO',
        locale: 'es',
        clauses: [createClause('cl-1', 'medium')],
      });
      // 100 * (1*1) / (3*1) = 33.33 -> round 33
      expect(contract.calculateGlobalRiskScore()).toBe(33);
    });

    it('calculates weighted score accurately with mixed clauses (1 HIGH, 1 MEDIUM, 2 LOW)', () => {
      const contract = new Contract({
        id: 'c-4',
        ownerId: 'u-1',
        title: 'Mixed Contract',
        fileName: 'mixed.pdf',
        contractType: 'LEASE',
        jurisdiction: 'CO',
        locale: 'es',
        clauses: [
          createClause('cl-1', 'high'),
          createClause('cl-2', 'medium'),
          createClause('cl-3', 'low'),
          createClause('cl-4', 'low'),
        ],
      });
      // Total = 4 clauses, max = 12
      // points = 3*1 + 1*1 = 4
      // score = round(100 * 4 / 12) = 33
      expect(contract.calculateGlobalRiskScore()).toBe(33);
    });

    it('calculates weighted score for 6 clauses (2 HIGH, 2 MEDIUM, 2 LOW)', () => {
      const contract = new Contract({
        id: 'c-5',
        ownerId: 'u-1',
        title: 'Six Clauses',
        fileName: 'six.pdf',
        contractType: 'OTHER',
        jurisdiction: 'CO',
        locale: 'es',
        clauses: [
          createClause('cl-1', 'high'),
          createClause('cl-2', 'high'),
          createClause('cl-3', 'medium'),
          createClause('cl-4', 'medium'),
          createClause('cl-5', 'low'),
          createClause('cl-6', 'low'),
        ],
      });
      // Total = 6, max = 18
      // points = 3*2 + 1*2 = 8
      // score = round(100 * 8 / 18) = 44
      expect(contract.calculateGlobalRiskScore()).toBe(44);
    });
  });

  describe('Contract Entity Methods and Status Transitions', () => {
    it('filters flaggedClauses to only HIGH and MEDIUM', () => {
      const contract = new Contract({
        id: 'c-10',
        ownerId: 'u-1',
        title: 'Flags Test',
        fileName: 'test.pdf',
        contractType: 'LEASE',
        jurisdiction: 'CO',
        locale: 'es',
        clauses: [
          new Clause({ id: '1', orderIndex: 1, originalText: 'High', riskLevel: 'high', confidence: 0.9, plainExplanation: 'Exp' }),
          new Clause({ id: '2', orderIndex: 2, originalText: 'Low', riskLevel: 'low', confidence: 0.9, plainExplanation: 'Exp' }),
          new Clause({ id: '3', orderIndex: 3, originalText: 'Med', riskLevel: 'medium', confidence: 0.9, plainExplanation: 'Exp' }),
        ],
      });

      const flagged = contract.flaggedClauses();
      expect(flagged).toHaveLength(2);
      expect(flagged.map((c) => c.riskLevel)).toEqual(['high', 'medium']);
    });

    it('handles status transitions markReady and markFailed', () => {
      const contract = new Contract({
        id: 'c-11',
        ownerId: 'u-1',
        title: 'Transition Test',
        fileName: 'test.pdf',
        contractType: 'LEASE',
        jurisdiction: 'CO',
        locale: 'es',
      });

      expect(contract.status).toBe('UPLOADED');
      contract.markReady();
      expect(contract.status).toBe('READY');

      contract.markFailed('OCR error');
      expect(contract.status).toBe('FAILED');
      expect(contract.failureReason).toBe('OCR error');
    });
  });

  describe('Domain Exceptions Metadata', () => {
    it('contains correct status codes and message keys', () => {
      const unsupported = new UnsupportedFileTypeError('video/mp4');
      expect(unsupported.statusCode).toBe(415);
      expect(unsupported.messageKey).toBe('errors.unsupported_file_type');

      const tooLarge = new FileTooLargeError(10);
      expect(tooLarge.statusCode).toBe(413);
      expect(tooLarge.messageKey).toBe('errors.file_too_large');

      const noFlagged = new NoFlaggedClausesError();
      expect(noFlagged.statusCode).toBe(422);
      expect(noFlagged.messageKey).toBe('errors.no_flagged_clauses');

      const notFound = new ContractNotFoundError('123');
      expect(notFound.statusCode).toBe(404);
      expect(notFound.messageKey).toBe('errors.contract_not_found');

      const forbidden = new ContractOwnershipError('123');
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.messageKey).toBe('errors.forbidden');
    });
  });

  describe('Centralized Error Handler', () => {
    function mockResponse() {
      const res: Partial<Response> = {};
      res.status = (code: number) => {
        (res as { statusCode?: number }).statusCode = code;
        return res as Response;
      };
      res.json = (data: unknown) => {
        (res as { body?: unknown }).body = data;
        return res as Response;
      };
      return res as Response & { statusCode: number; body: unknown };
    }

    it('formats DomainError responses with code, message_key, details', () => {
      const res = mockResponse();
      const err = new UnsupportedFileTypeError('text/csv');
      errorHandler(err, {} as Request, res, () => {});

      expect(res.statusCode).toBe(415);
      expect(res.body).toEqual({
        code: 'UnsupportedFileTypeError',
        message_key: 'errors.unsupported_file_type',
        details: { mimeType: 'text/csv' },
      });
    });

    it('formats unknown generic Errors as 500 without leaking stack traces', () => {
      const res = mockResponse();
      const err = new Error('Database password connection timeout secret_token_xyz');
      errorHandler(err, {} as Request, res, () => {});

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({
        code: 'InternalServerError',
        message_key: 'errors.internal_error',
      });
    });
  });
});
