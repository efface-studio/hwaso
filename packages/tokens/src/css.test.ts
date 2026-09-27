import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCss } from './css';
import { palette } from './index';

describe('tokens.css', () => {
  it('생성 결과와 커밋된 파일이 같다 (build:css 누락 방지)', () => {
    const committed = readFileSync(resolve(import.meta.dirname, '../tokens.css'), 'utf8');
    expect(committed).toBe(buildCss());
  });

  it('라이트/다크 팔레트가 같은 키를 가진다', () => {
    expect(Object.keys(palette.dark).sort()).toEqual(Object.keys(palette.light).sort());
  });

  it('primary 색은 kebab-case 변수로 노출된다', () => {
    const css = buildCss();
    expect(css).toContain('--primary-foreground: #FFFFFF;');
    expect(css).toContain('--text-h1: 28px;');
    expect(css).toContain('--text-body-strong: 15px;');
    expect(css).toContain('--color-surface-2: var(--surface-2);');
    expect(css).toContain('--color-primary: var(--primary);');
  });
});
