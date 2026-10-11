// The review form's English and Japanese text. Kept apart from the app
// dictionary because sending needs the English labels while the form shows
// Japanese, so the sheet reads the same whichever language filled the form in.
//
// Ported from the old app's js/review.js.

export type ReviewLang = "en" | "ja";
export type LevelKey = "beginner" | "hobbyist" | "pro";
export type FeatureKey = "walk-guide" | "progress-track" | "rewards" | "analysis-tools" | "photo-sharing";

export const LEVEL_KEYS: readonly LevelKey[] = ["beginner", "hobbyist", "pro"];
export const FEATURE_KEYS: readonly FeatureKey[] = ["walk-guide", "progress-track", "rewards", "analysis-tools", "photo-sharing"];

export interface ReviewStrings {
  feedback: string;
  ratingAria: string;
  star: (n: number) => string;
  levelLabel: string;
  levels: Record<LevelKey, string>;
  featuresLabel: string;
  featuresHint: string;
  features: Record<FeatureKey, string>;
  improveLabel: string;
  optionalHint: string;
  improvePlaceholder: string;
  send: string;
  blank: string;
  pendingOne: string;
  pendingMany: (n: number) => string;
  thanks: string;
}

export const REVIEW_STRINGS: Record<ReviewLang, ReviewStrings> = {
  en: {
    star: (n: number) => (n === 1 ? '1 star' : `${n} stars`),
    feedback: 'Feedback',
    ratingAria: 'Rating out of five',
    levelLabel: 'Your photography level',
    levels: { beginner: 'Beginner', hobbyist: 'Hobbyist', pro: 'Pro' },
    featuresLabel: 'Which features did you find most useful?',
    featuresHint: '(pick any that apply)',
    features: {
      'walk-guide': 'Walk guide',
      'progress-track': 'Progress track',
      rewards: 'Rewards',
      'analysis-tools': 'Analysis tools',
      'photo-sharing': 'Photo sharing with friends'
    },
    improveLabel: "Something you'd like to improve?",
    optionalHint: '(optional)',
    improvePlaceholder: 'What would you improve?',
    send: 'Send review',
    blank: 'Add a rating or an answer first.',
    pendingOne: '1 review is waiting to send.',
    pendingMany: (n: number) => `${n} reviews are waiting to send.`,
    thanks: 'Thanks! Your review has been saved.'
  },
  ja: {
    star: (n: number) => `星${n}つ`,
    feedback: 'フィードバック',
    ratingAria: '5段階評価',
    levelLabel: '写真のレベル',
    levels: { beginner: '初心者', hobbyist: '趣味で撮影', pro: 'プロ' },
    featuresLabel: '特に役に立った機能はどれですか？',
    featuresHint: '（複数選択できます）',
    features: {
      'walk-guide': 'ウォークガイド',
      'progress-track': '上達の記録',
      rewards: 'ごほうび',
      'analysis-tools': '分析ツール',
      'photo-sharing': '友達と写真を共有'
    },
    improveLabel: '改善してほしい点はありますか？',
    optionalHint: '（任意）',
    improvePlaceholder: '改善してほしい点を教えてください',
    send: 'レビューを送信',
    blank: '評価または回答を入力してください。',
    pendingOne: '1件のレビューが送信待ちです。',
    pendingMany: (n: number) => `${n}件のレビューが送信待ちです。`,
    thanks: 'ありがとうございます。レビューを保存しました。'
  }
};
