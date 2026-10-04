// The review form's own English and Japanese text. Kept apart from the app
// dictionary because the form has its own language toggle and needs both
// languages at once. Answers are submitted by key (level, feature), so the
// sheet reads the same whichever language filled the form in.
//
// Ported from the old app's js/review.js.

export type ReviewLang = "en" | "ja";
export type LevelKey = "beginner" | "hobbyist" | "pro";
export type FeatureKey = "walk-guide" | "progress-track" | "rewards" | "analysis-tools" | "photo-sharing";

export const LEVEL_KEYS: readonly LevelKey[] = ["beginner", "hobbyist", "pro"];
export const FEATURE_KEYS: readonly FeatureKey[] = ["walk-guide", "progress-track", "rewards", "analysis-tools", "photo-sharing"];

export interface ReviewStrings {
  toggleLabel: string;
  langAria: string;
  feedback: string;
  title: string;
  subtitle: string;
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
  problemLabel: string;
  problemPlaceholder: string;
  namePlaceholder: string;
  send: string;
  privacy: string;
  blank: string;
  pendingOne: string;
  pendingMany: (n: number) => string;
  thanks: string;
}

export const REVIEW_STRINGS: Record<ReviewLang, ReviewStrings> = {
  en: {
    toggleLabel: 'EN',
    langAria: 'Language',
    star: (n: number) => (n === 1 ? '1 star' : `${n} stars`),
    feedback: 'Feedback',
    title: 'Leave a review',
    subtitle: "Tried PhotoEYE? A few taps tell us more than you'd think.",
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
    problemLabel: 'Another problem this could help you solve?',
    problemPlaceholder: 'What is it?',
    namePlaceholder: 'Name (optional)',
    send: 'Send review',
    privacy: "Held on this device and sent when you are online. Only what's above is sent, never your photos or your practice history.",
    blank: 'Add a rating or an answer first.',
    pendingOne: '1 review is waiting to send.',
    pendingMany: (n: number) => `${n} reviews are waiting to send.`,
    thanks: 'Thanks! Your review has been saved.'
  },
  ja: {
    toggleLabel: 'JA',
    langAria: '言語',
    star: (n: number) => `星${n}つ`,
    feedback: 'フィードバック',
    title: 'レビューを書く',
    subtitle: 'PhotoEYEを使ってみましたか？数タップの回答でもとても参考になります。',
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
    problemLabel: 'ほかに、このアプリで解決できそうな困りごとはありますか？',
    problemPlaceholder: '内容を教えてください',
    namePlaceholder: 'お名前（任意）',
    send: 'レビューを送信',
    privacy: 'この内容は端末に保存され、オンライン時に送信されます。送信されるのは上記の内容のみで、写真や利用履歴が送信されることはありません。',
    blank: '評価または回答を入力してください。',
    pendingOne: '1件のレビューが送信待ちです。',
    pendingMany: (n: number) => `${n}件のレビューが送信待ちです。`,
    thanks: 'ありがとうございます。レビューを保存しました。'
  }
};
