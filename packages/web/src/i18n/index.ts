import { createI18n } from 'vue-i18n';
import { enGB, type MessageSchema } from './en-GB.ts';

export const LOCALES = ['en-GB'] as const;
export type Locale = (typeof LOCALES)[number];

export const i18n = createI18n<[MessageSchema], Locale>({
  legacy: false,
  locale: 'en-GB',
  fallbackLocale: 'en-GB',
  messages: { 'en-GB': enGB },
  datetimeFormats: {
    'en-GB': {
      time: { hour: '2-digit', minute: '2-digit', hour12: false },
      date: { day: 'numeric', month: 'short' },
      dateTime: { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false },
    },
  },
});
