import crypto from 'crypto';
import FaqFile from '../models/FaqFile.js';
import {
  MAX_FILE_BYTES,
  ALLOWED_EXTENSIONS,
  lookupType,
  sanitizeFilename,
  toStorageSafeName
} from '../utils/faqFileTypes.js';
import { uploadFile, deleteFile, downloadFile, isStorageConfigured } from '../utils/storage.js';

/**
 * FAQ 답변에 붙일 링크.
 *
 * HTML 은 우리 서버를 거쳐야 페이지로 열린다 (Supabase 는 HTML 을 text/plain 으로 내려준다).
 * 나머지는 저장소 주소를 그대로 써서 함수 비용·지연을 아낀다.
 * 상대 경로라 로컬에서 복사한 링크가 프로덕션에서도 그대로 열린다.
 */
export const buildLinkUrl = (file) =>
  file.kind === 'html'
    ? `/api/faq-files/${file.id}/view?name=${encodeURIComponent(file.filename)}`
    : file.url;

const withLink = (file) => ({ ...file, linkUrl: buildLinkUrl(file) });

/**
 * 파일 목록.
 * 관리자는 filterUserId 로 다른 선생님 파일도 볼 수 있고, 일반 사용자는 자기 것만 본다.
 */
export const listFaqFiles = async (req, res) => {
  try {
    const { id: userId, role } = req.user;

    let files;
    if (role === 'admin') {
      const { filterUserId } = req.query;
      if (filterUserId && filterUserId !== 'all') {
        const parsed = parseInt(filterUserId, 10);
        if (isNaN(parsed)) return res.status(400).json({ error: '잘못된 사용자 ID입니다.' });
        files = await FaqFile.listAll(parsed);
      } else {
        files = await FaqFile.listAll();
      }
    } else {
      files = await FaqFile.listByUserId(userId);
    }

    res.json({ files: files.map(withLink), storageReady: isStorageConfigured() });
  } catch (error) {
    console.error('FAQ 파일 목록 조회 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 파일 업로드.
 * 본문은 파일 바이트 그대로 받는다 (express.raw). base64 로 감싸면 용량이 33% 늘어
 * Vercel 요청 한도(4.5MB)에 더 빨리 걸린다.
 * 파일명은 쿼리스트링으로 받는다.
 */
export const uploadFaqFile = async (req, res) => {
  try {
    if (!isStorageConfigured()) {
      return res.status(503).json({
        error: '파일 저장소가 설정되지 않았습니다. 서버 환경변수를 확인해 주세요.'
      });
    }

    const filename = sanitizeFilename(req.query.filename || '');
    if (!filename) {
      return res.status(400).json({ error: '파일 이름이 필요합니다.' });
    }

    // 확장자로 판단한다. 브라우저가 보낸 Content-Type 은 믿지 않는다.
    const type = lookupType(filename);
    if (!type) {
      return res.status(400).json({
        error: `허용되지 않는 형식입니다. (${ALLOWED_EXTENSIONS.join(', ')})`
      });
    }

    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ error: '파일 내용이 비어 있습니다.' });
    }
    if (buffer.length > MAX_FILE_BYTES) {
      return res.status(413).json({
        error: `파일이 너무 큽니다. ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB 이하만 올릴 수 있습니다.`
      });
    }

    // 경로에 난수를 넣어 같은 이름을 여러 번 올려도 서로 덮어쓰지 않게 한다.
    // 주소를 추측해 남의 파일을 찾는 것도 막는다.
    // 키에는 ASCII 만 쓸 수 있으므로(Supabase 제약) 원래 이름은 ?name= 에 담는다.
    const storagePath = `${req.user.id}/${crypto.randomUUID()}/${toStorageSafeName(filename)}`;
    const publicUrl = await uploadFile(storagePath, buffer, type.mime);
    const url = `${publicUrl}?name=${encodeURIComponent(filename)}`;

    const saved = await FaqFile.create({
      userId: req.user.id,
      filename,
      storagePath,
      mimeType: type.mime,
      kind: type.kind,
      size: buffer.length,
      url
    });

    res.status(201).json(withLink(saved));
  } catch (error) {
    console.error('FAQ 파일 업로드 오류:', error?.message || error);
    res.status(500).json({ error: '파일 업로드에 실패했습니다.' });
  }
};

export const deleteFaqFile = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const fileId = parseInt(req.params.id, 10);
    if (isNaN(fileId)) return res.status(400).json({ error: '잘못된 파일 ID입니다.' });

    const file = await FaqFile.getById(fileId);
    // 남의 파일은 존재 여부도 알려주지 않는다.
    if (!file || (role !== 'admin' && file.userId !== userId)) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    // 저장소에서 먼저 지운다. 실패해도 DB 행은 지워 목록에 유령이 남지 않게 한다.
    const removed = await deleteFile(file.storagePath);
    await FaqFile.delete(fileId);

    res.json({
      message: '파일이 삭제되었습니다.',
      storageDeleted: removed
    });
  } catch (error) {
    console.error('FAQ 파일 삭제 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 업로드한 파일을 학부모에게 보여준다. 로그인 없이 열려야 하므로 인증하지 않는다
 * (주소에 난수가 들어 있어 추측할 수 없다 — 저장소 공개 주소와 같은 수준의 노출이다).
 *
 * HTML 을 우리 도메인에서 내보내므로 CSP sandbox 를 함께 보낸다.
 * sandbox 에 allow-same-origin 을 주지 않아 문서는 고유(빈) 출처를 갖고,
 * 우리 앱의 localStorage·쿠키에 접근할 수 없다. Supabase 가 쓰는 방식과 같다.
 */
export const viewFaqFile = async (req, res) => {
  try {
    const fileId = parseInt(req.params.id, 10);
    if (isNaN(fileId)) return res.status(400).send('잘못된 요청입니다.');

    const file = await FaqFile.getById(fileId);
    if (!file) return res.status(404).send('파일을 찾을 수 없습니다.');

    const buffer = await downloadFile(file.storagePath);

    res.setHeader('Content-Type', `${file.mimeType}; charset=utf-8`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // 새 탭으로 열어도 sandbox 가 적용된다 (iframe sandbox 속성과 별개의 방어선).
    res.setHeader('Content-Security-Policy', 'sandbox allow-scripts allow-popups allow-forms');
    // 파일은 난수 경로로 불변이므로 오래 캐시해도 안전하다.
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (error) {
    console.error('FAQ 파일 열기 오류:', error?.message || error);
    res.status(500).send('파일을 여는 중 오류가 발생했습니다.');
  }
};
