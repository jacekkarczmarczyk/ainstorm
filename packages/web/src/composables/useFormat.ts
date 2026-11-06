import { useI18n } from 'vue-i18n';

const DAY_MS = 86_400_000;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Locale-aware formatting of timestamps: "Today 10:41", "Yesterday 09:02", "22 Oct 03:10". */
export function useFormat(now: () => Date = () => new Date()) {
  const { t, d } = useI18n();

  function when(iso: string): string {
    const date = new Date(iso);
    const today = now();
    const time = d(date, 'time');
    if (dayKey(date) === dayKey(today)) return t('time.today', { time });
    if (dayKey(date) === dayKey(new Date(today.getTime() - DAY_MS))) return t('time.yesterday', { time });
    return d(date, 'dateTime');
  }

  return { when };
}
