import { describe, expect, it } from 'vitest';
import { copyPreview } from './useClipboard.ts';

describe('copyPreview', () => {
  it('shows short text as it is, on one line', () => {
    expect(copyPreview('PRJ-39')).toBe('PRJ-39');
    expect(copyPreview('[ainstorm #1]\n  Zacznij')).toBe('[ainstorm #1] Zacznij');
  });

  it('shows the beginning of long text', () => {
    const preview = copyPreview('x'.repeat(200));
    expect(preview).toHaveLength(60);
    expect(preview.endsWith('…')).toBe(true);
  });
});
