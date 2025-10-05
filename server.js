import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { appendFile, mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, 'data');
const STORE_FILE = join(DATA_DIR, 'store.json');
const CONTACT_LOG = join(DATA_DIR, 'contact.log');

const defaultProjects = [
  { name: 'Deal Screener', desc: 'Rank companies by traction and unit economics.', link: '#' },
  { name: 'Portfolio Dashboard', desc: 'Tracks positions & risk.', link: '#' },
  { name: 'Class Scheduler', desc: 'Simple web app to optimize course schedules.', link: '#' }
];

const defaultStore = {
  endorsements: 0,
  visitors: 0,
  projects: defaultProjects
};

const clone = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

class JsonStore {
  constructor(file, defaults) {
    this.file = file;
    this.defaults = defaults;
    this.cache = null;
    this.queue = Promise.resolve();
  }

  async init() {
    await mkdir(DATA_DIR, { recursive: true });
    if (!existsSync(this.file)) {
      this.cache = clone(this.defaults);
      await this.persist();
      return;
    }

    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.cache = this.normalize(parsed);
    } catch (error) {
      console.error('Failed to read store file, recreating with defaults.', error);
      this.cache = clone(this.defaults);
      await this.persist();
    }
  }

  normalize(data) {
    const base = clone(this.defaults);
    const normalized = {
      ...base,
      ...data,
      endorsements: Number.isFinite(data?.endorsements) ? Math.max(0, Math.trunc(data.endorsements)) : base.endorsements,
      visitors: Number.isFinite(data?.visitors) ? Math.max(0, Math.trunc(data.visitors)) : base.visitors,
      projects: Array.isArray(data?.projects) && data.projects.length > 0 ? data.projects : base.projects
    };
    return normalized;
  }

  async persist() {
    await writeFile(this.file, JSON.stringify(this.cache, null, 2));
  }

  async get() {
    if (!this.cache) {
      await this.init();
    }
    return clone(this.cache);
  }

  async update(mutator) {
    if (!this.cache) {
      await this.init();
    }

    const task = this.queue.then(async () => {
      const draft = clone(this.cache);
      const result = await mutator(draft);
      this.cache = this.normalize(draft);
      await this.persist();
      return result ?? clone(this.cache);
    });

    this.queue = task.catch((error) => {
      console.error('Store update failed:', error);
      this.cache = clone(this.cache ?? this.defaults);
    }).then(() => undefined);

    return task;
  }
}

const store = new JsonStore(STORE_FILE, defaultStore);

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? '*';
app.use(cors({
  origin: allowedOrigins,
  credentials: false
}));

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(express.json({ limit: '10kb' }));

const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', generalLimiter);

const contactLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many contact attempts. Please try again later.' }
});

const contactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(1).max(2000)
});

const escapeHtml = (value) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/endorse', async (_req, res, next) => {
  try {
    const data = await store.get();
    res.json({ count: data.endorsements });
  } catch (error) {
    next(error);
  }
});

app.post('/api/endorse', async (_req, res, next) => {
  try {
    const result = await store.update((data) => {
      data.endorsements = (data.endorsements ?? 0) + 1;
      return { count: data.endorsements };
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/visitors', async (_req, res, next) => {
  try {
    const result = await store.update((data) => {
      data.visitors = (data.visitors ?? 0) + 1;
      return { total: data.visitors };
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/projects', async (_req, res, next) => {
  try {
    const data = await store.get();
    res.json(data.projects ?? defaultProjects);
  } catch (error) {
    next(error);
  }
});

app.post('/api/contact', contactLimiter, async (req, res, next) => {
  try {
    const payload = contactSchema.parse(req.body ?? {});
    const safeEntry = {
      ...payload,
      name: escapeHtml(payload.name),
      email: escapeHtml(payload.email),
      message: escapeHtml(payload.message),
      receivedAt: new Date().toISOString(),
      ipHash: createHash('sha256').update(req.ip ?? '').digest('hex')
    };

    await store.update((data) => {
      data.lastContactAt = safeEntry.receivedAt;
    });

    await mkdir(DATA_DIR, { recursive: true });
    await appendFile(CONTACT_LOG, JSON.stringify(safeEntry) + '\n');

    res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid contact submission', issues: error.flatten() });
      return;
    }
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((error, _req, res, _next) => {
  console.error('Unexpected error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception', error);
});
