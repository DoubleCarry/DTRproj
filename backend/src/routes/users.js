import express from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';

const router = express.Router();

router.use(requireAuth);

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

router.put('/me/settings', async (req, res) => {
  const body = req.body || {};
  const update = {
    name: typeof body.name === 'string' ? body.name.trim() : req.user.name,
    goal: Number(body.goal ?? req.user.goal),
    targetDate: String(body.targetDate ?? req.user.targetDate ?? ''),
    dailyHours: Number(body.dailyHours ?? req.user.dailyHours),
    overtimeEnabled: Boolean(body.overtimeEnabled ?? req.user.overtimeEnabled),
    lateTrackingEnabled: Boolean(body.lateTrackingEnabled ?? req.user.lateTrackingEnabled),
    scheduleStart: String(body.scheduleStart ?? req.user.scheduleStart),
    scheduleEnd: String(body.scheduleEnd ?? req.user.scheduleEnd),
    lunchBreak: body.lunchBreak || req.user.lunchBreak,
    manualHolidaysAdd: Array.isArray(body.manualHolidaysAdd) ? body.manualHolidaysAdd : req.user.manualHolidaysAdd,
    manualHolidaysRemove: Array.isArray(body.manualHolidaysRemove) ? body.manualHolidaysRemove : req.user.manualHolidaysRemove,
    exportProfile: body.exportProfile || req.user.exportProfile,
  };

  if (body.username && body.username !== req.user.username) {
    const username = String(body.username).trim().toLowerCase();
    if (!/^[a-z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Invalid username format' });
    const exists = await User.findOne({ username, _id: { $ne: req.user._id } }).lean();
    if (exists) return res.status(409).json({ error: 'Username already exists' });
    update.username = username;
  }

  if (body.currentPassword || body.newPassword || body.confirmPassword) {
    if (!body.currentPassword || !body.newPassword || !body.confirmPassword) {
      return res.status(400).json({ error: 'Password change fields incomplete' });
    }
    if (String(body.newPassword).length < 4) return res.status(400).json({ error: 'New password too short' });
    if (String(body.newPassword) !== String(body.confirmPassword)) return res.status(400).json({ error: 'Passwords do not match' });
    const userDoc = await User.findById(req.user._id);
    const ok = await bcrypt.compare(String(body.currentPassword), userDoc.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });
    update.passwordHash = await bcrypt.hash(String(body.newPassword), 10);
  }

  const updated = await User.findByIdAndUpdate(req.user._id, update, { new: true }).lean();
  return res.json({ user: toUserDTO(updated) });
});

export default router;

