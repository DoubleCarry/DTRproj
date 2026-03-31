import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function toUserDTO(user) {
  return {
    id: user._id,
    name: user.name,
    username: user.username,
    role: user.role,
    goal: user.goal,
    targetDate: user.targetDate,
    dailyHours: user.dailyHours,
    overtimeEnabled: user.overtimeEnabled,
    lateTrackingEnabled: user.lateTrackingEnabled,
    scheduleStart: user.scheduleStart,
    scheduleEnd: user.scheduleEnd,
    lunchBreak: user.lunchBreak,
    manualHolidaysAdd: user.manualHolidaysAdd,
    manualHolidaysRemove: user.manualHolidaysRemove,
    exportProfile: user.exportProfile,
  };
}

router.post('/signup', async (req, res) => {
  const { name = '', username = '', password = '' } = req.body || {};
  const cleanName = String(name).trim();
  const cleanUsername = String(username).trim().toLowerCase();
  if (!cleanName || !cleanUsername || !password) return res.status(400).json({ error: 'Missing required fields' });
  if (!/^[a-z0-9_]+$/.test(cleanUsername)) return res.status(400).json({ error: 'Invalid username format' });
  if (String(password).length < 4) return res.status(400).json({ error: 'Password must be at least 4 chars' });

  const exists = await User.findOne({ username: cleanUsername }).lean();
  if (exists) return res.status(409).json({ error: 'Username already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name: cleanName,
    username: cleanUsername,
    passwordHash,
    role: 'user',
  });
  const token = signToken(user._id.toString());
  return res.status(201).json({ token, user: toUserDTO(user) });
});

router.post('/login', async (req, res) => {
  const { username = '', password = '' } = req.body || {};
  const cleanUsername = String(username).trim().toLowerCase();
  const user = await User.findOne({ username: cleanUsername });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken(user._id.toString());
  return res.json({ token, user: toUserDTO(user) });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id).lean();
  return res.json({ user: toUserDTO(user) });
});

export default router;

