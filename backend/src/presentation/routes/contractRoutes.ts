import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import type { UploadContractUseCase } from '../../application/use-cases/UploadContractUseCase';
import type { ContractRepository } from '../../domain/repositories/ContractRepository';
import { requireAuth } from '../middleware/authMiddleware';
import { uploadLimiter } from '../middleware/rateLimiter';
import { ContractNotFoundError, ContractOwnershipError } from '../../domain/exceptions/index';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export function createContractRouter(deps: {
  uploadContractUseCase: UploadContractUseCase;
  contractRepository: ContractRepository;
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

  return router;
}
