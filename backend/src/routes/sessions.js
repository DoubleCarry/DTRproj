import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Session } from '../models/Session.js';

const router = express.Router();
router.use(requireAuth);

router.get('/me', async (req, res) => {
  const sessions = await Session.find({ userId: req.user._id }).sort({ date: -1, createdAt: -1 }).lean();
  return res.json({ sessions });
});

router.post('/me', async (req, res) => {
  const body = req.body || {};
  if (!body.date) return res.status(400).json({ error: 'date is required' });
  const created = await Session.create({
    userId: req.user._id,
    date: String(body.date),
    timeIn: body.timeIn ?? '--',
    timeOut: body.timeOut ?? '--',
    hours: Number(body.hours ?? 0),
    overtime: Number(body.overtime ?? 0),
    source: body.source ?? 'manual',
    note: body.note ?? '',
    absent: Boolean(body.absent ?? false),
    late: Boolean(body.late ?? false),
    undertime: Boolean(body.undertime ?? false),
  });
  return res.status(201).json({ session: created });
});

router.put('/me/:id', async (req, res) => {
  const updated = await Session.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    req.body || {},
    { new: true },
  ).lean();
  if (!updated) return res.status(404).json({ error: 'Session not found' });
  return res.json({ session: updated });
});

router.delete('/me/:id', async (req, res) => {
  const deleted = await Session.findOneAndDelete({ _id: req.params.id, userId: req.user._id }).lean();
  if (!deleted) return res.status(404).json({ error: 'Session not found' });
  return res.json({ ok: true });
});

router.delete('/me', async (req, res) => {
  await Session.deleteMany({ userId: req.user._id });
  return res.json({ ok: true });
});

export default router;

