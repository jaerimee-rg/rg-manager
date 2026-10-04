import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../../../utils/imageCrop', () => ({
  ...jest.requireActual('../../../utils/imageCrop'),
  cropToSquare: jest.fn(async (file) => ({ blob: file, filename: `cut-${file.name || 'pasted'}.jpg` }))
}));

import { fetchWithAuth } from '../../../utils/api';
import { cropToSquare } from '../../../utils/imageCrop';
import ProductFormModal from '../ProductFormModal';

const CATEGORIES = [{ id: 1, name: '발레복' }, { id: 3, name: '기구' }];
const respond = (status, body) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });
const SAVED = [{ id: 1, url: 'https://cdn/1.jpg' }, { id: 2, url: 'https://cdn/2.jpg' }];
const EDIT = { id: 12, title: '리본', description: '6m 리본', url: 'https://a.com/x', price: 32000, categoryId: 3, isVisible: true, clickCount: 5, images: SAVED };

const setup = (props = {}) => {
  const onSaved = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <ProductFormModal
      product={null}
      categories={CATEGORIES}
      storageReady
      onClose={onClose}
      onSaved={onSaved}
      onManageCategories={jest.fn()}
      {...props}
    />
  );
  return { onSaved, onClose, ...utils };
};

const save = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
  });
};

const png = (name) => new File(['img'], name, { type: 'image/png' });
const pick = (...files) => fireEvent.change(screen.getByLabelText('상품 사진 파일'), { target: { files } });
const tiles = () => screen.getAllByTestId('shop-image-tile');
const calls = () => fetchWithAuth.mock.calls.map(([url, opts]) => `${opts?.method || 'GET'} ${url}`);

let previewSeq = 0;
beforeEach(() => {
  jest.clearAllMocks();
  previewSeq = 0;
  global.URL.createObjectURL = jest.fn(() => {
    previewSeq += 1;
    return `blob:preview-${previewSeq}`;
  });
  global.URL.revokeObjectURL = jest.fn();
});

describe('ProductFormModal — 필수는 타이틀뿐 (FR-410~416)', () => {
  it('타이틀 없이 저장하면 필드 아래에 안내하고 서버를 부르지 않는다', async () => {
    setup();
    await save();
    expect(screen.getByText('타이틀을 입력해 주세요')).toBeInTheDocument();
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('타이틀만으로 등록된다', async () => {
    fetchWithAuth.mockReturnValue(respond(201, { product: { id: 7, title: '곤봉', images: [] } }));
    const { onSaved } = setup();

    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: ' 곤봉 ' } });
    await save();

    expect(fetchWithAuth).toHaveBeenCalledTimes(1);
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/shop/products', {
      method: 'POST',
      body: JSON.stringify({ title: '곤봉', description: null, url: null, price: null, categoryId: null, isVisible: true })
    });
    expect(onSaved).toHaveBeenCalledWith({ id: 7, title: '곤봉', images: [] }, { created: true, imageError: null });
  });

  it('상세 설명(줄바꿈 유지)·주소·가격·카테고리·공개 여부를 함께 보낸다', async () => {
    fetchWithAuth.mockReturnValue(respond(201, { product: { id: 8, images: [] } }));
    setup();
    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: '리본' } });
    fireEvent.change(screen.getByLabelText(/상세 설명/), { target: { value: ' 6m 새틴\n막대 포함 ' } });
    expect(screen.getByText('11 / 1000')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/연결할 주소/), { target: { value: 'coupang.com/x' } });
    expect(screen.getByText('coupang.com 으로 연결돼요.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/가격/), { target: { value: '32000' } });
    expect(screen.getByLabelText(/가격/)).toHaveValue('32,000');
    fireEvent.change(screen.getByLabelText(/카테고리/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('switch', { name: '학부모에게 보이기' }));
    await save();

    expect(JSON.parse(fetchWithAuth.mock.calls[0][1].body)).toEqual({
      title: '리본', description: '6m 새틴\n막대 포함', url: 'https://coupang.com/x', price: 32000, categoryId: 3, isVisible: false
    });
  });

  it('설명이 1000자를 넘으면 그 칸에 안내하고 서버를 부르지 않는다', async () => {
    setup();
    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: '리본' } });
    fireEvent.change(screen.getByLabelText(/상세 설명/), { target: { value: 'a'.repeat(1001) } });
    await save();
    expect(screen.getByText('상세 설명은 1000자까지 입력할 수 있어요')).toBeInTheDocument();
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('javascript: 주소는 막는다', async () => {
    setup();
    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: '리본' } });
    fireEvent.change(screen.getByLabelText(/연결할 주소/), { target: { value: 'javascript:alert(1)' } });
    await save();
    expect(screen.getByText('웹 주소(https://…)를 입력해 주세요')).toBeInTheDocument();
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('서버가 돌려준 필드 오류를 그 칸에 보여 준다', async () => {
    fetchWithAuth.mockReturnValue(respond(400, { error: '카테고리를 다시 골라 주세요', fields: { categoryId: '카테고리를 다시 골라 주세요' } }));
    const { onSaved } = setup();
    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: '리본' } });
    await save();
    expect(screen.getByText('카테고리를 다시 골라 주세요')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('수정은 설명·사진까지 기존 값을 채우고 PUT 으로 보낸다 — 사진을 안 건드리면 사진 요청은 없다', async () => {
    fetchWithAuth.mockReturnValue(respond(200, { product: { ...EDIT, title: '리본 6m' } }));
    const { onSaved } = setup({ product: EDIT });

    expect(screen.getByRole('heading', { name: '상품 수정' })).toBeInTheDocument();
    expect(screen.getByLabelText(/상세 설명/)).toHaveValue('6m 리본');
    expect(screen.getByLabelText(/가격/)).toHaveValue('32,000');
    expect(screen.getByAltText('사진 1 (대표)')).toHaveAttribute('src', 'https://cdn/1.jpg');
    expect(screen.getByText('2 / 10')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: '리본 6m' } });
    await save();

    expect(calls()).toEqual(['PUT /api/shop/products/12']);
    expect(onSaved).toHaveBeenCalledWith({ ...EDIT, title: '리본 6m' }, { created: false, imageError: null });
  });

  it('저장소가 설정되지 않았으면 사진 칸 대신 안내', () => {
    setup({ storageReady: false });
    expect(screen.getByText(/이미지 저장소가 설정되지 않아/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '사진 선택' })).not.toBeInTheDocument();
  });
});

describe('ProductFormModal — 사진 여러 장 · 순서', () => {
  it('여러 장을 한 번에 고르면 차례로 붙고 첫 장이 대표다 — 저장하면 잘라서 한 장씩 올린다', async () => {
    fetchWithAuth
      .mockReturnValueOnce(respond(201, { product: { id: 7, title: '리본', images: [] } }))
      .mockReturnValueOnce(respond(201, { image: { id: 31 }, product: { id: 7, images: [{ id: 31 }] } }))
      .mockReturnValueOnce(respond(201, { image: { id: 32 }, product: { id: 7, images: [{ id: 31 }, { id: 32 }] } }));
    const { onSaved } = setup();

    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: '리본' } });
    pick(png('a.png'), png('b.png'));
    expect(tiles()).toHaveLength(2);
    expect(screen.getByAltText('사진 1 (대표)')).toHaveAttribute('src', 'blob:preview-1');
    expect(within(tiles()[0]).getByText('대표')).toBeInTheDocument();
    expect(screen.getByText('2 / 10')).toBeInTheDocument();

    await save();

    expect(calls()).toEqual([
      'POST /api/shop/products',
      'POST /api/shop/products/7/images?filename=cut-a.png.jpg',
      'POST /api/shop/products/7/images?filename=cut-b.png.jpg'
    ]);
    expect(cropToSquare).toHaveBeenCalledTimes(2);
    expect(cropToSquare.mock.calls[0][1]).toEqual({ x: 0.5, y: 0.5, zoom: 1 });
    expect(fetchWithAuth.mock.calls[1][1].body.name).toBe('a.png');
    expect(onSaved).toHaveBeenCalledWith({ id: 7, images: [{ id: 31 }, { id: 32 }] }, { created: true, imageError: null });
  });

  it('‹ › 로 순서를 바꾸면 대표가 바뀌고, 저장할 때 그 순서를 보낸다', async () => {
    fetchWithAuth
      .mockReturnValueOnce(respond(200, { product: EDIT }))
      .mockReturnValueOnce(respond(200, { product: { ...EDIT, images: [SAVED[1], SAVED[0]] } }));
    setup({ product: EDIT });

    fireEvent.click(screen.getByRole('button', { name: '사진 2 앞으로' }));
    expect(screen.getByAltText('사진 1 (대표)')).toHaveAttribute('src', 'https://cdn/2.jpg');
    expect(screen.getByRole('button', { name: '사진 1 앞으로' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '사진 2 뒤로' })).toBeDisabled();

    await save();

    expect(calls()).toEqual(['PUT /api/shop/products/12', 'PUT /api/shop/products/12/images/order']);
    expect(JSON.parse(fetchWithAuth.mock.calls[1][1].body)).toEqual({ ids: [2, 1] });
  });

  it('끌어다 놓아도 순서가 바뀐다 (데스크톱)', () => {
    setup({ product: EDIT });
    const [first, second] = tiles();
    const dataTransfer = { setData: jest.fn(), effectAllowed: '', types: [] };
    fireEvent.dragStart(second, { dataTransfer });
    fireEvent.dragOver(first, { dataTransfer });
    fireEvent.drop(first, { dataTransfer });
    expect(screen.getByAltText('사진 1 (대표)')).toHaveAttribute('src', 'https://cdn/2.jpg');
  });

  it('뺀 사진은 지우고, 새 사진을 맨 앞에 두면 올린 뒤 순서를 맞춘다', async () => {
    fetchWithAuth
      .mockReturnValueOnce(respond(200, { product: EDIT }))
      .mockReturnValueOnce(respond(200, { product: { ...EDIT, images: [SAVED[1]] } }))
      .mockReturnValueOnce(respond(201, { image: { id: 40 }, product: { ...EDIT, images: [SAVED[1], { id: 40 }] } }))
      .mockReturnValueOnce(respond(200, { product: { ...EDIT, images: [{ id: 40 }, SAVED[1]] } }));
    const { onSaved } = setup({ product: EDIT });

    fireEvent.click(screen.getByRole('button', { name: '사진 1 빼기' }));
    pick(png('new.png'));
    fireEvent.click(screen.getByRole('button', { name: '사진 2 앞으로' }));
    await save();

    expect(calls()).toEqual([
      'PUT /api/shop/products/12',
      'DELETE /api/shop/products/12/images/1',
      'POST /api/shop/products/12/images?filename=cut-new.png.jpg',
      'PUT /api/shop/products/12/images/order'
    ]);
    expect(JSON.parse(fetchWithAuth.mock.calls[3][1].body)).toEqual({ ids: [40, 2] });
    expect(onSaved.mock.calls[0][0].images).toEqual([{ id: 40 }, SAVED[1]]);
  });

  it('사진 한 장이 실패해도 상품과 나머지 사진은 저장하고 안내한다 (FR-414)', async () => {
    fetchWithAuth
      .mockReturnValueOnce(respond(201, { product: { id: 7, title: '리본', images: [] } }))
      .mockReturnValueOnce(respond(413, { error: '이미지가 너무 큽니다.' }))
      .mockReturnValueOnce(respond(201, { image: { id: 32 }, product: { id: 7, images: [{ id: 32 }] } }));
    const { onSaved } = setup();

    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: '리본' } });
    pick(png('a.png'), png('b.png'));
    await save();

    expect(calls()).toHaveLength(3);
    const [product, meta] = onSaved.mock.calls[0];
    expect(product.images).toEqual([{ id: 32 }]);
    expect(meta.imageError).toBe('상품은 저장했지만 사진 1장을 올리지 못했어요 — 이미지가 너무 큽니다.. 수정에서 다시 시도해 주세요.');
  });

  it('상품을 만든 뒤 사진 단계에서 네트워크가 끊겨도 창을 닫고 알린다 — 다시 [저장]으로 상품이 둘 되지 않게', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchWithAuth
      .mockReturnValueOnce(respond(201, { product: { id: 7, title: '리본', images: [] } }))
      .mockReturnValueOnce(Promise.reject(new Error('offline')));
    const { onSaved } = setup();

    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: '리본' } });
    pick(png('a.png'));
    await save();

    expect(onSaved).toHaveBeenCalledTimes(1);
    const [product, meta] = onSaved.mock.calls[0];
    expect(product.id).toBe(7);
    expect(meta).toEqual({ created: true, imageError: '상품은 저장했지만 사진 1장을 올리지 못했어요. 수정에서 다시 시도해 주세요.' });
    console.error.mockRestore();
  });

  it('사진 빼기가 실패하면 그 사진은 맨 뒤에 둔 채로 순서를 보낸다 (하나라도 빠지면 서버가 거절한다)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const three = { ...EDIT, images: [...SAVED, { id: 3, url: 'https://cdn/3.jpg' }] };
    fetchWithAuth
      .mockReturnValueOnce(respond(200, { product: three }))
      .mockReturnValueOnce(respond(500, { error: '서버 오류' }))
      .mockReturnValueOnce(respond(200, { product: { ...three, images: [three.images[2], SAVED[1], SAVED[0]] } }));
    const { onSaved } = setup({ product: three });

    fireEvent.click(screen.getByRole('button', { name: '사진 1 빼기' }));
    fireEvent.click(screen.getByRole('button', { name: '사진 2 앞으로' }));
    await save();

    expect(calls()).toEqual([
      'PUT /api/shop/products/12',
      'DELETE /api/shop/products/12/images/1',
      'PUT /api/shop/products/12/images/order'
    ]);
    expect(JSON.parse(fetchWithAuth.mock.calls[2][1].body)).toEqual({ ids: [3, 2, 1] });
    expect(onSaved.mock.calls[0][1].imageError).toMatch(/사진을 빼지 못했어요/);
    console.error.mockRestore();
  });

  it('[저장]을 빠르게 두 번 눌러도 한 번만 보낸다', async () => {
    let finish;
    fetchWithAuth.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    setup();
    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: '리본' } });
    const button = screen.getByRole('button', { name: '저장' });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(fetchWithAuth).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ ok: true, status: 201, json: () => Promise.resolve({ product: { id: 7, images: [] } }) });
    });
  });

  it('허용하지 않는 형식(svg)은 빼고 안내한다', () => {
    setup();
    pick(new File(['<svg/>'], 'logo.svg'));
    expect(screen.getByText('jpg · png · webp · gif 이미지만 올릴 수 있어요')).toBeInTheDocument();
    expect(screen.queryAllByTestId('shop-image-tile')).toHaveLength(0);
  });

  it('10장이 넘으면 들어갈 만큼만 넣고 안내하며, [사진 추가] 칸이 사라진다', () => {
    setup();
    pick(...Array.from({ length: 12 }, (_, i) => png(`p${i}.png`)));
    expect(tiles()).toHaveLength(10);
    expect(screen.getByText('사진은 10장까지예요 — 고른 사진 중 2장은 넣지 못했어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /사진 추가/ })).not.toBeInTheDocument();
  });

  it('새 사진을 빼면 미리보기 주소를 돌려준다', () => {
    setup();
    pick(png('a.png'));
    fireEvent.click(screen.getByRole('button', { name: '사진 1 빼기' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    expect(screen.getByText('상품 사진을 골라 주세요')).toBeInTheDocument();
  });
});

describe('ProductFormModal — 자르기', () => {
  it('이미 올린 사진에는 자르기가 없고, 새 사진에만 있다', () => {
    setup({ product: EDIT });
    expect(screen.queryByRole('button', { name: /자르기/ })).not.toBeInTheDocument();
    pick(png('a.png'));
    expect(screen.getByRole('button', { name: '사진 3 자르기' })).toBeInTheDocument();
  });

  it('[자르기] → 확대 → [적용] 하면 미리보기에 반영되고, 그 범위로 잘라 올린다', async () => {
    fetchWithAuth
      .mockReturnValueOnce(respond(201, { product: { id: 7, images: [] } }))
      .mockReturnValueOnce(respond(201, { image: { id: 31 }, product: { id: 7, images: [{ id: 31 }] } }));
    setup();
    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: '리본' } });
    pick(png('a.png'));

    fireEvent.click(screen.getByRole('button', { name: '사진 1 자르기' }));
    expect(screen.getByRole('heading', { name: '사진 자르기' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/타이틀/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', { name: '확대' }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(screen.getByRole('heading', { name: '상품 등록' })).toBeInTheDocument();
    expect(screen.getByLabelText(/타이틀/)).toHaveValue('리본');
    expect(screen.getByAltText('사진 1 (대표)').style.transform).toBe('scale(2)');

    await save();
    expect(cropToSquare.mock.calls[0][1]).toEqual({ x: 0.5, y: 0.5, zoom: 2 });
  });

  it('자르기에서 돌아오면 그 사진의 [자르기] 버튼에 포커스가 돌아온다 · 열리면 자를 칸에 포커스', () => {
    setup();
    pick(png('a.png'), png('b.png'));
    fireEvent.click(screen.getByRole('button', { name: '사진 2 자르기' }));
    expect(screen.getByRole('group', { name: /자를 부분/ })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(screen.getByRole('button', { name: '사진 2 자르기' })).toHaveFocus();
  });

  it('자르기에서 [취소]·Esc 는 바꾼 것을 버리고 폼으로 돌아간다 (폼은 닫히지 않는다)', () => {
    const { onClose } = setup();
    pick(png('a.png'));

    fireEvent.click(screen.getByRole('button', { name: '사진 1 자르기' }));
    fireEvent.change(screen.getByRole('slider', { name: '확대' }), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByAltText('사진 1 (대표)').style.transform).toBe('');

    fireEvent.click(screen.getByRole('button', { name: '사진 1 자르기' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('heading', { name: '상품 등록' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ProductFormModal — 복사한 사진 붙여 넣기', () => {
  const clipboard = ({ files = [], text = '' } = {}) => ({
    items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    files,
    getData: (type) => (type === 'text/plain' ? text : '')
  });
  // 스크린샷을 붙여 넣으면 브라우저가 이름 없는 image/png 를 준다
  const screenshot = () => new File(['img'], '', { type: 'image/png' });
  const paste = (target, data) => fireEvent.paste(target, { clipboardData: clipboard(data) });

  it('창 어디서든 붙여 넣으면 사진 칸 맨 뒤에 붙고, 저장하면 그 사진을 올린다', async () => {
    fetchWithAuth
      .mockReturnValueOnce(respond(201, { product: { id: 7, images: [] } }))
      .mockReturnValueOnce(respond(201, { image: { id: 31 }, product: { id: 7, images: [{ id: 31 }] } }));
    setup();
    expect(screen.getByText(/복사한 사진은 붙여 넣어도 돼요/)).toBeInTheDocument();

    const notPrevented = paste(screen.getByRole('dialog'), { files: [screenshot()] });
    expect(notPrevented).toBe(false);
    expect(screen.getByAltText('사진 1 (대표)')).toHaveAttribute('src', 'blob:preview-1');

    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: '리본' } });
    await save();
    expect(fetchWithAuth.mock.calls[1][1].body.name).toBe('pasted-image.png');
  });

  it('이미 사진이 있으면 바꾸지 않고 맨 뒤에 더한다', () => {
    setup({ product: EDIT });
    paste(screen.getByRole('dialog'), { files: [screenshot()] });
    expect(tiles()).toHaveLength(3);
    expect(screen.getByAltText('사진 1 (대표)')).toHaveAttribute('src', 'https://cdn/1.jpg');
    expect(screen.getByAltText('사진 3')).toHaveAttribute('src', 'blob:preview-1');
  });

  it('글자 칸에서도 사진만 붙여 넣으면 사진으로 받는다', () => {
    setup();
    paste(screen.getByLabelText(/연결할 주소/), { files: [screenshot()] });
    expect(tiles()).toHaveLength(1);
    expect(screen.getByLabelText(/연결할 주소/)).toHaveValue('');
  });

  it('타이틀 칸에 글자와 사진이 함께 오면 글자를 붙여 넣는다 (사진은 건드리지 않음)', () => {
    setup();
    const notPrevented = paste(screen.getByLabelText(/타이틀/), { files: [screenshot()], text: '리본 6m' });
    expect(notPrevented).toBe(true);
    expect(screen.queryAllByTestId('shop-image-tile')).toHaveLength(0);
  });

  it('허용하지 않는 형식(heic)은 붙여 넣어도 막는다', () => {
    setup();
    paste(screen.getByRole('dialog'), { files: [new File(['x'], 'image', { type: 'image/heic' })] });
    expect(screen.getByText('jpg · png · webp · gif 이미지만 올릴 수 있어요')).toBeInTheDocument();
    expect(screen.queryAllByTestId('shop-image-tile')).toHaveLength(0);
  });

  it('저장소가 없으면 붙여넣기를 가로채지 않는다', () => {
    setup({ storageReady: false });
    expect(paste(screen.getByRole('dialog'), { files: [screenshot()] })).toBe(true);
  });

  it('창을 닫으면 더는 붙여넣기를 받지 않는다', () => {
    const { unmount } = setup();
    unmount();
    expect(paste(document.body, { files: [screenshot()] })).toBe(true);
  });
});
