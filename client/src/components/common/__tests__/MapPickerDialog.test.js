import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

jest.mock('../../../utils/kakaoMap', () => ({
  ...jest.requireActual('../../../utils/kakaoMap'),
  getKakaoMapKey: jest.fn(),
  loadKakaoMaps: jest.fn(),
  addressAt: jest.fn()
}));

import { addressAt, getKakaoMapKey, loadKakaoMaps } from '../../../utils/kakaoMap';
import MapPickerDialog from '../MapPickerDialog';

/** 카카오 지도 SDK 흉내 — 그린 지도와 붙인 이벤트를 기록하고, 테스트가 "지도를 옮긴" 것처럼 idle 을 부른다 */
const fakeMaps = () => {
  const listeners = {};
  const maps = {
    LatLng: jest.fn(function LatLng(lat, lng) {
      this.getLat = () => lat;
      this.getLng = () => lng;
    }),
    Map: jest.fn(function Map(container, options) {
      this.center = options.center;
      this.options = options;
      this.getCenter = () => this.center;
      this.setCenter = (c) => { this.center = c; };
      this.panTo = jest.fn((c) => { this.center = c; });
      this.relayout = jest.fn();
      this.addControl = jest.fn();
      container.appendChild(document.createElement('canvas'));
      maps.drawn = this;
    }),
    ZoomControl: jest.fn(),
    ControlPosition: { RIGHT: 'RIGHT' },
    event: {
      addListener: jest.fn((target, type, handler) => {
        (listeners[type] = listeners[type] || []).push(handler);
      }),
      removeListener: jest.fn((target, type, handler) => {
        listeners[type] = (listeners[type] || []).filter((h) => h !== handler);
      })
    },
    listeners
  };
  return maps;
};

let maps;

/** 지도를 끌어 가운데를 옮기고 멈춘 것처럼 */
const moveTo = async (lat, lng) => {
  await act(async () => {
    maps.drawn.center = new maps.LatLng(lat, lng);
    (maps.listeners.idle || []).forEach((h) => h());
  });
};

const renderDialog = async (props = {}) => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  let utils;
  await act(async () => {
    utils = render(<MapPickerDialog open onClose={onClose} onSelect={onSelect} {...props} />);
  });
  return { onSelect, onClose, ...utils };
};

const pickButton = () => screen.getByRole('button', { name: '이 위치로' });
const shownAddress = () => screen.getByTestId('map-picker-address');

const OLYMPIC = { latitude: 37.5203, longitude: 127.1236, address: '서울 송파구 방이동 88' };
const STADIUM = {
  ok: true, address: '서울 송파구 올림픽로 25', placeName: '서울종합운동장'
};

beforeEach(() => {
  jest.clearAllMocks();
  maps = fakeMaps();
  getKakaoMapKey.mockResolvedValue('js-key');
  loadKakaoMaps.mockResolvedValue(maps);
  addressAt.mockResolvedValue(STADIUM);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

describe('MapPickerDialog', () => {
  it('고른 곳에서 열리고, 고른 주소를 다시 묻지 않고 그대로 보여 준다 — 움직이지 않으면 그대로 돌려준다', async () => {
    const { onSelect } = await renderDialog(OLYMPIC);

    expect(screen.getByRole('dialog', { name: '지도에서 고르기' })).toBeInTheDocument();
    expect(maps.LatLng).toHaveBeenCalledWith(37.5203, 127.1236);
    expect(maps.Map).toHaveBeenCalledWith(screen.getByTestId('map-picker'), expect.objectContaining({ level: 3 }));
    expect(maps.drawn.options).not.toHaveProperty('draggable', false);
    expect(shownAddress()).toHaveTextContent('서울 송파구 방이동 88');

    // 카카오 지도는 처음 그린 뒤에도 idle 을 부른다 — 같은 자리라 묻지 않는다
    await moveTo(37.5203, 127.1236);
    expect(addressAt).not.toHaveBeenCalled();

    fireEvent.click(pickButton());
    expect(onSelect).toHaveBeenCalledWith({
      address: '서울 송파구 방이동 88', placeName: '', latitude: 37.5203, longitude: 127.1236
    });
  });

  it('지도를 옮겨 멈추면 가운데 자리의 주소를 찾아 보여 주고, [이 위치로] 는 그 주소와 좌표를 넘긴다', async () => {
    const { onSelect } = await renderDialog(OLYMPIC);

    await moveTo(37.5153, 127.0733);

    expect(addressAt).toHaveBeenCalledWith(maps, { latitude: 37.5153, longitude: 127.0733 });
    expect(shownAddress()).toHaveTextContent('서울 송파구 올림픽로 25 · 서울종합운동장');

    fireEvent.click(pickButton());
    expect(onSelect).toHaveBeenCalledWith({
      address: '서울 송파구 올림픽로 25', placeName: '서울종합운동장', latitude: 37.5153, longitude: 127.0733
    });
  });

  it('좌표가 없으면 기본 자리에서 넓게 열고, 그 자리 주소부터 찾는다', async () => {
    await renderDialog({ latitude: null, longitude: null, address: '서울 어딘가' });

    expect(maps.LatLng).toHaveBeenCalledWith(37.5666, 126.9784);
    expect(maps.drawn.options).toMatchObject({ level: 7 });
    expect(addressAt).toHaveBeenCalledWith(maps, { latitude: 37.5666, longitude: 126.9784 });
    expect(shownAddress()).toHaveTextContent('서울 송파구 올림픽로 25');
  });

  it('주소를 찾는 동안과 못 찾았을 때는 [이 위치로] 가 잠긴다', async () => {
    let answer;
    addressAt.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    const { onSelect } = await renderDialog(OLYMPIC);

    await moveTo(37.5, 127.2);
    expect(shownAddress()).toHaveTextContent('이 자리의 주소를 찾는 중');
    expect(pickButton()).toBeDisabled();

    await act(async () => {
      answer({ ok: false, reason: 'not_found' });
    });
    expect(shownAddress()).toHaveTextContent('이 자리의 주소를 찾지 못했어요');
    expect(pickButton()).toBeDisabled();
    fireEvent.click(pickButton());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('연달아 옮기면 늦게 도착한 앞 자리의 주소가 새 자리를 덮지 않는다', async () => {
    const answers = [];
    addressAt.mockImplementation(() => new Promise((resolve) => { answers.push(resolve); }));
    const { onSelect } = await renderDialog(OLYMPIC);

    await moveTo(37.51, 127.01);
    await moveTo(37.52, 127.02);
    await act(async () => {
      answers[1]({ ok: true, address: '두 번째 자리', placeName: '' });
    });
    await act(async () => {
      answers[0]({ ok: true, address: '첫 번째 자리', placeName: '' });
    });

    expect(shownAddress()).toHaveTextContent('두 번째 자리');
    fireEvent.click(pickButton());
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ address: '두 번째 자리', latitude: 37.52, longitude: 127.02 }));
  });

  it('지도를 누르면 그곳을 가운데로 옮긴다', async () => {
    await renderDialog(OLYMPIC);
    const clicked = new maps.LatLng(37.53, 127.03);

    act(() => {
      maps.listeners.click.forEach((h) => h({ latLng: clicked }));
    });

    expect(maps.drawn.panTo).toHaveBeenCalledWith(clicked);
  });

  it('창 크기가 바뀌면 지도를 다시 맞추고 가운데는 그대로 둔다', async () => {
    await renderDialog(OLYMPIC);
    const center = maps.drawn.center;

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(maps.drawn.relayout).toHaveBeenCalled();
    expect(maps.drawn.center).toBe(center);
  });

  it('닫으면 지도 이벤트를 떼어 낸다', async () => {
    const { rerender, onClose, onSelect } = await renderDialog(OLYMPIC);

    await act(async () => {
      rerender(<MapPickerDialog open={false} onClose={onClose} onSelect={onSelect} {...OLYMPIC} />);
    });

    expect(maps.event.removeListener).toHaveBeenCalledWith(maps.drawn, 'idle', expect.any(Function));
    expect(maps.event.removeListener).toHaveBeenCalledWith(maps.drawn, 'click', expect.any(Function));
    expect(maps.listeners.idle).toHaveLength(0);
  });

  it('지도 키가 없으면 지도 대신 [주소 검색] 안내', async () => {
    getKakaoMapKey.mockResolvedValue(null);

    await renderDialog(OLYMPIC);

    expect(screen.getByText(/지도 키가 아직 설정되지 않아/)).toBeInTheDocument();
    expect(loadKakaoMaps).not.toHaveBeenCalled();
    expect(pickButton()).toBeDisabled();
  });

  it('SDK 를 못 불러오면 오류 안내', async () => {
    loadKakaoMaps.mockRejectedValue(new Error('도메인 미등록'));

    await renderDialog(OLYMPIC);

    expect(screen.getByRole('alert')).toHaveTextContent('지도를 불러오지 못했어요');
    expect(pickButton()).toBeDisabled();
  });

  it('[취소] 는 닫기만 한다', async () => {
    const { onClose, onSelect } = await renderDialog(OLYMPIC);

    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
