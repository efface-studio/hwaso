import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('later utilities override earlier ones', () => {
    expect(cn('h-10 px-4', 'size-11 px-0')).toBe('size-11 px-0');
  });

  it('keeps token font sizes separate from text colors', () => {
    expect(cn('text-body text-muted')).toBe('text-body text-muted');
    expect(cn('text-label', 'text-body-strong')).toBe('text-body-strong');
    expect(cn('text-muted', 'text-foreground')).toBe('text-foreground');
  });
});
