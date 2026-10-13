import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import type { UploadContractUseCase } from '../../application/use-cases/UploadContractUseCase';
import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import { requireAuth } from '../middleware/authMiddleware';
import { aiIpLimiter, aiUserLimiter, uploadLimiter } from '../middleware/rateLimiter';
import { ContractNotFoundError, ContractOwnershipError } from '../../domain/exceptions/index';
import type { InProcessAnalysisWorker } from '../../infrastructure/services/InProcessAnalysisWorker';
import { FileValidator } from '../../infrastructure/services/FileValidator';
import type { GenerateObjectionLetterUseCase } from '../../application/use-cases/GenerateObjectionLetterUseCase';
import type { DownloadObjectionLetterPdfUseCase } from '../../application/use-cases/DownloadObjectionLetterPdfUseCase';
import type { UpdateObjectionLetterUseCase } from '../../application/use-cases/UpdateObjectionLetterUseCase';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export function createContractRouter(deps: {
  uploadContractUseCase: UploadContractUseCase;
  contractRepository: ContractRepository;
  analysisWorker?: InProcessAnalysisWorker;
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

        const result = await deps.uploadContractUseCase.execute({
          userId: req.user!.id,
          fileBuffer: req.file.buffer,
          originalName: req.file.originalname,
          contractType: req.body.contract_type || req.body.contractType,
          jurisdiction: req.body.jurisdiction,
          locale: req.body.locale,
          title: req.body.title,
        });
        if (deps.analysisWorker) {
          const validatedFile = FileValidator.validate(req.file.buffer, req.file.originalname);
          deps.analysisWorker.enqueue({
            contractId: result.id,
            userId: req.user!.id,
            fileBuffer: validatedFile.buffer,
            mimeType: validatedFile.detectedMime,
          });
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

      res.status(200).json(contract.toJSON());
    } catch (err) {
      next(err);
    }
  });

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
        const letter = await deps.generateObjectionLetterUseCase.execute({
          contractId: String(req.params.id),
          userId: req.user!.id,
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

  router.put('/:id/letter', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const letter = await deps.updateObjectionLetterUseCase.execute({
        contractId: String(req.params.id),
        userId: req.user!.id,
        content: typeof req.body?.content === 'string' ? req.body.content : '',
      });
      res.status(200).json(letter.toJSON());
    } catch (err) {
      next(err);
    }
  });

  return router;
}
