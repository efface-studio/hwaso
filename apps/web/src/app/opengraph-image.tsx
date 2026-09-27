import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = '화소 畫所 — 작품과 사람이 만나는 곳';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** 링크 공유 미리보기: 그린 배너 디자인을 1200×630 으로 (글자는 Pretendard 로 렌더) */
export default function OpengraphImage() {
  const font = (w: string) =>
    readFileSync(join(process.cwd(), 'node_modules/pretendard/dist/public/static', `Pretendard-${w}.otf`));
  const icon = readFileSync(join(process.cwd(), 'public/brand/hwaso-logo-green.svg')).toString('base64');
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 64,
        padding: '0 120px',
        background: '#16b364',
      }}
    >
      <img src={`data:image/svg+xml;base64,${icon}`} width={260} height={260} alt="" />
      <div style={{ display: 'flex', flexDirection: 'column', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
          <span style={{ fontSize: 150, fontWeight: 800, lineHeight: 1 }}>화소</span>
          <span style={{ fontSize: 54, fontWeight: 500, opacity: 0.8 }}>畫所</span>
        </div>
        <span style={{ marginTop: 28, fontSize: 52, fontWeight: 500, opacity: 0.92 }}>
          작품과 사람이 만나는 곳
        </span>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Pretendard', data: font('ExtraBold'), weight: 800 },
        { name: 'Pretendard', data: font('Medium'), weight: 500 },
      ],
    },
  );
}
