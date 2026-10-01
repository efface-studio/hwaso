import { decodeCursor, paginate } from './products.service';

describe('paginate (limit+1 로 다음 페이지 판단)', () => {
  it('마지막 페이지면 개수를 세지 않고 offset + 건수가 전체 개수', async () => {
    const count = vi.fn(() => Promise.resolve(999));
    const page = await paginate([1, 2, 3], 5, 10, count);
    expect(page).toEqual({ rows: [1, 2, 3], nextCursor: null, total: 13 });
    expect(count).not.toHaveBeenCalled();
  });

  it('다음 페이지가 있으면 개수를 세고, 낡은 개수라도 다음 페이지가 있다는 사실과 맞춘다', async () => {
    const page = await paginate([1, 2, 3], 2, 0, () => Promise.resolve(1));
    expect(page.rows).toEqual([1, 2]);
    expect(decodeCursor(page.nextCursor!)).toBe(2);
    expect(page.total).toBe(3);
    expect((await paginate([1, 2, 3], 2, 0, () => Promise.resolve(40))).total).toBe(40);
  });

  it('끝을 넘은 커서(빈 페이지)는 실제 개수를 센다', async () => {
    expect(await paginate([], 2, 50, () => Promise.resolve(7))).toEqual({
      rows: [],
      nextCursor: null,
      total: 7,
    });
    expect(await paginate([], 2, 0, () => Promise.resolve(7))).toEqual({
      rows: [],
      nextCursor: null,
      total: 0,
    });
  });
});
