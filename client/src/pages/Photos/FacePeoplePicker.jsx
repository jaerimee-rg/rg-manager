import React, { useEffect, useState } from 'react';
import FacePeopleStrip from '../../components/album/FacePeopleStrip';
import { Button, ConfirmDialog } from '../../components/ui';
import { removePeople } from './removePeople';

/**
 * 선생님 얼굴 목록 — FacePeopleStrip 에 "여러 얼굴 한 번에 빼기" 를 더한다(앨범 화면 · 전체 사진).
 * 관중·다른 팀처럼 관계없는 사람이 많을 때 하나씩 길게 눌러 X 로 빼는 대신, 목록 위 [얼굴 빼기] 를 누르고 얼굴을 여러 개 골라
 * [N개 빼기] → 확인 창으로 한 번에 뺀다. 사진은 그대로다(removePeople — 하나라도 안 되면 아무것도 지우지 않는다).
 * 등록된 아이로 묶인 얼굴(removable: false)은 고를 수 없다. 길게 눌러 X 로 하나 빼기(onRemove)는 그대로 있다.
 * 고르는 동안의 버튼은 목록 바로 위 줄에 둔다 — 고르는 손이 목록에 있고, 사진 [고르기] 의 아래 막대와 겹치지 않는다.
 *
 * base — 앨범 화면 `/api/events/<id>/album`, 전체 사진 `/api/albums`.
 * picking · onPickingChange(bool) — 고르는 중인지는 화면이 갖는다(사진 [고르기] 와 동시에 켜지 않게 화면이 하나만 켠다).
 * onRemoved(keys) — 뺀 뒤 화면이 목록을 다시 읽는다 · onStale() — 그 사이 목록이 바뀌어 아무것도 안 뺐을 때 · onToast(message)
 */
function FacePeoplePicker({
  base, people = [], selected = null, onSelect, onRemove, picking = false, onPickingChange, onRemoved, onStale, onToast, className
}) {
  const [picked, setPicked] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const removableCount = people.filter((person) => person.removable !== false).length;

  // 고르기를 끝내면 고른 것을 푼다
  useEffect(() => { if (!picking) setPicked([]); }, [picking]);
  // 목록이 바뀌면(다시 읽음) 사라졌거나 뺄 수 없게 된 얼굴은 고른 것에서 빠진다
  useEffect(() => {
    setPicked((prev) => {
      const next = prev.filter((key) => people.some((person) => person.key === key && person.removable !== false));
      return next.length === prev.length ? prev : next;
    });
  }, [people]);
  // 뺄 수 있는 얼굴이 하나도 안 남으면 고르기를 끝낸다
  useEffect(() => {
    if (picking && !removableCount) onPickingChange?.(false);
  }, [picking, removableCount, onPickingChange]);

  if (!people.length) return null;

  const toggle = (key) => setPicked((prev) => (prev.includes(key) ? prev.filter((one) => one !== key) : [...prev, key]));

  const remove = async () => {
    const keys = picked;
    setBusy(true);
    const result = await removePeople(base, people, keys);
    setBusy(false);
    setConfirming(false);
    if (!result.ok) {
      onToast?.(result.message);
      if (result.changed) onStale?.();
      return;
    }
    onToast?.(`얼굴 ${result.count}개를 목록에서 뺐어요 · 사진은 그대로 있어요`);
    onPickingChange?.(false);
    onRemoved?.(keys);
  };

  return (
    <div className={className}>
      {(picking || removableCount > 0) && (
        <div className="ui-row ui-mb-2" data-gap="2" data-justify="between" role="region" aria-label="얼굴 빼기">
          {picking ? (
            <>
              <b>{picked.length ? `얼굴 ${picked.length}개 골랐어요` : '목록에서 뺄 얼굴을 골라 주세요'}</b>
              <div className="ui-row" data-gap="2">
                <Button size="sm" disabled={busy} onClick={() => onPickingChange?.(false)}>취소</Button>
                <Button size="sm" variant="primary" icon="x" disabled={busy || !picked.length} onClick={() => setConfirming(true)}>
                  {picked.length ? `${picked.length}개 빼기` : '빼기'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <span className="ui-text-subtle ui-text-sm">관계없는 얼굴은 골라서 한 번에 빼요</span>
              <Button size="sm" variant="ghost" icon="x" onClick={() => onPickingChange?.(true)}>얼굴 빼기</Button>
            </>
          )}
        </div>
      )}

      <FacePeopleStrip
        people={people}
        selected={selected}
        onSelect={onSelect}
        onRemove={onRemove}
        picking={picking}
        picked={picked}
        onPick={toggle}
      />

      <ConfirmDialog
        open={confirming}
        title={`얼굴 ${picked.length}개를 목록에서 뺄까요?`}
        message="사진은 그대로 있어요. 고른 얼굴과 그 얼굴로 자동으로 붙은 태그만 지워요 — 되돌릴 수 없어요."
        confirmLabel="빼기"
        tone="danger"
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={remove}
      />
    </div>
  );
}

export default FacePeoplePicker;
