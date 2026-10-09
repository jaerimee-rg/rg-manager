import React, { useState } from 'react';
import { reanalyzeAlbum } from '../../utils/faceReanalysis';
import { Avatar, Button, Callout, Progress } from '../../components/ui';

/** 찾은 얼굴은 이만큼만 그린다 — 단체 사진이 많은 앨범은 수백 개가 된다. 나머지는 "+N" 으로 센다. */
export const FACE_PREVIEW_LIMIT = 30;

const NO_FACES = { items: [], total: 0 };

/**
 * 이번에 찾은 얼굴을 작게 줄지어 보여 준다 — 찾는 동안에는 진행 막대 아래, 끝난 뒤에는 결과 안내 아래.
 * 그림은 이 브라우저에서 잘라 낸 것이라(utils/faceCrops.js) 어디에도 저장되지 않고 화면을 떠나면 사라진다.
 */
function FoundFaces({ faces, className }) {
  if (!faces.total) return null;
  const more = faces.total - faces.items.length;
  return (
    <ul className={['ui-face-strip', className].filter(Boolean).join(' ')} aria-label={`찾은 얼굴 ${faces.total}개`}>
      {faces.items.map((face, index) => (
        <li key={index}><Avatar src={face.src} size="lg" /></li>
      ))}
      {more > 0 && (
        <li><span className="ui-avatar ui-face-strip__more" data-size="lg" title={`얼굴 ${more}개 더`}>+{more}</span></li>
      )}
    </ul>
  );
}

/**
 * 앨범 화면의 [얼굴 찾기] — 얼굴을 아직 찾지 않았거나 예전 방식으로 찾은 사진(count 장)을
 * 다시 본다. 이 브라우저가 Drive 사진을 받아 얼굴 분석 함수(face_engine/)로 보내고 결과를 저장한다.
 * Google 연결이 끊겨도 된다(공유 링크로 읽고, 저장은 앱 DB). 자동으로 돌리지 않는다: 사진마다 받고 보내고 계산하므로
 * 선생님이 누를 때만 한다.
 */
function FaceScanPanel({ apiBase, count = 0, onDone, className }) {
  const [phase, setPhase] = useState('idle');   // idle | running | done
  const [progress, setProgress] = useState({ done: 0, total: count });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [faces, setFaces] = useState(NO_FACES);   // { items: [{ mediaId, src }] (앞 FACE_PREVIEW_LIMIT 개), total }

  const addFaces = (found) => setFaces((prev) => ({
    items: prev.items.length < FACE_PREVIEW_LIMIT ? [...prev.items, ...found].slice(0, FACE_PREVIEW_LIMIT) : prev.items,
    total: prev.total + found.length
  }));

  const start = async () => {
    setPhase('running');
    setError('');
    setProgress({ done: 0, total: count });
    setFaces(NO_FACES);
    try {
      const counts = await reanalyzeAlbum(apiBase, { onProgress: setProgress, onFaces: addFaces });
      setResult(counts);
      setPhase('done');
      onDone?.(counts);
    } catch (scanError) {
      console.error('얼굴 다시 찾기 실패:', scanError);
      setError(scanError.message || '얼굴을 찾지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      setPhase('idle');
    }
  };

  if (phase === 'done' && result) {
    return (
      <Callout className={className} tone="success" onDismiss={() => setPhase('idle')}>
        사진 {result.done}장을 다시 봤어요. {result.found}장에서 얼굴을 찾았어요.
        {result.failed > 0 && <> {result.failed}장은 읽지 못했어요 — 잠시 뒤 다시 찾아 볼 수 있어요.</>}
        <FoundFaces className="ui-mt-2" faces={faces} />
      </Callout>
    );
  }

  if (phase === 'running') {
    return (
      <Callout className={className} tone="brand">
        <div className="ui-stack" data-gap="2">
          <span>얼굴 찾는 중… {progress.done} / {progress.total}장 · 이 화면을 닫지 말아 주세요</span>
          <Progress value={progress.total ? Math.round((progress.done / progress.total) * 100) : 0} label="얼굴 찾기 진행률" />
          <FoundFaces faces={faces} />
        </div>
      </Callout>
    );
  }

  if (!count) return null;

  return (
    <Callout className={className} tone="neutral">
      얼굴을 찾아 볼 사진이 {count}장 있어요. 찾아 두면 학부모가 <b>우리 아이 사진만</b> 모아 볼 수 있어요.
      {error && <div className="ui-text-danger ui-mt-2">{error}</div>}
      <div className="ui-mt-2">
        <Button size="sm" variant="primary" icon="search" onClick={start}>얼굴 찾기</Button>
      </div>
    </Callout>
  );
}

export default FaceScanPanel;
