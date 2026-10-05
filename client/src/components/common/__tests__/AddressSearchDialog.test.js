import React from 'react';
import { render, screen, act } from '@testing-library/react';

jest.mock('../../../utils/kakaoMap', () => ({
  ...jest.requireActual('../../../utils/kakaoMap'),
  loadPostcode: jest.fn()
}));

import { loadPostcode } from '../../../utils/kakaoMap';
import AddressSearchDialog from '../AddressSearchDialog';

/** 다음 우편번호 Postcode 흉내 — 만들 때 받은 옵션과 embed 인자를 기록한다 */
let created;
function FakePostcode(options) {
  this.options = options;
  this.embed = jest.fn();
  created = this;
}

const renderDialog = async (props = {}) => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  await act(async () => {
    render(<AddressSearchDialog open onClose={onClose} onSelect={onSelect} {...props} />);
  });
  return { onSelect, onClose };
};

beforeEach(() => {
  jest.clearAllMocks();
  created = null;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

describe('AddressSearchDialog', () => {
  it('다음 우편번호 창을 모달 안에 끼워 넣고, 준 검색어로 바로 찾는다', async () => {
    loadPostcode.mockResolvedValue(FakePostcode);

    await renderDialog({ query: ' 올림픽공원 ' });

    expect(screen.getByRole('dialog', { name: '주소 검색' })).toBeInTheDocument();
    expect(created.embed).toHaveBeenCalledWith(screen.getByTestId('address-search'), { q: '올림픽공원', autoClose: false });
  });

  it('주소를 고르면 저장할 주소와 건물명을 넘긴다', async () => {
    loadPostcode.mockResolvedValue(FakePostcode);
    const { onSelect } = await renderDialog();

    act(() => {
      created.options.oncomplete({
        roadAddress: '서울 송파구 올림픽로 424', jibunAddress: '서울 송파구 방이동 88',
        buildingName: '올림픽공원', userSelectedType: 'R'
      });
    });

    expect(onSelect).toHaveBeenCalledWith({ address: '서울 송파구 올림픽로 424', placeName: '올림픽공원' });
  });

  it('스크립트를 못 불러오면 안내를 보인다', async () => {
    loadPostcode.mockRejectedValue(new Error('offline'));

    await renderDialog();

    expect(screen.getByText(/주소 검색을 불러오지 못했어요/)).toBeInTheDocument();
    expect(screen.getByTestId('address-search')).not.toBeVisible();
  });

  it('닫혀 있으면 아무것도 불러오지 않는다', async () => {
    await renderDialog({ open: false });

    expect(loadPostcode).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
