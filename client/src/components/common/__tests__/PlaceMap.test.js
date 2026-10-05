import React from 'react';
import { render, screen, act } from '@testing-library/react';

jest.mock('../../../utils/kakaoMap', () => ({
  ...jest.requireActual('../../../utils/kakaoMap'),
  getKakaoMapKey: jest.fn(),
  loadKakaoMaps: jest.fn()
}));

import { getKakaoMapKey, loadKakaoMaps } from '../../../utils/kakaoMap';
import PlaceMap from '../PlaceMap';

/** 카카오 지도 SDK 흉내 — 무엇을 그렸는지만 기록한다 */
const fakeMaps = () => {
  const maps = {
    LatLng: jest.fn(function LatLng(lat, lng) { this.lat = lat; this.lng = lng; }),
    Map: jest.fn(function Map(container, options) {
      this.container = container;
      this.options = options;
      container.appendChild(document.createElement('canvas'));
    }),
    Marker: jest.fn()
  };
  return maps;
};

const renderMap = async (props) => {
  let utils;
  await act(async () => {
    utils = render(<PlaceMap latitude={37.5203} longitude={127.1236} name="올림픽공원" {...props} />);
  });
  return utils;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

describe('PlaceMap', () => {
  it('좌표에 마커 하나를 꽂은 지도를 그린다 — 끌기·휠 확대는 끈다', async () => {
    const maps = fakeMaps();
    getKakaoMapKey.mockResolvedValue('js-key');
    loadKakaoMaps.mockResolvedValue(maps);

    await renderMap();

    const box = screen.getByRole('img', { name: '올림픽공원 위치 지도' });
    expect(box).toBeVisible();
    expect(box).toHaveAttribute('data-state', 'ready');
    expect(loadKakaoMaps).toHaveBeenCalledWith('js-key');
    expect(maps.LatLng).toHaveBeenCalledWith(37.5203, 127.1236);
    expect(maps.Map).toHaveBeenCalledWith(box, expect.objectContaining({ draggable: false, scrollwheel: false, level: 3 }));
    expect(maps.Marker).toHaveBeenCalledWith(expect.objectContaining({ title: '올림픽공원' }));
  });

  it('키가 없으면 지도 칸을 숨기고 fallback 을 그린다', async () => {
    getKakaoMapKey.mockResolvedValue(null);

    await renderMap({ fallback: <p>지도 없음</p> });

    expect(screen.getByTestId('place-map')).not.toBeVisible();
    expect(screen.getByText('지도 없음')).toBeInTheDocument();
    expect(loadKakaoMaps).not.toHaveBeenCalled();
  });

  it('SDK 를 못 불러오면 fallback', async () => {
    getKakaoMapKey.mockResolvedValue('js-key');
    loadKakaoMaps.mockRejectedValue(new Error('도메인 미등록'));

    await renderMap({ fallback: <p>지도 없음</p> });

    expect(screen.getByTestId('place-map')).toHaveAttribute('data-state', 'error');
    expect(screen.getByText('지도 없음')).toBeInTheDocument();
  });

  it('좌표가 없으면 SDK 를 부르지 않는다', async () => {
    await renderMap({ latitude: null, longitude: null });

    expect(getKakaoMapKey).not.toHaveBeenCalled();
    expect(screen.getByTestId('place-map')).not.toBeVisible();
  });

  it('좌표가 바뀌면 이전 지도를 걷어 내고 다시 그린다 — 이름만 바뀌면 다시 그리지 않는다', async () => {
    const maps = fakeMaps();
    getKakaoMapKey.mockResolvedValue('js-key');
    loadKakaoMaps.mockResolvedValue(maps);

    const { rerender } = await renderMap();
    await act(async () => {
      rerender(<PlaceMap latitude={37.5203} longitude={127.1236} name="올림픽공원 체조경기장" />);
    });
    expect(maps.Map).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(<PlaceMap latitude={37.51} longitude={127.07} name="잠실" />);
    });
    expect(maps.Map).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('place-map').querySelectorAll('canvas')).toHaveLength(1);
  });
});
