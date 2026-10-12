import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const providers = vi.fn();
const startOAuth = vi.fn();
const toastError = vi.fn();
vi.mock('@/lib/api', () => ({ api: { auth: { providers: () => providers() } } }));
vi.mock('@/lib/auth', () => ({ startOAuth: (...a: unknown[]) => startOAuth(...a) }));
vi.mock('@/stores/toast', () => ({ toast: { show: vi.fn(), error: (m: string) => toastError(m) } }));

/** 운영 모드(미설정 방식 숨김)로 불러온다 — 노출 여부는 모듈을 불러올 때 정해진다 */
async function renderProd() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.resetModules();
  const { SocialButtons } = await import('./social-buttons');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SocialButtons />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('SocialButtons (운영)', () => {
  it('설정된 방식만 보여준다', async () => {
    providers.mockResolvedValue({ oauth: ['KAKAO'], appleNative: false });
    await renderProd();
    expect(await screen.findByRole('button', { name: /카카오/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /네이버/ })).not.toBeInTheDocument();
  });

  it('서버가 응답하지 않아도 버튼을 숨기지 않고, 누르면 연결 실패를 안내한다', async () => {
    providers.mockRejectedValue(new TypeError('Failed to fetch'));
    await renderProd();
    await waitFor(() => expect(providers).toHaveBeenCalled());
    const kakao = screen.getByRole('button', { name: /카카오/ });
    expect(screen.getByRole('button', { name: /Apple/ })).toBeInTheDocument();
    fireEvent.click(kakao);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/연결하지 못했어요/)));
    expect(startOAuth).not.toHaveBeenCalled();
  });

  it('누를 때 서버가 다시 살아 있으면 그대로 로그인을 시작한다', async () => {
    providers.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await renderProd();
    await waitFor(() => expect(providers).toHaveBeenCalledTimes(1));
    providers.mockResolvedValue({ oauth: ['KAKAO'], appleNative: false });
    fireEvent.click(screen.getByRole('button', { name: /카카오/ }));
    await waitFor(() => expect(startOAuth).toHaveBeenCalledWith('KAKAO', 'login', undefined));
  });
});
