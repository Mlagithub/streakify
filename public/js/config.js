// config.js - Shared Configuration for Frontend and Backend
// This file is used by both the server and client

/**
 * Habit Categories Configuration
 * Used for classifying habits with icons and colors
 */
const HabitCategories = {
  life: { name: '生活', icon: '🏠', color: '#6366f1' },
  health: { name: '健康', icon: '💪', color: '#10b981' },
  study: { name: '学习', icon: '📚', color: '#f59e0b' },
  work: { name: '工作', icon: '💼', color: '#8b5cf6' },
  other: { name: '其他', icon: '📌', color: '#64748b' }
};

/**
 * Identity Labels Configuration
 * Used for habit identity association
 */
const IdentityLabels = {
  health: { name: '健康的我', icon: '🏃', color: '#10b981' },
  disciplined: { name: '自律的我', icon: '💪', color: '#6366f1' },
  learning: { name: '学习的我', icon: '📚', color: '#f59e0b' },
  wealthy: { name: '财富的我', icon: '💰', color: '#8b5cf6' },
  social: { name: '关系的我', icon: '❤️', color: '#ec4899' },
  creative: { name: '创造的我', icon: '🎨', color: '#f97316' }
};

/**
 * Preset Tags Configuration
 */
const PresetTags = [
  { name: '自律', color: '#6366f1' },
  { name: '健康', color: '#10b981' },
  { name: '成长', color: '#f59e0b' },
  { name: '财富', color: '#8b5cf6' },
  { name: '关系', color: '#ec4899' }
];

/**
 * Reminder Periods Configuration
 */
const ReminderPeriods = {
  morning: { name: '早晨', time: '6:00-9:00', icon: '🌅' },
  forenoon: { name: '上午', time: '9:00-12:00', icon: '☀️' },
  afternoon: { name: '下午', time: '12:00-18:00', icon: '🌤️' },
  evening: { name: '晚间', time: '18:00-22:00', icon: '🌙' },
  custom: { name: '自定义', time: '', icon: '⏰' }
};

/**
 * Skip Reasons Configuration
 */
const SkipReasons = ['忘了', '太忙', '身体不适', '其他'];

/**
 * Repeat Mode Configuration
 */
const RepeatModes = {
  new_record: { name: '重复模式', icon: '🔁', desc: '每次打卡创建新记录' },
  append: { name: '追加模式', icon: '📝', desc: '内容追加到同一条记录' }
};

/**
 * Default Habit Icons Mapping
 */
const HabitIcons = {
  '早餐': '🌅', '午餐': '☀️', '晚餐': '🌙',
  '站桩': '🧘', '阅读': '📖', '起床': '🌤️', '上床': '🌃',
  '零食': '🍪', '三省吾身': '🤔', '运动': '🏃',
  '冥想': '🧠', '喝水': '💧', '早睡': '😴',
  '写作': '✍️', '学习': '📝', '日记': '📓'
};

/**
 * Badge Levels Configuration
 */
const BadgeLevels = {
  bronze: { minStreak: 7, emoji: '🥉', name: '铜牌' },
  silver: { minStreak: 30, emoji: '🥈', name: '银牌' },
  gold: { minStreak: 100, emoji: '🥇', name: '金牌' }
};

/**
 * Valid Categories (for backend validation)
 */
const VALID_CATEGORIES = Object.keys(HabitCategories);

/**
 * Valid Repeat Modes (for backend validation)
 */
const VALID_REPEAT_MODES = Object.keys(RepeatModes);

/**
 * Valid Reminder Periods (for backend validation)
 */
const VALID_REMINDER_PERIODS = Object.keys(ReminderPeriods);

/**
 * Validation Constraints
 */
const ValidationConfig = {
  noteMaxLength: 500,
  nameMaxLength: 100,
  defaultPageSize: 100
};

// Expose as global variables for non-module script loading
if (typeof window !== 'undefined') {
  window.HabitCategories = HabitCategories;
  window.IdentityLabels = IdentityLabels;
  window.PresetTags = PresetTags;
  window.ReminderPeriods = ReminderPeriods;
  window.SkipReasons = SkipReasons;
  window.RepeatModes = RepeatModes;
  window.HabitIcons = HabitIcons;
  window.BadgeLevels = BadgeLevels;
  window.ValidationConfig = ValidationConfig;
}

// CommonJS export (for Node.js/server)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    HabitCategories,
    IdentityLabels,
    PresetTags,
    ReminderPeriods,
    SkipReasons,
    RepeatModes,
    HabitIcons,
    BadgeLevels,
    VALID_CATEGORIES,
    VALID_REPEAT_MODES,
    VALID_REMINDER_PERIODS,
    ValidationConfig
  };
}