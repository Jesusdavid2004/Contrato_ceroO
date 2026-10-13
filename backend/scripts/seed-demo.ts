import { randomUUID } from 'node:crypto';
import { PasswordService } from '../src/infrastructure/security/SecurityServices';
import { PostgresUserRepository } from '../src/infrastructure/repositories/UserRepositoryImpl';
import { PostgresContractRepository } from '../src/infrastructure/repositories/ContractRepositoryImpl';
import { User } from '../src/domain/entities/User';
import { Contract } from '../src/domain/entities/Contract';
import { Clause } from '../src/domain/entities/Clause';
import { pool } from '../src/infrastructure/database/pool';
import { config } from '../src/shared/config';

const DEMO_USER_NAME = 'Demo User';

async function main(): Promise<void> {
  if (config.NODE_ENV !== 'development') {
    throw new Error('Demo data can only be seeded when NODE_ENV=development.');
  }

  const email = process.env.DEMO_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.DEMO_USER_PASSWORD;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Set a valid DEMO_USER_EMAIL before seeding demo data.');
  }
  if (!password || password.length < 12) {
    throw new Error('Set DEMO_USER_PASSWORD to a unique value of at least 12 characters.');
  }

  const users = new PostgresUserRepository(pool);
  const contracts = new PostgresContractRepository(pool);
  let user = await users.findByEmail(email);
  if (user && !(await PasswordService.compare(password, user.passwordHash))) {
    throw new Error('DEMO_USER_EMAIL already exists; provide its matching DEMO_USER_PASSWORD.');
  }
  if (!user) {
    user = new User({
      id: randomUUID(),
      name: DEMO_USER_NAME,
      email,
      passwordHash: await PasswordService.hash(password),
    });
    await users.save(user);
  }

  const demoContractId = `demo-contract-${user.id}`;
  const contract = new Contract({
    id: demoContractId,
    ownerId: user.id,
    title: 'Contrato de arrendamiento de demostración',
    fileName: 'demo-content-not-an-original-file.pdf',
    contractType: 'LEASE',
    jurisdiction: 'CO',
    locale: 'es',
    status: 'READY',
    clauses: [
      new Clause({
        id: `${demoContractId}-high`,
        contractId: demoContractId,
        orderIndex: 1,
        originalText: 'El contrato tendrá renovación automática anual salvo aviso escrito.',
        riskLevel: 'high',
        confidence: 0.95,
        plainExplanation: 'El contrato podría renovarse por otro período si no se envía un aviso a tiempo.',
        whyRisky: 'La persona podría pasar por alto el plazo de aviso.',
        suggestedChange: 'Solicitar un recordatorio y un plazo razonable para cancelar.',
      }),
      new Clause({
        id: `${demoContractId}-medium`,
        contractId: demoContractId,
        orderIndex: 2,
        originalText: 'La administración podrá cambiar unilateralmente las reglas de uso.',
        riskLevel: 'medium',
        confidence: 0.88,
        plainExplanation: 'Una sola parte podría cambiar las reglas durante el contrato.',
        whyRisky: 'No se especifica un proceso de acuerdo mutuo.',
        suggestedChange: 'Solicitar aviso previo y aceptación por escrito de ambas partes.',
      }),
      new Clause({
        id: `${demoContractId}-low`,
        contractId: demoContractId,
        orderIndex: 3,
        originalText: 'Los avisos se enviarán a las direcciones informadas por cada parte.',
        riskLevel: 'low',
        confidence: 0.97,
        plainExplanation: 'La cláusula describe cómo se envían las notificaciones.',
      }),
    ],
  });
  await contracts.save(contract);

  console.log(`Demo data is ready for ${email}. No original contract file was stored.`);
}

main()
  .catch((error: unknown) => {
    console.error('Demo data seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
