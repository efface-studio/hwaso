import { render } from '@testing-library/react';
import { MediaImage } from './media-image';

const image = { key: 'img/k', width: 800, height: 1000, dominantColor: '#eeeeee' };

describe('MediaImage', () => {
  it('썸네일은 모바일 폭에서 w400 WebP 만 받는다 (스크롤 중 디코딩 부담)', () => {
    const { container } = render(<MediaImage image={image} alt="" thumb />);
    const first = container.querySelector('picture > source');
    expect(first?.getAttribute('media')).toBe('(max-width: 767px)');
    expect(first?.getAttribute('type')).toBe('image/webp');
    expect(first?.getAttribute('srcset')).toMatch(/\/img\/k\/w400\.webp$/);
  });

  it('썸네일이 아니면 모바일 전용 source 가 없다', () => {
    const { container } = render(<MediaImage image={image} alt="" />);
    expect(container.querySelector('source[media]')).toBeNull();
  });
});
