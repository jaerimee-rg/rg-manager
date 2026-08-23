/**
 * 브라우저 → Google Drive 직접 업로드 (resumable).
 *
 * 서버는 세션 주소만 발급하고 파일 바이트를 만지지 않는다. 그래서
 * Vercel 의 요청 크기·시간 제한과 무관하고, 500MB 영상도 올릴 수 있다.
 * 세션 주소 자체가 자격 증명이라 여기서는 우리 JWT 를 보내지 않는다.
 */

/** 한 번에 보내는 크기. Google 은 256KB 의 배수를 요구한다. */
export const CHUNK_SIZE = 8 * 1024 * 1024;

/**
 * 파일 하나를 올린다.
 * → { ok: true, file } | { ok: false, error, canceled }
 *
 * onProgress(0~100) 로 진행률을 알려준다.
 */
export const uploadToDrive = async (file, sessionUri, { onProgress, signal } = {}) => {
  const total = file.size;
  let offset = 0;

  // 끊겼다 다시 시작하는 경우 어디까지 갔는지 먼저 묻는다.
  if (typeof signal?.resumeFrom === 'number') offset = signal.resumeFrom;

  while (offset < total) {
    if (signal?.aborted) return { ok: false, canceled: true };

    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = file.slice(offset, end);

    let response;
    try {
      response = await sendChunk(sessionUri, chunk, offset, end - 1, total, {
        onProgress: (loaded) => onProgress?.(Math.round(((offset + loaded) / total) * 100)),
        signal
      });
    } catch (error) {
      if (signal?.aborted) return { ok: false, canceled: true };
      // 끊긴 자리를 물어보고 이어서 시도한다 (한 번만).
      const resumed = await queryOffset(sessionUri, total).catch(() => null);
      if (resumed === null || resumed <= offset) {
        return { ok: false, error: error?.message || '업로드가 끊겼어요. 다시 시도해 주세요.' };
      }
      offset = resumed;
      continue;
    }

    if (response.status === 200 || response.status === 201) {
      onProgress?.(100);
      return { ok: true, file: parseJson(response.body) };
    }

    if (response.status === 308) {
      const next = rangeEnd(response.range);
      offset = next === null ? end : next + 1;
      continue;
    }

    return { ok: false, error: `업로드에 실패했어요 (${response.status})` };
  }

  // 크기가 0 이거나 이미 끝난 경우
  const finished = await queryOffset(sessionUri, total).catch(() => null);
  return finished === total ? { ok: true, file: null } : { ok: false, error: '업로드를 마치지 못했어요.' };
};

/** XMLHttpRequest 를 쓰는 이유는 fetch 로는 업로드 진행률을 알 수 없기 때문이다. */
const sendChunk = (sessionUri, chunk, start, end, total, { onProgress, signal }) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', sessionUri, true);
    xhr.setRequestHeader('Content-Range', `bytes ${start}-${end}/${total}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded);
    };
    xhr.onload = () => resolve({
      status: xhr.status,
      body: xhr.responseText,
      range: xhr.getResponseHeader('Range')
    });
    xhr.onerror = () => reject(new Error('네트워크 오류'));
    xhr.ontimeout = () => reject(new Error('시간이 초과됐어요'));

    if (signal) {
      signal.addEventListener?.('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(chunk);
  });

/** 어디까지 올라갔는지 묻는다 (Content-Range: bytes * /size) */
export const queryOffset = (sessionUri, total) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', sessionUri, true);
    xhr.setRequestHeader('Content-Range', `bytes */${total}`);
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) return resolve(total);
      if (xhr.status === 308) {
        const end = rangeEnd(xhr.getResponseHeader('Range'));
        return resolve(end === null ? 0 : end + 1);
      }
      reject(new Error(`상태를 확인하지 못했어요 (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('네트워크 오류'));
    xhr.send();
  });

/** 'bytes=0-8388607' → 8388607 */
export const rangeEnd = (rangeHeader) => {
  if (!rangeHeader) return null;
  const match = String(rangeHeader).match(/bytes=\d+-(\d+)/);
  return match ? Number(match[1]) : null;
};

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export default { uploadToDrive, queryOffset, rangeEnd, CHUNK_SIZE };
