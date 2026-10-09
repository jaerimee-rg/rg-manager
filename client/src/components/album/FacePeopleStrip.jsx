import React, { useEffect, useRef, useState } from 'react';
import { Avatar } from '../ui';
import { cropFaces } from '../../utils/faceCrops';

const coverId = (cover) => `${cover?.url}|${cover?.box?.x},${cover?.box?.y},${cover?.box?.w},${cover?.box?.h}`;

/**
 * 표지 얼굴을 잘라 둔다 — 표지(사진 주소 + 상자)마다 JPEG data URL. 같은 사진에서 나온 얼굴은 그 사진을 한 번만 받아 함께 자르고,
 * 한 번 자른 얼굴은 목록을 다시 받아도(사진을 숨기거나 얼굴을 다시 찾은 뒤) 다시 자르지 않는다.
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
      if (!person.cover?.url || cache.current.has(id)) return;
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

/**
 * 앨범 위 얼굴 목록 — 앨범에 나온 사람마다 얼굴 하나(같은 아이는 하나로 묶여 온다, server utils/facePeople.js).
 * 누르면 그 사람이 나온 사진만 보고, 다시 누르거나 [전체] 를 누르면 푼다. 선생님 앨범과 학부모 앨범이 같이 쓴다.
 *
 * people: [{ key, photoCount, cover: { url, box }, mine? }] · selected: key | null · onSelect(key | null)
 * 이름은 쓰지 않는다 — 얼굴 묶음은 틀릴 수 있다(사진 위 이름을 그리지 않는 것과 같은 이유). 학부모의 우리 아이만 "우리 아이".
 */
function FacePeopleStrip({ people = [], selected = null, onSelect, className }) {
  const coverOf = useFaceCovers(people);
  if (!people.length) return null;

  return (
    <div className={['ui-face-people', className].filter(Boolean).join(' ')} role="group" aria-label="얼굴로 사진 찾기">
      <button type="button" className="ui-face-people__item" aria-pressed={!selected} onClick={() => onSelect?.(null)}>
        <span className="ui-avatar ui-face-people__all" data-size="xl" aria-hidden="true">전체</span>
        <span className="ui-face-people__label">모든 사진</span>
      </button>
      {people.map((person, index) => {
        const src = coverOf(person);
        const label = person.mine ? '우리 아이' : `${person.photoCount}장`;
        return (
          <button
            key={person.key}
            type="button"
            className="ui-face-people__item"
            aria-pressed={selected === person.key}
            aria-label={`${person.mine ? '우리 아이' : `얼굴 ${index + 1}`} · 사진 ${person.photoCount}장`}
            onClick={() => onSelect?.(selected === person.key ? null : person.key)}
          >
            {src
              ? <Avatar src={src} size="xl" />
              : <span className="ui-avatar ui-face-people__pending" data-size="xl" data-failed={src === null ? 'true' : undefined} aria-hidden="true" />}
            <span className="ui-face-people__label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default FacePeopleStrip;
