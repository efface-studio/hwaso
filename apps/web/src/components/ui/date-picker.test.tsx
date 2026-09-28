import { fireEvent, render, screen } from '@testing-library/react';
import { DateTimeInput } from './date-picker';

describe('DateTimeInput', () => {
  it('값을 한국어로 보여주고, 비어 있으면 안내 문구', () => {
    const { rerender } = render(<DateTimeInput value="2026-09-30T14:30" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /2026년 9월 30일 \(수\) 오후 2:30/ })).toBeInTheDocument();
    rerender(<DateTimeInput value="" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /날짜와 시간 선택/ })).toBeInTheDocument();
  });

  it('날짜를 고르면 시간은 그대로 두고 같은 형식으로 돌려준다', () => {
    const onChange = vi.fn();
    render(<DateTimeInput value="2026-09-30T14:30" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /2026년 9월 30일/ }));
    fireEvent.click(screen.getByRole('button', { name: /9월 15일/ }));
    expect(onChange).toHaveBeenLastCalledWith('2026-09-15T14:30');
  });

  it('날짜만 모드는 YYYY-MM-DD 를 돌려준다', () => {
    const onChange = vi.fn();
    render(<DateTimeInput mode="date" value="2026-09-30" onChange={onChange} />);
    expect(screen.getByRole('button', { name: /2026년 9월 30일 \(수\)$/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /2026년 9월 30일/ }));
    fireEvent.click(screen.getByRole('button', { name: /9월 3일/ }));
    expect(onChange).toHaveBeenLastCalledWith('2026-09-03');
  });

  it('min 이전 날짜는 고를 수 없다', () => {
    render(<DateTimeInput value="2026-09-30T14:30" min="2026-09-20T00:00" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /2026년 9월 30일/ }));
    expect(screen.getByRole('button', { name: /9월 19일/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /9월 20일/ })).toBeEnabled();
  });
});
