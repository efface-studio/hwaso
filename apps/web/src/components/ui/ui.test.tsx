import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Button } from './button';
import { Field, Input, PriceInput } from './field';

describe('Button', () => {
  it('loading 이면 비활성화되고 aria-busy 가 켜진다', () => {
    render(<Button loading>입찰하기</Button>);
    const btn = screen.getByRole('button', { name: '입찰하기' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });
});

describe('Field', () => {
  it('라벨과 오류 메시지를 입력에 연결한다', () => {
    render(
      <Field label="이메일" error="올바른 이메일 주소를 입력해주세요.">
        {(p) => <Input {...p} />}
      </Field>,
    );
    const input = screen.getByLabelText('이메일');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('올바른 이메일 주소를 입력해주세요.');
  });
});

describe('PriceInput', () => {
  function Harness({ onValue }: { onValue: (v: number | null) => void }) {
    const [v, setV] = useState<number | null>(null);
    return (
      <PriceInput
        aria-label="가격"
        value={v}
        onValueChange={(n) => {
          setV(n);
          onValue(n);
        }}
      />
    );
  }

  it('숫자만 받아 천 단위 콤마로 표시하고 정수 값을 돌려준다', async () => {
    const values: (number | null)[] = [];
    render(<Harness onValue={(n) => values.push(n)} />);
    const input = screen.getByLabelText('가격');
    await userEvent.type(input, '1a05b0000');
    expect(input).toHaveValue('1,050,000');
    expect(values.at(-1)).toBe(1_050_000);
  });

  it('모두 지우면 null', async () => {
    const values: (number | null)[] = [];
    render(<Harness onValue={(n) => values.push(n)} />);
    const input = screen.getByLabelText('가격');
    await userEvent.type(input, '5');
    await userEvent.clear(input);
    expect(values.at(-1)).toBeNull();
  });
});
