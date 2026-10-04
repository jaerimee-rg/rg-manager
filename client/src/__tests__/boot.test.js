/**
 * index.html 은 React 가 뜨기 전에 브라우저가 그대로 읽는 파일이라 컴포넌트 테스트로는 못 본다.
 * 서비스명·링크 미리보기(OG)·첫 로딩 표시가 빠지지 않았는지 문자열로 확인한다.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');

const meta = (attr, name) => {
  const m = html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`));
  return m && m[1];
};

describe('index.html — 서비스명과 링크 미리보기', () => {
  it('제목과 OG 가 JR 리듬체조다', () => {
    expect(html).toContain('<title>JR 리듬체조</title>');
    expect(meta('property', 'og:site_name')).toBe('JR 리듬체조');
    expect(meta('property', 'og:title')).toBe('JR 리듬체조');
    expect(meta('name', 'twitter:title')).toBe('JR 리듬체조');
    expect(meta('property', 'og:url')).toBe('https://rg-manager.vercel.app/');
  });

  it('OG 이미지는 운영 주소의 1200×630 PNG 이고 파일이 실제로 있다', () => {
    expect(meta('property', 'og:image')).toBe('https://rg-manager.vercel.app/og-image.png');
    expect(meta('property', 'og:image:width')).toBe('1200');
    expect(meta('property', 'og:image:height')).toBe('630');
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(existsSync(path.join(root, 'public/og-image.png'))).toBe(true);
    expect(existsSync(path.join(root, 'public/logo-mark.png'))).toBe(true);
  });

  it('앱 코드를 받는 동안 로고가 튀는 첫 로딩 표시가 #root 안에 있다', () => {
    const rootHtml = html.slice(html.indexOf('<div id="root">'), html.indexOf('<script type="module"'));
    expect(rootHtml).toContain('class="boot" role="status"');
    expect(rootHtml).toContain('<img src="/logo-mark.png" alt="">');
    expect(rootHtml).toContain('불러오는 중...');
    expect(html).toContain('@keyframes boot-hop');
  });

  it('vercel.json 이 로고·OG·아이콘 PNG 를 index.html 로 보내지 않고 파일 그대로 준다', () => {
    const vercel = JSON.parse(readFileSync(path.join(root, '../vercel.json'), 'utf8'));
    const png = vercel.routes.find((r) => r.src.includes('og-image'));
    const catchAll = vercel.routes.findIndex((r) => r.src === '/(.*)');
    expect(png).toBeDefined();
    expect(vercel.routes.indexOf(png)).toBeLessThan(catchAll);
    for (const name of ['logo-mark', 'og-image', 'icon-192', 'icon-512']) {
      expect(new RegExp(`^${png.src}$`).test(`/${name}.png`)).toBe(true);
    }
  });
});
