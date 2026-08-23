import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/FaqFile.js', () => ({
  default: {
    listByUserId: jest.fn(),
    listAll: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    delete: jest.fn()
  }
}));

jest.unstable_mockModule('../../utils/storage.js', () => ({
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
  downloadFile: jest.fn(),
  isStorageConfigured: jest.fn(() => true),
  buildPublicUrl: jest.fn(),
  getStorageConfig: jest.fn()
}));

const FaqFile = (await import('../../models/FaqFile.js')).default;
const { uploadFile, deleteFile, downloadFile, isStorageConfigured } = await import(
  '../../utils/storage.js'
);
const { listFaqFiles, uploadFaqFile, deleteFaqFile, viewFaqFile, buildLinkUrl } = await import(
  '../faqFileController.js'
);

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const teacher = { id: 3, role: 'user', username: '문아람' };
const admin = { id: 1, role: 'admin', username: 'admin' };

const uploadReq = (filename, body, user = teacher) => ({
  user,
  query: { filename },
  body
});

describe('faqFileController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isStorageConfigured.mockReturnValue(true);
    uploadFile.mockResolvedValue('https://x.supabase.co/storage/v1/object/public/faq-files/p');
    FaqFile.create.mockImplementation(async (input) => ({ id: 10, ...input }));
  });

  describe('목록', () => {
    it('일반 사용자는 자기 파일만 본다', async () => {
      FaqFile.listByUserId.mockResolvedValue([{ id: 1 }]);
      const res = mockRes();

      await listFaqFiles({ user: teacher, query: {} }, res);

      expect(FaqFile.listByUserId).toHaveBeenCalledWith(3);
      expect(FaqFile.listAll).not.toHaveBeenCalled();
    });

    it('일반 사용자가 filterUserId 를 넣어도 자기 파일만 본다', async () => {
      FaqFile.listByUserId.mockResolvedValue([]);
      const res = mockRes();

      await listFaqFiles({ user: teacher, query: { filterUserId: '99' } }, res);

      expect(FaqFile.listByUserId).toHaveBeenCalledWith(3);
    });

    it('관리자는 전체를 보고 사용자로 거를 수 있다', async () => {
      FaqFile.listAll.mockResolvedValue([]);
      const res = mockRes();

      await listFaqFiles({ user: admin, query: {} }, res);
      expect(FaqFile.listAll).toHaveBeenCalledWith();

      await listFaqFiles({ user: admin, query: { filterUserId: '3' } }, res);
      expect(FaqFile.listAll).toHaveBeenCalledWith(3);
    });

    it('저장소 설정 여부를 함께 알려준다 (화면이 안내를 띄울 수 있도록)', async () => {
      FaqFile.listByUserId.mockResolvedValue([]);
      isStorageConfigured.mockReturnValue(false);
      const res = mockRes();

      await listFaqFiles({ user: teacher, query: {} }, res);

      expect(res.json.mock.calls[0][0].storageReady).toBe(false);
    });
  });

  describe('업로드', () => {
    it('허용된 파일을 올리고 기록을 남긴다', async () => {
      const res = mockRes();

      await uploadFaqFile(uploadReq('수업안내.pdf', Buffer.from('%PDF-1.4')), res);

      expect(uploadFile).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);

      const saved = FaqFile.create.mock.calls[0][0];
      expect(saved).toMatchObject({
        userId: 3,
        filename: '수업안내.pdf',
        mimeType: 'application/pdf',
        kind: 'pdf'
      });
    });

    it('저장 경로에 사용자 id 와 난수를 넣어 서로 덮어쓰지 않게 한다', async () => {
      const res = mockRes();

      await uploadFaqFile(uploadReq('a.pdf', Buffer.from('x')), res);
      await uploadFaqFile(uploadReq('a.pdf', Buffer.from('x')), res);

      const [first, second] = FaqFile.create.mock.calls.map((c) => c[0].storagePath);
      expect(first).not.toBe(second);
      expect(first.startsWith('3/')).toBe(true);
      expect(first.endsWith('/a.pdf')).toBe(true);
    });

    it('확장자로 형식을 정한다 (브라우저가 보낸 Content-Type 을 믿지 않는다)', async () => {
      const res = mockRes();

      // 브라우저가 image/png 라고 말해도 .html 이면 html 로 다룬다
      await uploadFaqFile(uploadReq('notice.html', Buffer.from('<h1>hi</h1>')), res);

      expect(FaqFile.create.mock.calls[0][0]).toMatchObject({
        mimeType: 'text/html',
        kind: 'html'
      });
      expect(uploadFile.mock.calls[0][2]).toBe('text/html');
    });

    it('허용되지 않은 형식은 400 으로 거부하고 저장소를 건드리지 않는다', async () => {
      const res = mockRes();

      await uploadFaqFile(uploadReq('bad.js', Buffer.from('alert(1)')), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(uploadFile).not.toHaveBeenCalled();
      expect(FaqFile.create).not.toHaveBeenCalled();
    });

    it('경로 조작 시도는 파일 이름만 남긴다', async () => {
      const res = mockRes();

      await uploadFaqFile(uploadReq('../../etc/x.pdf', Buffer.from('x')), res);

      expect(FaqFile.create.mock.calls[0][0].filename).toBe('x.pdf');
      expect(FaqFile.create.mock.calls[0][0].storagePath).not.toContain('..');
    });

    it('4MB 를 넘으면 413 으로 거부한다', async () => {
      const res = mockRes();
      const tooBig = Buffer.alloc(4 * 1024 * 1024 + 1);

      await uploadFaqFile(uploadReq('big.pdf', tooBig), res);

      expect(res.status).toHaveBeenCalledWith(413);
      expect(uploadFile).not.toHaveBeenCalled();
    });

    it('빈 파일은 거부한다', async () => {
      const res = mockRes();

      await uploadFaqFile(uploadReq('a.pdf', Buffer.alloc(0)), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(uploadFile).not.toHaveBeenCalled();
    });

    it('파일 이름이 없으면 거부한다', async () => {
      const res = mockRes();

      await uploadFaqFile(uploadReq('', Buffer.from('x')), res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('저장소가 설정되지 않았으면 503 과 안내를 준다', async () => {
      isStorageConfigured.mockReturnValue(false);
      const res = mockRes();

      await uploadFaqFile(uploadReq('a.pdf', Buffer.from('x')), res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(uploadFile).not.toHaveBeenCalled();
    });

    it('저장소 업로드가 실패하면 DB 에 기록을 남기지 않는다', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      uploadFile.mockRejectedValue(new Error('storage down'));
      const res = mockRes();

      await uploadFaqFile(uploadReq('a.pdf', Buffer.from('x')), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(FaqFile.create).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('삭제', () => {
    const own = { id: 7, userId: 3, filename: 'a.pdf', storagePath: '3/x/a.pdf' };

    it('자기 파일은 저장소와 DB 양쪽에서 지운다', async () => {
      FaqFile.getById.mockResolvedValue(own);
      deleteFile.mockResolvedValue(true);
      const res = mockRes();

      await deleteFaqFile({ user: teacher, params: { id: '7' } }, res);

      expect(deleteFile).toHaveBeenCalledWith('3/x/a.pdf');
      expect(FaqFile.delete).toHaveBeenCalledWith(7);
    });

    it('남의 파일은 404 로 막는다 (있는지도 알려주지 않는다)', async () => {
      FaqFile.getById.mockResolvedValue({ ...own, userId: 99 });
      const res = mockRes();

      await deleteFaqFile({ user: teacher, params: { id: '7' } }, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(deleteFile).not.toHaveBeenCalled();
      expect(FaqFile.delete).not.toHaveBeenCalled();
    });

    it('관리자는 남의 파일도 지울 수 있다', async () => {
      FaqFile.getById.mockResolvedValue({ ...own, userId: 99 });
      deleteFile.mockResolvedValue(true);
      const res = mockRes();

      await deleteFaqFile({ user: admin, params: { id: '7' } }, res);

      expect(FaqFile.delete).toHaveBeenCalledWith(7);
    });

    it('저장소에서 못 지워도 DB 행은 지운다 (목록에 유령이 남지 않게)', async () => {
      FaqFile.getById.mockResolvedValue(own);
      deleteFile.mockResolvedValue(false);
      const res = mockRes();

      await deleteFaqFile({ user: teacher, params: { id: '7' } }, res);

      expect(FaqFile.delete).toHaveBeenCalledWith(7);
      expect(res.json.mock.calls[0][0].storageDeleted).toBe(false);
    });

    it('없는 파일은 404 를 준다', async () => {
      FaqFile.getById.mockResolvedValue(null);
      const res = mockRes();

      await deleteFaqFile({ user: teacher, params: { id: '7' } }, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('FAQ 답변에 붙일 링크 (buildLinkUrl)', () => {
    it('HTML 은 우리 서버를 거치는 주소를 준다 (Supabase 는 HTML 을 text/plain 으로 내려준다)', () => {
      const link = buildLinkUrl({ id: 5, kind: 'html', filename: '수업 안내.html', url: 'https://s/x' });

      expect(link).toBe(`/api/faq-files/5/view?name=${encodeURIComponent('수업 안내.html')}`);
    });

    it('상대 경로라 로컬에서 복사해도 프로덕션에서 열린다', () => {
      expect(buildLinkUrl({ id: 5, kind: 'html', filename: 'a.html' }).startsWith('/api/')).toBe(true);
    });

    it('PDF·이미지는 저장소 주소를 그대로 쓴다 (함수 비용을 아낀다)', () => {
      const url = 'https://s.supabase.co/storage/v1/object/public/faq-files/1/u/file.pdf?name=a.pdf';

      expect(buildLinkUrl({ id: 5, kind: 'pdf', filename: 'a.pdf', url })).toBe(url);
    });

    it('목록과 업로드 응답에 linkUrl 을 담아준다', async () => {
      FaqFile.listByUserId.mockResolvedValue([
        { id: 1, kind: 'html', filename: 'a.html', url: 'https://s/x' }
      ]);
      const res = mockRes();

      await listFaqFiles({ user: teacher, query: {} }, res);

      expect(res.json.mock.calls[0][0].files[0].linkUrl).toBe('/api/faq-files/1/view?name=a.html');
    });
  });

  describe('파일 열기 (학부모용, 로그인 없음)', () => {
    const htmlFile = {
      id: 5,
      kind: 'html',
      mimeType: 'text/html',
      storagePath: '1/u/file.html',
      filename: '수업 안내.html'
    };

    const viewRes = () => {
      const res = mockRes();
      res.setHeader = jest.fn();
      res.send = jest.fn();
      return res;
    };

    it('올바른 Content-Type 으로 내보낸다 (그래야 페이지로 열린다)', async () => {
      FaqFile.getById.mockResolvedValue(htmlFile);
      downloadFile.mockResolvedValue(Buffer.from('<h1>hi</h1>'));
      const res = viewRes();

      await viewFaqFile({ params: { id: '5' } }, res);

      const headers = Object.fromEntries(res.setHeader.mock.calls);
      expect(headers['Content-Type']).toBe('text/html; charset=utf-8');
      expect(res.send).toHaveBeenCalled();
    });

    it('CSP sandbox 를 붙여 우리 앱 로그인 정보와 분리한다', async () => {
      FaqFile.getById.mockResolvedValue(htmlFile);
      downloadFile.mockResolvedValue(Buffer.from('x'));
      const res = viewRes();

      await viewFaqFile({ params: { id: '5' } }, res);

      const headers = Object.fromEntries(res.setHeader.mock.calls);
      // allow-same-origin 이 있으면 sandbox 를 스스로 풀 수 있다.
      expect(headers['Content-Security-Policy']).toContain('sandbox');
      expect(headers['Content-Security-Policy']).not.toContain('allow-same-origin');
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
    });

    it('없는 파일은 404 를 준다', async () => {
      FaqFile.getById.mockResolvedValue(null);
      const res = viewRes();

      await viewFaqFile({ params: { id: '5' } }, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(downloadFile).not.toHaveBeenCalled();
    });
  });
});
