import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../../../utils/imageResize', () => ({
  ...jest.requireActual('../../../utils/imageResize'),
  resizeForUpload: jest.fn(async (file) => ({ blob: file, filename: 'small.jpg' }))
}));

import { fetchWithAuth } from '../../../utils/api';
import ProductFormModal from '../ProductFormModal';

const CATEGORIES = [{ id: 1, name: '발레복' }, { id: 3, name: '기구' }];
const respond = (status, body) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });

const setup = (props = {}) => {
  const onSaved = jest.fn();
  const onClose = jest.fn();
  render(
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
  return { onSaved, onClose };
};

const save = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  global.URL.createObjectURL = jest.fn(() => 'blob:preview');
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
    fetchWithAuth.mockReturnValue(respond(201, { product: { id: 7, title: '곤봉' } }));
    const { onSaved } = setup();

    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: ' 곤봉 ' } });
    await save();

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/shop/products', {
      method: 'POST',
      body: JSON.stringify({ title: '곤봉', url: null, price: null, categoryId: null, isVisible: true })
    });
    expect(onSaved).toHaveBeenCalledWith({ id: 7, title: '곤봉' }, { created: true, imageError: null });
  });

  it('javascript: 주소는 막는다', async () => {
    setup();
    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: '리본' } });
    fireEvent.change(screen.getByLabelText(/연결할 주소/), { target: { value: 'javascript:alert(1)' } });
    await save();
    expect(screen.getByText('웹 주소(https://…)를 입력해 주세요')).toBeInTheDocument();
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('가격은 콤마를 붙여 보여 주고 숫자로 보낸다, 카테고리·공개 여부도 함께', async () => {
    fetchWithAuth.mockReturnValue(respond(201, { product: { id: 8 } }));
    setup();
    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: '리본' } });
    fireEvent.change(screen.getByLabelText(/연결할 주소/), { target: { value: 'coupang.com/x' } });
    expect(screen.getByText('coupang.com 으로 연결돼요.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/가격/), { target: { value: '32000' } });
    expect(screen.getByLabelText(/가격/)).toHaveValue('32,000');
    fireEvent.change(screen.getByLabelText(/카테고리/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('switch', { name: '학부모에게 보이기' }));
    await save();

    expect(JSON.parse(fetchWithAuth.mock.calls[0][1].body)).toEqual({
      title: '리본', url: 'https://coupang.com/x', price: 32000, categoryId: 3, isVisible: false
    });
  });

  it('서버가 돌려준 필드 오류를 그 칸에 보여 준다', async () => {
    fetchWithAuth.mockReturnValue(respond(400, { error: '카테고리를 다시 골라 주세요', fields: { categoryId: '카테고리를 다시 골라 주세요' } }));
    const { onSaved } = setup();
    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: '리본' } });
    await save();
    expect(screen.getByText('카테고리를 다시 골라 주세요')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('수정은 기존 값을 채우고 PUT 으로 보낸다', async () => {
    fetchWithAuth.mockReturnValue(respond(200, { product: { id: 12, title: '리본 6m' } }));
    const { onSaved } = setup({
      product: { id: 12, title: '리본', url: 'https://a.com/x', price: 32000, categoryId: 3, isVisible: true, clickCount: 5, imageUrl: null }
    });

    expect(screen.getByRole('heading', { name: '상품 수정' })).toBeInTheDocument();
    expect(screen.getByLabelText(/가격/)).toHaveValue('32,000');
    expect(screen.getByLabelText(/카테고리/)).toHaveValue('3');

    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: '리본 6m' } });
    await save();

    expect(fetchWithAuth.mock.calls[0][0]).toBe('/api/shop/products/12');
    expect(fetchWithAuth.mock.calls[0][1].method).toBe('PUT');
    expect(onSaved).toHaveBeenCalledWith({ id: 12, title: '리본 6m' }, { created: false, imageError: null });
  });

  it('사진을 고르면 상품 저장 뒤 그 상품에 올린다', async () => {
    fetchWithAuth
      .mockReturnValueOnce(respond(201, { product: { id: 7, title: '리본' } }))
      .mockReturnValueOnce(respond(200, { product: { id: 7, title: '리본', imageUrl: 'https://cdn/x.jpg' } }));
    const { onSaved } = setup();

    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: '리본' } });
    const file = new File(['img'], '리본.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('상품 사진 파일'), { target: { files: [file] } });
    expect(screen.getByAltText('상품 사진 미리보기')).toHaveAttribute('src', 'blob:preview');
    await save();

    const [url, options] = fetchWithAuth.mock.calls[1];
    expect(url).toBe('/api/shop/products/7/image?filename=small.jpg');
    expect(options.method).toBe('POST');
    expect(options.body).toBe(file);
    expect(onSaved).toHaveBeenCalledWith({ id: 7, title: '리본', imageUrl: 'https://cdn/x.jpg' }, { created: true, imageError: null });
  });

  it('사진만 실패하면 상품은 저장된 채로 안내한다 (FR-414)', async () => {
    fetchWithAuth
      .mockReturnValueOnce(respond(201, { product: { id: 7, title: '리본' } }))
      .mockReturnValueOnce(respond(413, { error: '이미지가 너무 큽니다.' }));
    const { onSaved } = setup();

    fireEvent.change(screen.getByLabelText(/타이틀/), { target: { value: '리본' } });
    fireEvent.change(screen.getByLabelText('상품 사진 파일'), { target: { files: [new File(['x'], 'a.jpg')] } });
    await save();

    const [product, meta] = onSaved.mock.calls[0];
    expect(product).toEqual({ id: 7, title: '리본' });
    expect(meta.imageError).toMatch(/상품은 저장했지만 사진을 올리지 못했어요 — 이미지가 너무 큽니다/);
  });

  it('허용하지 않는 형식(svg)은 고를 때 막는다', () => {
    setup();
    fireEvent.change(screen.getByLabelText('상품 사진 파일'), { target: { files: [new File(['<svg/>'], 'logo.svg')] } });
    expect(screen.getByText('jpg · png · webp · gif 이미지만 올릴 수 있어요')).toBeInTheDocument();
  });

  it('사진 빼기 → 저장하면 이미지 삭제를 부른다', async () => {
    fetchWithAuth
      .mockReturnValueOnce(respond(200, { product: { id: 12, title: '리본', imageUrl: 'https://cdn/x.jpg' } }))
      .mockReturnValueOnce(respond(200, { product: { id: 12, title: '리본', imageUrl: null } }));
    const { onSaved } = setup({ product: { id: 12, title: '리본', imageUrl: 'https://cdn/x.jpg', isVisible: true } });

    fireEvent.click(screen.getByRole('button', { name: '사진 빼기' }));
    await save();

    expect(fetchWithAuth.mock.calls[1]).toEqual(['/api/shop/products/12/image', { method: 'DELETE' }]);
    expect(onSaved.mock.calls[0][0].imageUrl).toBeNull();
  });

  it('저장소가 설정되지 않았으면 사진 칸 대신 안내', () => {
    setup({ storageReady: false });
    expect(screen.getByText(/이미지 저장소가 설정되지 않아/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '사진 선택' })).not.toBeInTheDocument();
  });
});
