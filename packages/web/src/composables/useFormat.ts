import { useI18n } from 'vue-i18n';

const DAY_MS = 86_400_000;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Locale-aware formatting of timestamps: "Today 10:41", "Yesterday 09:02", "22 Oct 03:10". */
export function useFormat(now: () => Date = () => new Date()) {
  const { t, d } = useI18n();

  /** Today, yesterday or another day, for a date shown on its own */
  function relativeDay(date: Date): 'today' | 'yesterday' | null {
    const today = now();
    if (dayKey(date) === dayKey(today)) return 'today';
    if (dayKey(date) === dayKey(new Date(today.getTime() - DAY_MS))) return 'yesterday';
    return null;
  }

  function when(iso: string): string {
    const date = new Date(iso);
    const time = d(date, 'time');
    const rel = relativeDay(date);
    return rel ? t(`time.${rel}`, { time }) : d(date, 'dateTime');
  }

  /** The day alone: "Today", "Yesterday", "Thu 22 Oct" */
  function day(iso: string): string {
    const date = new Date(iso);
    const rel = relativeDay(date);
    return rel ? t(`time.${rel}Day`) : d(date, 'day');
  }

  /** The time alone: "10:41" */
  const clock = (iso: string): string => d(new Date(iso), 'time');

  return { when, day, clock };
}
