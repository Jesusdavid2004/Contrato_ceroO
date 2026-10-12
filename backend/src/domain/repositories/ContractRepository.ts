import { Contract } from '../entities/Contract';
import { ObjectionLetter } from '../entities/ObjectionLetter';

export interface ContractRepository {
  findById(id: string): Promise<Contract | null>;
  findByOwnerId(ownerId: string): Promise<Contract[]>;
  save(contract: Contract): Promise<void>;
  updateStatus(id: string, status: string, failureReason?: string | null): Promise<void>;
  delete(id: string): Promise<void>;
  saveObjectionLetter(letter: ObjectionLetter): Promise<void>;
  getObjectionLetter(contractId: string): Promise<ObjectionLetter | null>;
}
