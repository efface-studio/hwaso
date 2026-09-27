import { layout, motion, palette, radius, shadow, spacing, typography, type ColorScheme } from './index';

const kebab = (s: string) => s.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();

function colorVars(scheme: ColorScheme, indent: string): string {
  const colors = Object.entries(palette[scheme]).map(([k, v]) => `${indent}--${kebab(k)}: ${v};`);
  colors.push(
    `${indent}--shadow-sm-value: ${shadow.sm[scheme]};`,
    `${indent}--shadow-md-value: ${shadow.md[scheme]};`,
  );
  colors.push(`${indent}color-scheme: ${scheme};`);
  return colors.join('\n');
}

/**
 * Tailwind v4 가 처리하는 CSS 를 만든다.
 * - :root / [data-theme] 에 원시 변수 (--background …)
 * - @theme inline 으로 유틸리티(bg-background, text-h1, rounded-sm …) 매핑
 */
export function buildCss(): string {
  const themeColors = Object.keys(palette.light)
    .map((k) => `  --color-${kebab(k)}: var(--${kebab(k)});`)
    .join('\n');

  const text = Object.entries(typography)
    .map(([k, t]) => {
      const name = kebab(k);
      return [
        `  --text-${name}: ${t.size}px;`,
        `  --text-${name}--line-height: ${t.lineHeight}px;`,
        `  --text-${name}--font-weight: ${t.weight};`,
        `  --text-${name}--letter-spacing: ${t.tracking}em;`,
      ].join('\n');
    })
    .join('\n');

  const radii = Object.entries(radius)
    .map(([k, v]) => `  --radius-${k}: ${v === 9999 ? '9999px' : `${v}px`};`)
    .join('\n');

  const mobileText = Object.entries(typography)
    .filter(([, t]) => 'mobile' in t)
    .map(([k, t]) => {
      const m = (t as { mobile: { size: number; lineHeight: number } }).mobile;
      return `    --text-${kebab(k)}: ${m.size}px;\n    --text-${kebab(k)}--line-height: ${m.lineHeight}px;`;
    })
    .join('\n');

  return `/* 자동 생성 파일 — packages/tokens/src 를 수정한 뒤 \`pnpm --filter @shop/tokens build:css\` 를 실행하세요. */

:root {
${colorVars('light', '  ')}
}

:root[data-theme='dark'] {
${colorVars('dark', '  ')}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${colorVars('dark', '    ')}
  }
}

@theme inline {
  --color-*: initial;
  --color-white: #ffffff;
  --color-black: #000000;
  --color-transparent: transparent;
  --color-current: currentColor;
${themeColors}

  --font-sans: var(--font-pretendard), ${'"Pretendard Variable"'}, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;

  --shadow-*: initial;
  --shadow-none: none;
  --shadow-sm: var(--shadow-sm-value);
  --shadow-md: var(--shadow-md-value);
}

/* inline 이 아닌 @theme — 유틸리티가 var(--text-h1) 을 참조해 아래 모바일 재정의가 적용된다 */
@theme {
  --spacing: 4px;
${text}

  --radius-*: initial;
${radii}

${Object.entries(spacing)
  .map(([k, v]) => `  --spacing-${k}: ${v}px;`)
  .join('\n')}

  --container-page: ${layout.maxWidth}px;
  --breakpoint-md: ${layout.breakpoints.tablet}px;
  --breakpoint-lg: ${layout.breakpoints.desktop}px;
  --breakpoint-xl: ${layout.breakpoints.wide}px;

  --ease-out: ${motion.easeOut};
  --default-transition-duration: ${motion.durationBase}ms;
  --default-transition-timing-function: ${motion.easeOut};
}

@media (max-width: ${layout.breakpoints.tablet - 1}px) {
  :root {
${mobileText}
  }
}
`;
}
