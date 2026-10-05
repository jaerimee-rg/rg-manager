import React, { useEffect, useRef, useState } from 'react';
import { Callout, Modal, Spinner } from '../ui';
import { loadPostcode, pickPostcodeAddress } from '../../utils/kakaoMap';

/**
 * 주소 검색 창 — 다음 우편번호 서비스를 모달(휴대폰에서는 바텀시트) 안에 끼워 넣는다.
 * 팝업 창 방식은 휴대폰에서 새 탭으로 열리고 차단되기도 해서 embed 를 쓴다.
 *
 * 주소를 누르면 onSelect({ address, placeName }) 를 부른다 — 닫는 것은 부모가 한다.
 * query 를 주면 그 말로 바로 검색한다 (이미 입력한 장소 이름 등).
 */
function AddressSearchDialog({ open, onClose, onSelect, query = '' }) {
  const holderRef = useRef(null);
  // loading | ready | error
  const [state, setState] = useState('loading');
  // 우편번호 창은 한 번 만들어지면 콜백을 바꿀 수 없다 — 늘 지금의 onSelect 를 부르게 한다.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    setState('loading');

    loadPostcode()
      .then((Postcode) => {
        const holder = holderRef.current;
        if (cancelled || !holder) return;

        holder.replaceChildren();
        new Postcode({
          oncomplete: (data) => onSelectRef.current?.(pickPostcodeAddress(data)),
          width: '100%',
          height: '100%'
        }).embed(holder, { q: query.trim(), autoClose: false });
        setState('ready');
      })
      .catch((error) => {
        console.error('주소 검색 불러오기 실패:', error);
        if (!cancelled) setState('error');
      });

    return () => {
      cancelled = true;
    };
    // query 는 열 때의 값만 쓴다 — 검색 창 안에서 다시 고칠 수 있다.
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="주소 검색"
      description="도로명·지번·건물명으로 찾을 수 있어요 (예: 올림픽로 424, 올림픽공원)"
      size="lg"
    >
      {state === 'loading' && <Spinner inline label="주소 검색을 여는 중" />}
      {state === 'error' && (
        <Callout tone="danger">
          주소 검색을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.
        </Callout>
      )}
      <div ref={holderRef} className="ui-address-search" hidden={state === 'error'} data-testid="address-search" />
    </Modal>
  );
}

export default AddressSearchDialog;
