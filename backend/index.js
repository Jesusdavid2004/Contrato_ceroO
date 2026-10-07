const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PDFParse, VerbosityLevel } = require('pdf-parse');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'contratoclaro-dev-secret-change-in-prod';
const SALT_ROUNDS = 10;

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory user store (replace with PostgreSQL later) ─────────────────────
const users = new Map(); // email -> { id, name, email, passwordHash }
let userIdCounter = 1;

// ─── In-memory contract store ──────────────────────────────────────────────────
const contracts = new Map(); // contractId -> contract data

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  }
});

// ─── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── PDF extraction ────────────────────────────────────────────────────────────
async function extractPdfText(buffer) {
  const parser = new PDFParse({ verbosity: VerbosityLevel.ERRORS });
  const result = await parser.load(buffer);
  let text = '';
  for (let i = 1; i <= result.numPages; i++) {
    const page = await parser.getText(i);
    text += page.text + '\n\n';
  }
  return text;
}

// ─── Mock AI clause analyzer ───────────────────────────────────────────────────
async function analyzeClauses(text, locale) {
  await new Promise(resolve => setTimeout(resolve, 1500));

  let paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 20).slice(0, 6);

  if (paragraphs.length === 0) {
    paragraphs = [
      'The tenant shall pay all maintenance costs without limitation or prior notice.',
      'The landlord may terminate this contract at any time without reason.',
      'Disputes shall be resolved exclusively by arbitration chosen by the landlord.',
      'This agreement automatically renews unless cancelled 90 days in advance.',
      'The tenant waives all rights to legal representation in disputes.',
    ];
  }

  const riskCycle = ['low', 'high', 'medium', 'high', 'medium', 'low'];

  return paragraphs.map((clauseText, index) => {
    const risk = riskCycle[index % riskCycle.length];
    return {
      id: `clause-${index}`,
      text: clauseText.trim(),
      risk_level: risk,
      plain_explanation: locale === 'es'
        ? `Esta cláusula presenta un riesgo ${risk} para el firmante porque impone condiciones desfavorables.`
        : `This clause presents a ${risk} risk for the signing party due to unfavorable conditions.`,
      legal_reasoning: locale === 'es'
        ? 'Puede contravenir los principios de equidad contractual y protección al consumidor.'
        : 'May contradict principles of contractual fairness and consumer protection rights.'
    };
  });
}

// ─── Routes: Health ────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ─── Routes: Auth ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(422).json({ error: 'name, email, and password are required' });
    }
    if (password.length < 8) {
      return res.status(422).json({ error: 'Password must be at least 8 characters' });
    }
    if (users.has(email)) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const id = String(userIdCounter++);
    const user = { id, name, email, passwordHash };
    users.set(email, user);

    const token = jwt.sign({ id, name, email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id, name, email } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(422).json({ error: 'email and password are required' });
    }

    const user = users.get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, name: user.name, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ─── Routes: Contracts (protected) ────────────────────────────────────────────
app.post('/api/contracts/analyze', requireAuth, upload.single('contract'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const locale = req.body.locale || 'en';
    let extractedText = '';

    if (req.file.mimetype === 'application/pdf') {
      extractedText = await extractPdfText(req.file.buffer);
    } else {
      extractedText = 'Mocked OCR image text.\n\nAnother paragraph from scanned image.\n\nA risky clause hiding unexpected fees and liability transfer.';
    }

    const clauses = await analyzeClauses(extractedText, locale);

    let score = 0;
    clauses.forEach(c => {
      if (c.risk_level === 'high') score += 25;
      if (c.risk_level === 'medium') score += 10;
    });
    const global_risk_score = Math.min(100, score);

    const contractId = `contract-${Date.now()}`;
    const contractData = {
      id: contractId,
      user_id: req.user.id,
      file_name: req.file.originalname,
      uploaded_at: new Date().toISOString(),
      global_risk_score,
      clauses
    };
    contracts.set(contractId, contractData);

    res.json(contractData);
  } catch (err) {
    console.error('Error analyzing contract:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/contracts', requireAuth, (_req, res) => {
  const userContracts = [...contracts.values()]
    .filter(c => c.user_id === _req.user.id)
    .map(({ id, file_name, uploaded_at, global_risk_score }) => ({ id, file_name, uploaded_at, global_risk_score }));
  res.json(userContracts);
});

app.delete('/api/contracts/:id', requireAuth, (req, res) => {
  const contract = contracts.get(req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contract not found' });
  if (contract.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  contracts.delete(req.params.id);
  res.json({ message: 'Contract deleted' });
});

// ─── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  if (err.message === 'Unsupported file type') {
    return res.status(415).json({ error: 'Unsupported file type. Upload a PDF or image.' });
  }
  res.status(500).json({ error: err.message });
});

app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
});
