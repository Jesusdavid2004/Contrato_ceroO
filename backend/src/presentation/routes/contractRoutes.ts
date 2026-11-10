import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import type { UploadContractUseCase } from '../../application/use-cases/UploadContractUseCase';
import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import { requireAuth } from '../middleware/authMiddleware';
import { aiIpLimiter, aiUserLimiter, uploadLimiter } from '../middleware/rateLimiter';
import {
  ContractNotFoundError,
  ContractOwnershipError,
  ContractNotReadyError,
  FactNotFoundError,
  FactTransitionError,
  ClauseNotFoundError,
} from '../../domain/exceptions/index';
import type { AnalysisJobQueue } from '../../domain/services/AnalysisJobs';
import { FileValidator } from '../../infrastructure/services/FileValidator';
import type { GenerateObjectionLetterUseCase } from '../../application/use-cases/GenerateObjectionLetterUseCase';
import type { DownloadObjectionLetterPdfUseCase } from '../../application/use-cases/DownloadObjectionLetterPdfUseCase';
import type { UpdateObjectionLetterUseCase } from '../../application/use-cases/UpdateObjectionLetterUseCase';
import type { FileStorage } from '../../domain/services/InfrastructureInterfaces';
import type { AnalysisEventPublisher } from '../../domain/services/AnalysisEventPublisher';
import type { AnalysisStaging } from '../../domain/services/AnalysisStaging';
import { stagingUriFor } from '../../domain/services/AnalysisStaging';
import type { FactsRepository } from '../../domain/repositories/FactsRepository';
import type { ProposalsRepository } from '../../domain/repositories/ProposalsRepository';
import type { CreateClauseProposalUseCase, UpdateClauseProposalUseCase } from '../../application/use-cases/ProposalUseCases';
import { config } from '../../shared/config';
import { logger } from '../../shared/logger';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

import { uploadContractBodySchema, updateLetterBodySchema, generateLetterBodySchema, confirmFactBodySchema, createProposalBodySchema, updateProposalBodySchema } from '../schemas/contractSchemas';
import { validateBody } from '../middleware/validationMiddleware';

export function createContractRouter(deps: {
  uploadContractUseCase: UploadContractUseCase;
  contractRepository: ContractRepository;
  fileStorage?: FileStorage;
  jobQueue?: AnalysisJobQueue;
  eventPublisher?: AnalysisEventPublisher;
  staging?: AnalysisStaging;
  factsRepository?: FactsRepository;
  proposalsRepository?: ProposalsRepository;
  createProposalUseCase?: CreateClauseProposalUseCase;
  updateProposalUseCase?: UpdateClauseProposalUseCase;
  generateObjectionLetterUseCase: GenerateObjectionLetterUseCase;
  downloadObjectionLetterPdfUseCase: DownloadObjectionLetterPdfUseCase;
  updateObjectionLetterUseCase: UpdateObjectionLetterUseCase;
}): Router {
  const router = Router();

  // POST / (Upload contract)
  router.post(
    '/',
    requireAuth,
    uploadLimiter,
    upload.single('contract'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.file) {
          res.status(400).json({
            code: 'MissingFileError',
            message_key: 'errors.no_file_uploaded',
            error: 'No file uploaded',
          });
          return;
        }

        const validatedBody = uploadContractBodySchema.parse(req.body || {});

        const result = await deps.uploadContractUseCase.execute({
          userId: req.user!.id,
          fileBuffer: req.file.buffer,
          originalName: req.file.originalname,
          contractType: validatedBody.contract_type || validatedBody.contractType,
          jurisdiction: validatedBody.jurisdiction as any,
          locale: validatedBody.locale,
          title: validatedBody.title,
          userRole: validatedBody.user_role || validatedBody.userRole,
        });
        if (deps.eventPublisher) {
          try {
            await deps.eventPublisher.publish({
              contractId: result.id,
              userId: req.user!.id,
              jobId: result.id,
              type: 'stage',
              payload: { status: 'UPLOADED' },
              occurredAt: new Date(),
            });
          } catch (error) {
            logger.error('Upload event publish failed', {
              contractId: result.id,
              errorName: error instanceof Error ? error.name : 'UnknownError',
            });
          }
        }
        if (!deps.jobQueue || !deps.staging) {
          throw new Error('Analysis pipeline is not wired in this router.');
        }
        const validatedFile = FileValidator.validate(req.file.buffer, req.file.originalname);
        try {
          await deps.staging.stage(
            result.id,
            { buffer: validatedFile.buffer, mimeType: validatedFile.detectedMime },
            config.STAGING_TTL_MS,
          );
        } catch (error) {
          logger.error('Analysis staging failed', {
            contractId: result.id,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          });
        }
        try {
          await deps.jobQueue.enqueue({
            contractId: result.id,
            userId: req.user!.id,
            stagingKey: result.id,
            mimeType: validatedFile.detectedMime,
          });
        } catch (error) {
          // Cola caida: estado terminal honesto en vez de UPLOADED eterno.
          logger.error('Analysis enqueue failed', {
            contractId: result.id,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          });
          const failed = await deps.contractRepository.findById(result.id);
          if (failed && failed.ownerId === req.user!.id) {
            failed.markFailed('errors.analysis_failed');
            await deps.contractRepository.save(failed);
            try {
              await deps.eventPublisher?.publish({
                contractId: failed.id,
                userId: req.user!.id,
                jobId: failed.id,
                type: 'failed',
                payload: { status: 'FAILED', failureMessageKey: 'errors.analysis_failed' },
                occurredAt: new Date(),
              });
            } catch {
              // El estado ya quedo persistido; el aviso es mejor esfuerzo.
            }
          }
        }

        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET / (List user's contracts)
  router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contracts = await deps.contractRepository.findByOwnerId(req.user!.id);
      res.status(200).json(contracts.map((c) => c.toJSON()));
    } catch (err) {
      next(err);
    }
  });

  // GET /:id/status (Poll analysis progress)
  router.get('/:id/status', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contractId = String(req.params.id);
      const contract = await deps.contractRepository.findById(contractId);
      if (!contract) {
        throw new ContractNotFoundError(contractId);
      }
      if (contract.ownerId !== req.user!.id) {
        throw new ContractOwnershipError(contractId);
      }
      res.status(200).json({
        id: contract.id,
        status: contract.status,
        failure_message_key: contract.failureReason,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /:id (Get single contract)
  router.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contractId = String(req.params.id);
      const contract = await deps.contractRepository.findById(contractId);
      if (!contract) {
        throw new ContractNotFoundError(contractId);
      }
      if (contract.ownerId !== req.user!.id) {
        throw new ContractOwnershipError(contractId);
      }

      const facts = await deps.factsRepository?.getFacts(contractId) ?? [];
      res.status(200).json({
        ...contract.toJSON(),
        facts: facts.map((fact) => ({
          key: fact.key,
          value: fact.value,
          status: fact.status,
          evidence_clause_id: fact.evidenceClauseId,
          evidence_quote: fact.evidenceQuote,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // PUT /:id/facts (Confirm or correct an extracted fact before use)
  router.put('/:id/facts', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contractId = String(req.params.id);
      const body = confirmFactBodySchema.parse(req.body || {});
      const contract = await deps.contractRepository.findById(contractId);
      if (!contract) {
        throw new ContractNotFoundError(contractId);
      }
      if (contract.ownerId !== req.user!.id) {
        throw new ContractOwnershipError(contractId);
      }
      if (contract.status !== 'READY') {
        throw new ContractNotReadyError(contractId);
      }
      if (!deps.factsRepository) {
        throw new FactNotFoundError(contractId, body.key);
      }
      const current = (await deps.factsRepository.getFacts(contractId))
        .find((fact) => fact.key === body.key);
      if (!current) {
        throw new FactNotFoundError(contractId, body.key);
      }
      const nextValue = body.status === 'corrected' ? (body.value ?? null) : current.value;
      if (body.status === 'corrected' && !nextValue) {
        throw new FactTransitionError(body.key, body.status);
      }
      if (body.status === 'confirmed' && body.value !== undefined) {
        throw new FactTransitionError(body.key, body.status);
      }
      if (current.status === 'not_found' && body.status === 'confirmed') {
        throw new FactTransitionError(body.key, body.status);
      }
      if (current.status === 'confirmed' && body.status === 'confirmed') {
        throw new FactTransitionError(body.key, body.status);
      }
      const updated = await deps.factsRepository.updateFact(
        contractId,
        body.key,
        nextValue,
        body.status,
      );
      if (!updated) {
        throw new FactNotFoundError(contractId, body.key);
      }
      res.status(200).json({
        key: updated.key,
        value: updated.value,
        status: updated.status,
        evidence_clause_id: updated.evidenceClauseId,
        evidence_quote: updated.evidenceQuote,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /:id/clauses/:clauseId/proposals (Propose an adjustment as draft)
  router.post(
    '/:id/clauses/:clauseId/proposals',
    requireAuth,
    validateBody(createProposalBodySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!deps.createProposalUseCase || !deps.proposalsRepository) {
          throw new Error('Clause proposals are not wired in this router.');
        }
        const proposal = await deps.createProposalUseCase.execute({
          contractId: String(req.params.id),
          userId: req.user!.id,
          clauseId: String(req.params.clauseId),
          proposedText: req.body.proposed_text,
          reason: req.body.reason,
        });
        res.status(201).json(proposal.toJSON());
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /:id/proposals (List own clause proposals)
  router.get('/:id/proposals', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contractId = String(req.params.id);
      const contract = await deps.contractRepository.findById(contractId);
      if (!contract) {
        throw new ContractNotFoundError(contractId);
      }
      if (contract.ownerId !== req.user!.id) {
        throw new ContractOwnershipError(contractId);
      }
      const proposals = await deps.proposalsRepository?.listByContract(contractId) ?? [];
      res.status(200).json(proposals.map((proposal) => proposal.toJSON()));
    } catch (err) {
      next(err);
    }
  });

  // PUT /proposals/:proposalId (Edit draft, accept for draft, or discard)
  router.put(
    '/proposals/:proposalId',
    requireAuth,
    validateBody(updateProposalBodySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!deps.updateProposalUseCase) {
          throw new Error('Clause proposals are not wired in this router.');
        }
        const proposal = await deps.updateProposalUseCase.execute({
          proposalId: String(req.params.proposalId),
          userId: req.user!.id,
          action: req.body.action,
          proposedText: req.body.proposed_text,
          reason: req.body.reason,
        });
        res.status(200).json(proposal.toJSON());
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /:id (Delete contract with ownership check)
  router.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contractId = String(req.params.id);
      const contract = await deps.contractRepository.findById(contractId);
      if (!contract) {
        throw new ContractNotFoundError(contractId);
      }
      if (contract.ownerId !== req.user!.id) {
        throw new ContractOwnershipError(contractId);
      }

      if (deps.fileStorage) {
        if (contract.storageUri) {
          await deps.fileStorage.delete(contract.storageUri);
        }
        await deps.fileStorage.delete(contractId);
      }
      if (deps.staging) {
        try {
          await deps.staging.remove(stagingUriFor(contractId));
        } catch {
          // El borrado del contrato no depende del staging.
        }
      }
      await deps.jobQueue?.cancelForContract(contractId);
      await deps.contractRepository.delete(contractId);
      res.status(200).json({ message: 'Contract deleted' });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/:id/letter',
    requireAuth,
    aiIpLimiter,
    aiUserLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = generateLetterBodySchema.parse(req.body || {});
        const letter = await deps.generateObjectionLetterUseCase.execute({
          contractId: String(req.params.id),
          userId: req.user!.id,
          clauseIds: body.clause_ids,
          recipient: body.recipient,
          purpose: body.purpose,
          tone: body.tone,
        });
        res.status(201).json(letter.toJSON());
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/:id/letter/pdf', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pdf = await deps.downloadObjectionLetterPdfUseCase.execute({
        contractId: String(req.params.id),
        userId: req.user!.id,
      });
      const filename = pdf.contractTitle
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)
        .toLowerCase() || 'objection-letter';
      res
        .status(200)
        .type('application/pdf')
        .attachment(`${filename}.pdf`)
        .send(pdf.buffer);
    } catch (err) {
      next(err);
    }
  });

  router.put(
    '/:id/letter',
    requireAuth,
    validateBody(updateLetterBodySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const letter = await deps.updateObjectionLetterUseCase.execute({
          contractId: String(req.params.id),
          userId: req.user!.id,
          content: req.body.content,
        });
        res.status(200).json(letter.toJSON());
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
