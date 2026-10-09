import React from 'react';
import { Chip, Toolbar } from '../../components/ui';

/**
 * 얼굴 목록에서 한 사람을 골랐을 때 사진 칸 위 — [이 얼굴 사진 N] 과 [뺀 사진 K] 를 오간다(선생님 앨범 화면 · 전체 사진).
 * 뺀 사진 = 선생님이 "이 얼굴 아님" 으로 뺀 것(server removedCount). 한 장도 없으면 칩을 그리지 않는다.
 * 아래 손글씨 줄이 [고르기] 로 빼고 다시 넣는 방법을 알려 준다 — 사진 자체는 지우지 않는다.
 */
function PersonPhotosBar({ person, removedView = false, onViewChange, className }) {
  if (!person) return null;
  const removed = person.removedCount || 0;
  return (
    <div className={className}>
      <Toolbar className="ui-photo-filters" aria-label="고른 얼굴의 사진">
        <Chip selected={!removedView} count={person.photoCount} onClick={() => onViewChange(false)}>이 얼굴 사진</Chip>
        {(removed > 0 || removedView) && (
          <Chip selected={removedView} count={removed} onClick={() => onViewChange(true)}>뺀 사진</Chip>
        )}
      </Toolbar>
      <p className="ui-hand ui-mt-2">
        {removedView
          ? '이 얼굴이 아니라고 뺀 사진이에요. [고르기] 로 골라 다시 넣을 수 있어요.'
          : '다른 사람 사진이 섞여 있으면 [고르기] 로 골라 이 얼굴에서 빼요 — 사진은 그대로예요.'}
      </p>
    </div>
  );
}

export default PersonPhotosBar;
