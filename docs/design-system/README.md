# 디자인 시스템

**종이 위의 잉크 손그림.** 원본은 클릭 목업(`../mockup/`, 저장소 밖 작업 폴더)이고,
그 시각 언어를 rg-manager 의 토큰 · 컴포넌트로 옮긴 결과다.

- 바탕은 **종이**, 선과 제목은 **검정 잉크**, 강조색은 **별 노랑 하나**
- **빨강**은 오류 · 되돌릴 수 없는 동작에만, **카카오 노랑**은 카카오 버튼에만
- 서피스는 그림자 대신 **잉크 선(2px)** 으로 나누고, 테두리는 **손으로 그린 듯 살짝 일렁인다**
- 서체 셋: 제목 **Black Han Sans** · 본문 **Pretendard** · 말을 거는 한 줄 **Gaegu** 손글씨
- 장식 셋: 목록 화면 제목 옆 **별 세 개**, 활성 탭 아래 **지그재그**, 현재 메뉴 아래 **형광펜**

## 한 줄 요약

> 같은 모양을 페이지마다 다시 만들지 않는다.
> 화면을 만들기 전에 `client/src/components/ui` 에서 먼저 찾는다.

앱을 실행하고 **`/design-system`** 에 들어가면 전체 목록을 눈으로 볼 수 있다 (로그인 없이 열린다).

## 파일 구조

| 파일 | 역할 |
| --- | --- |
| `client/src/styles/tokens.css` | 색 · 서체 · 간격 · 선 · 손그림 모양 · 장식 · 컨트롤 높이 등 **모든 상수** |
| `client/src/styles/ui.css` | 컴포넌트 스타일. 컴포넌트 하나당 한 블록 |
| `client/src/components/ui/` | React 컴포넌트. `index.js` 가 진입점 |
| `client/src/pages/DesignSystem.jsx` | `/design-system` 목록 화면 |
| `client/src/styles/App.css` | 옛 클래스(`.btn`, `.card` …). 아래 "브리지" 참고 |
| `client/index.html` | 서체 세 가지를 불러온다 (Pretendard: jsDelivr, Black Han Sans · Gaegu: Google Fonts) |

```jsx
import { Button, Card, DataTable, Modal, PageHeader } from '../components/ui';
```

## 토큰

숫자를 화면에 직접 쓰지 않는다. `padding: 14px` 대신 `padding: var(--space-4)`.

### 색

| 토큰 | 값 | 쓰임 |
| --- | --- | --- |
| `--paper` | `#ECE9E2` | 페이지 바탕 (`body` 에 종이 결 `--grain` 을 함께 깐다) |
| `--sheet` (= `--surface`) | `#F8F6F1` | 카드 · 패널 · 모달 |
| `--field` | `#FFFFFF` | 입력칸 |
| `--ink` | `#000000` | 선 · 제목 · 주요 버튼 |
| `--ink-800` | `#262522` | 본문 |
| `--pencil` (= `--ink-600`) | `#6E6C67` | 보조 글 · 캡션 |
| `--rule` / `--rule-soft` | `#CFCAC0` / `#E0DCD3` | 구분선 · 표 행 선 |
| `--star` / `--star-soft` | `#F1DE6E` / `#F8EEB4` | 유일한 강조색 · 옅은 강조 |
| `--alert` / `--alert-soft` | `#D2342B` / `#F6DCD8` | 오류 · 되돌릴 수 없는 동작 |
| `--kakao` | `#FEE500` | 카카오 버튼 전용 |

- `--brand-*` 는 이제 **별 노랑** 램프다. 별 노랑 위 글자는 잉크(`--brand-700` = 잉크).
  **노랑을 글자색으로 쓰지 않는다** — 종이 위에서 읽히지 않는다 (테스트가 막는다).
- 의미색: **success** 는 별 노랑(활동 중 · 완료), **warning** 은 옅은 별 노랑(확인 필요), **danger** 만 빨강.
  초록 · 파랑은 쓰지 않는다. `--muted-*` 는 연필 점선(대기 · 비활성).
- 기본 선 `--border` 는 잉크다. 연한 구분선이 필요하면 `--rule` 을 쓴다.

### 서체

| 토큰 | 서체 | 쓰임 |
| --- | --- | --- |
| `--font-display` | Black Han Sans | 페이지 · 카드 · 모달 제목, 통계 숫자, 큰 주요 버튼(`size="lg"`) |
| `--font-sans` | Pretendard Variable | 본문 · UI 전부 |
| `--font-hand` | Gaegu | 입력칸 도움말, 빈 화면 설명, 드롭존 안내 — 말을 거는 한두 줄만 |

- Black Han Sans 는 **굵기가 하나뿐**이다. `font-weight` 를 주지 말고(400), 가짜 볼드는
  `html { font-synthesis: none }` 이 막는다.
- 손글씨는 같은 크기에서 작아 보여서 `--hand-sm/md/lg`(16/18/20) 로 한 단계 키워 쓴다.
- 본문 15/24, UI 굵기는 600 · 700 위주(버튼 · 라벨 700, 메뉴 · 표 머리 600).

### 선과 모양

- 선: `--stroke`(2px 잉크 — 카드 · 표 · 버튼), `--stroke-thin`(1.5px — 입력칸 · 배지 · 칩)
- 손그림 테두리(`border-radius` 에 통째로 넣는다):
  `--shape-panel`(카드 · 표 · 모달) `--shape-box`(알림 · 메뉴 · 세그먼트) `--shape-field`(입력칸)
  `--shape-btn`(버튼 · 칩 · 토스트) `--shape-tag`(배지) `--shape-blob`(아바타 · 원형 아이콘)
- 숫자 라운드 `--radius-*` 는 그대로 있다 — `border-radius: var(--radius-md) 0 0 var(--radius-md)` 처럼
  조합하는 곳이 있어서다.

### 장식

- `--doodle-stars` — 별 세 개. `PageHeader` 가 목록 화면(뒤로 가기 없음)이면 제목 옆에 붙인다.
  `doodle={false}` 로 끄고 `doodle` 로 하위 화면에도 켠다. 옛 `.page-title` 에도 붙는다.
- `--zigzag` — 활성 탭 밑줄, `<Divider variant="zig" />`
- `--highlight` — 형광펜. 현재 메뉴(사이드바 · 상단 · 탭 바), `.ui-highlight`, 링크 호버
- `--grain` — 종이 결. `body` · 사이드바 · 상단바 · 모바일 메뉴 배경

### 포커스 · 그림자

- 포커스: `--focus-ring`(잉크 2px 안 + 별 노랑 3px 밖), 입력칸은 `--focus-field`(별 노랑 3px)
- 그림자는 쓰지 않는다. 메뉴 · 팝오버처럼 실제로 떠 있는 것만 `--shadow-popover`.

### 그 밖의 토큰

- **간격** `--space-1`(4px) … `--space-10`(64px)
- **컨트롤 높이** `--control-sm`(32) `--control-md`(40, 기본) `--control-lg`(52, 제목 서체 주요 버튼)
- **타이포** `--text-base`/`--leading-base`(15/24) 부터 `--text-4xl`(34/40) 까지,
  제목 서체 크기 `--display-sm/md/lg/xl`(18/19/22/30)

## 반응형

브레이크포인트는 셋이다.

| | 폭 | 특징 |
| --- | --- | --- |
| 모바일 | ~767px | 1열, 컨트롤 44px, 표는 카드로 쌓임, 모달은 바텀시트 |
| 태블릿 | 768~1279px | 2열, 사이드바 고정(200px) |
| 데스크탑 | 1280px~ | 지정 열 수, 사이드바 236px, **콘텐츠는 전체 폭** |

데스크탑에서 콘텐츠 폭을 제한하지 않는다(`--shell-max: 100%`). 좌우 여백만
`--shell-gutter` 로 넓어진다. 글을 읽는 화면만 `<Container width="reading">` 으로 좁힌다.

반응형은 **CSS 가 처리한다.** `useIsMobile()` 로 JSX 를 갈라 쓰지 않는다 —
같은 목록을 표용·카드용으로 두 벌 만들던 게 중복의 가장 큰 원인이었다.
`DataTable` 은 컬럼 정의 하나로 데스크탑 표와 모바일 카드를 모두 만든다.

행마다 해당 없는 칸은 `column.hidden(row)` 으로 비운다. 표에서는 열을 맞추려고
빈 칸으로 남고, 모바일 카드에서는 줄째로 사라진다 — `"—"` 로 채우는 것보다 짧게 읽힌다.

```jsx
{ key: 'location', header: '장소', hidden: (event) => event.type === 'closure' }
```

## 컴포넌트

### 레이아웃
`Container` `Stack` `Row` `Grid` `Divider`(`variant="zig"`) `Section`
`AppShell` `Topbar` `Main` `NavItem` `NavSection` `SubNav` `DetailLayout` `StickyActions`

### 액션
`Button` `IconButton` `ButtonGroup` `Menu`/`MenuItem` `Popover` `Toolbar` `Chip` `Tabs` `Segmented`

| Button variant | 모양 | 쓰임 |
| --- | --- | --- |
| `primary` | 잉크 채움 | 화면의 주요 액션 |
| `brand` | 별 노랑 채움 | 강조가 필요한 한 곳 |
| `secondary` / `outline` | 종이 + 잉크 선 (outline 은 가는 선) | 보조 액션 |
| `ghost` | 선 없음 | 툴바 · 머리말의 가벼운 액션 |
| `danger` | 빨강 채움 | 되돌릴 수 없는 확정(확인 창의 "삭제") |
| `danger-quiet` | 빨간 선 | 목록 행의 삭제 |

### 표시
`Card` `Badge` `Tag` `Avatar` `AvatarGroup` `Stat` `IconTile` `DataTable`
`List`/`ListRow` `DescriptionList` `Breadcrumb` `PageHeader` `Icon`

- `Badge tone`: `neutral` 종이 · `brand` 옅은 별 · `success` 별(활동 중) · `warning` 옅은 별 + 점선(확인 필요) ·
  `danger` 빨강 · `solid` 잉크(확정) · `muted` 연필 점선(대기 · 비활성)
- `Stat variant`: `star`(지금 봐야 할 숫자) · `ink`(합계) · `alert`(바로 처리할 것). 숫자는 제목 서체.
  `tone` 은 오른쪽 아이콘 동그라미 색이다.

### 입력
`Field` `Input` `Textarea` `Select` `InputGroup` `Checkbox` `Radio`
`Switch` `SwitchField` `Choice` `SearchInput`

### 피드백
`Callout` `PromoCard` `EmptyState` `Modal` `ConfirmDialog`
`Skeleton` `SkeletonList` `Progress` `Pagination` `Tooltip` `InfoHint`

- `Callout tone`: `warning` 별 노랑 배너(확인할 것) · `brand`/`success` 옅은 별 · `neutral` 종이 · `danger` 빨강
- `EmptyState`: 동그라미 아이콘 + 제목 서체 + 손글씨 설명

### 셸
- 선생님: 상단 머리말(`App.jsx`, `.app-header`) — 종이 결 + 잉크 선, 현재 메뉴 형광펜
- 관리자: 사이드바(`AdminLayout.jsx`) — 선 아이콘, 현재 메뉴 형광펜
- 학부모: `ParentLayout` — 위 제목 줄(제목 서체) + 아래 탭 바(`.ui-mobile-app` · `.ui-tabbar`), 현재 탭 형광펜

## 자주 쓰는 조합

**페이지 뼈대**
```jsx
<PageHeader
  title="이벤트 관리"
  description="대회·스페셜 이벤트·휴관일을 등록합니다."
  actions={<Button variant="primary" icon="plus">이벤트</Button>}
/>
<Toolbar>
  <Chip selected>전체</Chip>
  <Chip count={12}>대회</Chip>
</Toolbar>
<DataTable columns={columns} rows={rows} empty={<EmptyState … />} />
```

**모달 = 바텀시트**
`Modal` 하나가 모바일에서는 아래에서 올라오는 시트로, 768px 이상에서는 가운데
모달로 뜬다. Esc·바깥 클릭·포커스 가둠·배경 스크롤 잠금이 모두 들어 있으므로
`position: fixed` 오버레이를 직접 만들지 않는다.

**폼**
```jsx
<Field label="질문" required hint="학부모가 보는 문장이에요." counter={{ value: q.length, max: 200 }}>
  {(props) => <Input value={q} onChange={…} {...props} />}
</Field>
```
`Field` 가 라벨-입력 연결(`id`), 힌트/오류(`aria-describedby`), 글자 수, `aria-invalid`
를 모두 맡는다. 힌트는 손글씨로 나온다.

## 아이콘

이모지(📅 📍 🏆) 대신 `Icon` 을 쓴다. 이모지는 기기마다 모양이 달라지고 크기·색을
글자와 함께 제어할 수 없다. 아이콘은 24px 그리드에 **stroke 1.8**(잉크 펜 굵기)로 통일돼 있고,
목록은 `/design-system` 의 **기초 → 아이콘** 에 있다. 메뉴(선생님 · 관리자 · 학부모 탭 바)는 모두 선 아이콘이다.

```jsx
<Icon name="calendar" size={16} />
```

없는 아이콘이 필요하면 `components/ui/Icon.jsx` 의 `paths` 에 추가한다.

## 옛 클래스와의 브리지

`App.css` 는 아직 `.btn` `.card` `.badge` `.empty-state` 같은 옛 클래스를 쓰는
화면들을 위해 남아 있다. 세 가지가 되어 있다.

1. **토큰 별칭** — `--color-gray-700` 같은 옛 이름이 새 토큰을 가리킨다.
   옛 화면이 인라인 스타일로 쓰는 `--color-primary` 는 **잉크**다(글자색과 흰 글씨 버튼 배경 둘 다로
   쓰여서 노랑이면 안 읽힌다). `--color-primary-bg` 만 옅은 별 노랑이다.
2. **날것의 입력칸** — `input[type="text"]` 같은 원소 선택자가 `.ui-input` 보다 세서 모든 입력칸의
   모양을 브리지가 정한다(흰 칸 + 잉크 1.5px + 손그림 테두리).
3. **브리지 블록** (`App.css` 아래쪽 `DESIGN SYSTEM BRIDGE`) — 옛 클래스와 선생님 머리말 · 관리자
   사이드바 · 모바일 메뉴를 새 문법에 맞춰 다시 칠한다.

> `--radius-sm/md/lg/xl` 은 두 파일에 같은 이름이 있다. `App.css` 에서 다시 정의하면
> 새 컴포넌트 값까지 덮어써서 무너지므로 **별칭을 두지 않았다.**

**새 코드에서는 옛 클래스를 쓰지 않는다.** 화면을 손볼 일이 생기면 그 김에
`components/ui` 로 옮기고, 그 화면이 마지막 사용처였다면 브리지에서 해당 규칙을 지운다.

## 테스트

- `components/ui/__tests__/design-tokens.test.js` — 팔레트 값이 목업과 같은지, 세 서체를 불러오는지,
  예전 파랑이 남지 않았는지, 노랑을 글자색으로 쓰지 않는지 스타일시트 원본을 읽어 확인한다.
- `components/ui/__tests__/paper-ink.test.js` — `PageHeader doodle`, `Stat variant`, `Badge muted`,
  `Divider zig`, 아이콘, 학부모 탭 바.
- `e2e/design.spec.mjs` (Playwright `design` 프로젝트) — 실제 브라우저에서 계산된 색 · 선 · 서체,
  서체가 CDN 에서 실제로 내려오는지(닿지 않는 환경이면 건너뜀), 세 역할의 셸.

## 규칙

1. `style={{ … }}` 를 새로 쓰지 않는다. 필요하면 컴포넌트나 `ui.css` 에 추가한다.
2. 토큰에 없는 숫자·색을 쓰지 않는다. 남은 인라인 스타일도 `var(--surface)` · `var(--stroke)` ·
   `var(--shape-panel)` 처럼 토큰을 쓴다.
3. 같은 모양이 두 번째로 필요해지면 그때 컴포넌트로 만든다.
4. 컴포넌트를 추가하면 `index.js` · `/design-system` 화면 · 테스트를 함께 갱신한다.
5. 터치 타깃은 44px 이상 (`--control-md` 는 모바일에서 자동으로 44px 이 된다).
6. 반응형은 CSS 로 한다. `useIsMobile()` 은 정말 동작이 달라질 때만 쓴다.

## 남은 일

옛 클래스와 인라인 스타일이 남아 있는 화면들이 있다. 색은 토큰으로 맞췄지만 모양은 여전히
인라인이다. 화면을 만질 때마다 하나씩 `components/ui` 로 옮긴다. 현황은 이렇게 센다.

```bash
cd client/src && grep -rho "style={{" --include="*.jsx" . | wc -l
```
