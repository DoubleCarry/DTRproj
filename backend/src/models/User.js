import mongoose from 'mongoose';

const LunchBreakSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  start: { type: String, default: '11:20' },
  end: { type: String, default: '12:20' },
}, { _id: false });

const ExportInfoSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  value: { type: String, default: '' },
}, { _id: false });

const ExportProfileSchema = new mongoose.Schema({
  templateType: { type: String, default: 'quick' },
  title: { type: String, default: '' },
  logoUrl: { type: String, default: '' },
  organization: { type: String, default: '' },
  studentName: { type: String, default: '' },
  studentId: { type: String, default: '' },
  program: { type: String, default: '' },
  details: { type: String, default: '' },
  customTemplate: { type: String, default: '' },
  additionalInfo: { type: [ExportInfoSchema], default: [] },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  goal: { type: Number, default: 300 },
  targetDate: { type: String, default: '' },
  dailyHours: { type: Number, default: 8 },
  overtimeEnabled: { type: Boolean, default: true },
  lateTrackingEnabled: { type: Boolean, default: false },
  scheduleStart: { type: String, default: '08:00' },
  scheduleEnd: { type: String, default: '17:00' },
  lunchBreak: { type: LunchBreakSchema, default: () => ({}) },
  manualHolidaysAdd: { type: [String], default: [] },
  manualHolidaysRemove: { type: [String], default: [] },
  exportProfile: { type: ExportProfileSchema, default: () => ({}) },
}, { timestamps: true });

UserSchema.index({ username: 1 }, { unique: true });

export const User = mongoose.model('User', UserSchema);

