import React, { useEffect, useRef, useState } from 'react';
import { Avatar, Icon } from '../ui';
import { cropFaces } from '../../utils/faceCrops';

const coverId = (cover) => `${cover?.url}|${cover?.box?.x},${cover?.box?.y},${cover?.box?.w},${cover?.box?.h}`;

/**
 * 표지 얼굴을 잘라 둔다 — 표지(사진 주소 + 상자)마다 JPEG data URL. 같은 사진에서 나온 얼굴은 그 사진을 한 번만 받아 함께 자르고,
 * 한 번 자른 얼굴은 목록을 다시 받아도(사진을 숨기거나 얼굴을 다시 찾은 뒤) 다시 자르지 않는다 — 못 자른 얼굴만 다시.
 */
const useFaceCovers = (people) => {
  const cache = useRef(new Map());   // coverId → src | null(못 자름) | undefined(자르는 중)
  const mounted = useRef(true);
  const [, setVersion] = useState(0);

  useEffect(() => {
    mounted.current = true;   // StrictMode 는 정리 후 다시 붙인다
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const byUrl = new Map();
    people.forEach((person) => {
      const id = coverId(person.cover);
      // 자른 것·자르는 중인 것은 건너뛴다. 못 자른 것(null — 잠깐의 429 등)은 목록을 다시 받을 때 한 번 더 해 본다
      if (!person.cover?.url || (cache.current.has(id) && cache.current.get(id) !== null)) return;
      cache.current.set(id, undefined);   // 자르는 중
      if (!byUrl.has(person.cover.url)) byUrl.set(person.cover.url, []);
      byUrl.get(person.cover.url).push(person.cover);
    });

    // 목록이 그 사이 다시 와도 자르던 것은 끝까지 — 캐시에 "자르는 중" 으로 남아 다음 목록이 다시 자르지 않으므로
    // 여기서 끊으면 그 얼굴은 영영 빈 칸이 된다. 그래서 효과가 아니라 화면이 사라졌는지로만 멈춘다.
    byUrl.forEach((covers, url) => {
      cropFaces(url, covers).then((crops) => {
        covers.forEach((cover, index) => cache.current.set(coverId(cover), crops[index] || null));
        if (mounted.current) setVersion((value) => value + 1);
      });
    });
  }, [people]);

  return (person) => cache.current.get(coverId(person.cover));
};

/** 이만큼 누르고 있으면 "빼기" 상태 — 버튼 위 X 가 나온다(선생님만) */
export const LONG_PRESS_MS = 500;
/** 누른 채 이만큼 움직이면 목록을 옆으로 미는 것이지 길게 누르기가 아니다 */
const LONG_PRESS_SLOP_PX = 10;

/**
 * 앨범 위 얼굴 목록 — 앨범에 나온 사람마다 얼굴 하나(같은 아이는 하나로 묶여 온다, server utils/facePeople.js).
 * 누르면 그 사람이 나온 사진만 보고, 다시 누르거나 [전체] 를 누르면 푼다. 선생님 앨범과 학부모 앨범이 같이 쓴다.
 *
 * people: [{ key, photoCount, cover: { url, box }, mine? }] · selected: key | null · onSelect(key | null)
 * 이름은 쓰지 않는다 — 얼굴 묶음은 틀릴 수 있다(사진 위 이름을 그리지 않는 것과 같은 이유). 학부모의 우리 아이만 "우리 아이".
 *
 * onRemove(key) — 주면(선생님 앨범만) 얼굴을 **길게 누르면**(마우스 오른쪽 클릭 · 키보드 Delete 도) 그 얼굴에 X 가 나오고,
 * X 를 누르면 관계없는 사람으로 목록에서 뺀다. 두 번 눌러야 지워지는 것이 확인 창을 대신한다.
 * X 가 떠 있는 동안 다른 얼굴·[전체]·바깥을 누르거나 Esc 면 X 만 사라진다(고르지 않는다).
 * removable === false 인 사람(등록된 아이로 묶인 사람 — 서버가 선생님에게만 알려 준다)은 길게 눌러도 X 가 없다.
 *
 * picking — 여러 얼굴을 한 번에 빼려고 고르는 중(선생님, pages/Photos/FacePeoplePicker). 얼굴을 누르면 사진을 거르지 않고
 * onPick(key) 로 고르거나 풀며, 고른 얼굴(picked)에 체크가 붙는다. [전체] 와 길게 누르기 X 는 없고,
 * removable === false 인 얼굴은 누를 수 없다.
 */
function FacePeopleStrip({
  people = [], selected = null, onSelect, onRemove, picking = false, picked = [], onPick, className
}) {
  const coverOf = useFaceCovers(people);
  const [removing, setRemoving] = useState(null);   // X 가 떠 있는 얼굴의 key
  const root = useRef(null);
  const removeButton = useRef(null);
  const press = useRef({ timer: null, x: 0, y: 0, long: false });

  const cancelPress = () => {
    clearTimeout(press.current.timer);
    press.current.timer = null;
  };
  useEffect(() => cancelPress, []);

  // X 가 떠 있는 동안: Esc · 목록 바깥을 누르면 닫는다. X 로 포커스를 옮겨 키보드로도 바로 뺄 수 있게 한다.
  useEffect(() => {
    if (!removing) return undefined;
    removeButton.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') setRemoving(null); };
    const onOutside = (event) => { if (!root.current?.contains(event.target)) setRemoving(null); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onOutside);
    };
  }, [removing]);

  // 묶음이 바뀌어 그 얼굴이 사라졌거나 여러 얼굴 고르기를 시작하면 X 도 닫는다
  useEffect(() => {
    if (removing && (picking || !people.some((person) => person.key === removing))) setRemoving(null);
  }, [people, removing, picking]);

  if (!people.length) return null;

  const pressHandlers = (person) => (onRemove && !picking && person.removable !== false ? {
    onPointerDown: (event) => {
      press.current.long = false;
      cancelPress();
      press.current.x = event.clientX;
      press.current.y = event.clientY;
      press.current.timer = setTimeout(() => {
        press.current.long = true;
        press.current.timer = null;
        setRemoving(person.key);
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event) => {
      if (!press.current.timer) return;
      if (Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > LONG_PRESS_SLOP_PX) cancelPress();
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    onPointerLeave: cancelPress,
    // 휴대폰 길게 누르기 메뉴 · 마우스 오른쪽 클릭 → 그 메뉴 대신 X
    onContextMenu: (event) => {
      event.preventDefault();
      setRemoving(person.key);
    },
    onKeyDown: (event) => {
      if (event.key === 'Delete') {
        event.preventDefault();
        setRemoving(person.key);
      }
    }
  } : {});

  // 길게 눌러 X 를 띄운 뒤 손을 떼면 오는 click, 또는 X 가 떠 있을 때의 click 은 고르지 않고 X 만 닫는다
  const clickGuard = (action) => () => {
    if (press.current.long) { press.current.long = false; return; }
    if (removing) { setRemoving(null); return; }
    action();
  };

  return (
    <div
      ref={root}
      className={['ui-face-people', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={picking ? '뺄 얼굴 고르기' : '얼굴로 사진 찾기'}
      data-removing={removing ? 'true' : undefined}
      data-picking={picking ? 'true' : undefined}
    >
      {!picking && (
        <div className="ui-face-people__cell">
          <button type="button" className="ui-face-people__item" aria-pressed={!selected} onClick={clickGuard(() => onSelect?.(null))}>
            <span className="ui-avatar ui-face-people__all" data-size="xl" aria-hidden="true">전체</span>
            <span className="ui-face-people__label">모든 사진</span>
          </button>
        </div>
      )}
      {people.map((person, index) => {
        const src = coverOf(person);
        const name = person.mine ? '우리 아이' : `얼굴 ${index + 1}`;
        const label = person.mine ? '우리 아이' : `${person.photoCount}장`;
        const isPicked = picking && picked.includes(person.key);
        const locked = picking && person.removable === false;
        return (
          <div key={person.key} className="ui-face-people__cell">
            <button
              type="button"
              className="ui-face-people__item"
              aria-pressed={picking ? isPicked : selected === person.key}
              aria-label={`${name} · 사진 ${person.photoCount}장`}
              disabled={locked}
              title={locked ? '등록된 아이 얼굴은 목록에서 뺄 수 없어요' : undefined}
              onClick={picking
                ? () => onPick?.(person.key)
                : clickGuard(() => onSelect?.(selected === person.key ? null : person.key))}
              {...pressHandlers(person)}
            >
              {src
                ? <Avatar src={src} size="xl" />
                : <span className="ui-avatar ui-face-people__pending" data-size="xl" data-failed={src === null ? 'true' : undefined} aria-hidden="true" />}
              <span className="ui-face-people__label">{label}</span>
            </button>
            {isPicked && (
              <span className="ui-face-people__check" aria-hidden="true"><Icon name="check" size={14} /></span>
            )}
            {removing === person.key && (
              <button
                ref={removeButton}
                type="button"
                className="ui-face-people__remove"
                aria-label={`${name} 목록에서 빼기`}
                onClick={() => { setRemoving(null); onRemove?.(person.key); }}
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default FacePeopleStrip;
