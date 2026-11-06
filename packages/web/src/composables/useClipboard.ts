import { useI18n } from 'vue-i18n';
import { useToastStore } from '../stores/toasts.ts';

const PREVIEW = 60;

/** What the toast shows of copied text: one line, the beginning only when long. */
export function copyPreview(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > PREVIEW ? `${oneLine.slice(0, PREVIEW - 1)}…` : oneLine;
}

/** Copy text and tell the user what happened; resolves to whether the copy worked. */
export function useClipboard() {
  const toasts = useToastStore();
  const { t } = useI18n();

  async function copy(text: string, quiet = false): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      if (!quiet) toasts.show(t('toast.copied'), [], 2500, copyPreview(text));
      return true;
    } catch {
      toasts.show(t('toast.clipboardBlocked'), [], 6000);
      return false;
    }
  }

  return { copy };
}
