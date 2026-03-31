import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import sessionsRoutes from './routes/sessions.js';
import { User } from './models/User.js';
import bcrypt from 'bcryptjs';

const app = express();
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'dtr-backend' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/sessions', sessionsRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT || 4000);

async function ensureAdminSeed() {
  const adminUser = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  const adminPass = (process.env.ADMIN_PASSWORD || '').trim();
  const adminName = (process.env.ADMIN_NAME || 'Administrator').trim();
  if (!adminUser || !adminPass) return;
  const existing = await User.findOne({ username: adminUser }).lean();
  const hash = await bcrypt.hash(adminPass, 10);
  if (!existing) {
    await User.create({
      username: adminUser,
      name: adminName,
      passwordHash: hash,
      role: 'admin',
      goal: 300,
      dailyHours: 8,
      scheduleStart: '08:00',
      scheduleEnd: '17:00',
    });
    console.log(`Admin seeded: ${adminUser}`);
    return;
  }
  if (existing.role !== 'admin') {
    await User.updateOne({ _id: existing._id }, { role: 'admin', passwordHash: hash, name: adminName });
    console.log(`Admin promoted: ${adminUser}`);
  }
}

connectDB(process.env.MONGODB_URI)
  .then(async () => {
    await ensureAdminSeed();
    app.listen(port, () => {
      console.log(`DTR backend running at http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect DB', err);
    process.exit(1);
  });

