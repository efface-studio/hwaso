import { render, screen, within } from '@testing-library/react';
import { Table, type Column } from './table';

type Row = { id: string; name: string; price: string };
const rows: Row[] = [{ id: '1', name: '백자 항아리', price: '2,450,000원' }];
const columns: Column<Row>[] = [
  {
    key: 'pick',
    header: <input type="checkbox" aria-label="모두 선택" />,
    cell: (r) => <input type="checkbox" aria-label={`${r.name} 선택`} />,
  },
  { key: 'name', header: '작품', cell: (r) => r.name },
  { key: 'price', header: '가격', cell: (r) => r.price },
  { key: 'act', header: '', cell: () => <button type="button">처리</button> },
];

describe('Table 모바일 카드', () => {
  it('행마다 카드: 첫 글자 열은 제목, 나머지는 라벨·값, 빈 머리글 열은 하단 작업', () => {
    render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const card = screen.getByTestId('table-card-1');
    expect(within(card).getByText('백자 항아리')).toHaveClass('text-body-strong');
    expect(within(card).getByText('가격')).toBeInTheDocument();
    expect(within(card).getByText('2,450,000원')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: '처리' })).toBeInTheDocument();
    expect(within(card).getByRole('checkbox', { name: '백자 항아리 선택' })).toBeInTheDocument();
  });

  it('요소 머리글(모두 선택)은 카드 목록 위 막대에 둔다', () => {
    render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const cards = screen.getByTestId('table-cards');
    expect(within(cards).getByRole('checkbox', { name: '모두 선택' })).toBeInTheDocument();
  });

  it('빈 목록 문구를 카드 목록에도 보여준다', () => {
    render(<Table columns={columns} rows={[]} rowKey={(r) => r.id} empty="결과가 없어요" />);
    expect(within(screen.getByTestId('table-cards')).getByText('결과가 없어요')).toBeInTheDocument();
  });
});
