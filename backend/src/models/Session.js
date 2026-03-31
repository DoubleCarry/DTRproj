import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: String, required: true },
  timeIn: { type: String, default: '--' },
  timeOut: { type: String, default: '--' },
  hours: { type: Number, default: 0 },
  overtime: { type: Number, default: 0 },
  source: { type: String, default: 'manual' },
  note: { type: String, default: '' },
  absent: { type: Boolean, default: false },
  late: { type: Boolean, default: false },
  undertime: { type: Boolean, default: false },
}, { timestamps: true });

SessionSchema.index({ userId: 1, date: -1 });

export const Session = mongoose.model('Session', SessionSchema);

