# 디자인 시스템

Deel(`app.deel.com`) 앱의 **디자인 시스템 문법**을 참고해 rg-manager 의 화면 언어를
다시 정리한 결과다. 색·서체·브랜드는 rg-manager 고유의 것을 그대로 쓰고,
가져온 것은 **구조**다 — 서피스를 그림자 대신 1px 보더로 나누는 평면 스타일,
중간 크기 라운드(10/16/24), 40px 컨트롤, 알약 배지, 14/24 본문, 400·500 위주의 가벼운 웨이트.

## 한 줄 요약

> 같은 모양을 페이지마다 다시 만들지 않는다.
> 화면을 만들기 전에 `client/src/components/ui` 에서 먼저 찾는다.

앱을 실행하고 **`/design-system`** 에 들어가면 전체 목록을 눈으로 볼 수 있다.

## 파일 구조

| 파일 | 역할 |
| --- | --- |
| `client/src/styles/tokens.css` | 색·타이포·간격·라운드·컨트롤 높이·브레이크포인트 등 **모든 상수** |
| `client/src/styles/ui.css` | 컴포넌트 스타일. 컴포넌트 하나당 한 블록 |
| `client/src/components/ui/` | React 컴포넌트. `index.js` 가 진입점 |
| `client/src/pages/DesignSystem.jsx` | `/design-system` 목록 화면 |
| `client/src/styles/App.css` | 옛 클래스(`.btn`, `.card` …). 아래 "브리지" 참고 |

```jsx
import { Button, Card, DataTable, Modal, PageHeader } from '../components/ui';
```

## 토큰

숫자를 화면에 직접 쓰지 않는다. `padding: 14px` 대신 `padding: var(--space-4)`.

- **잉크** `--ink-900`(본문) → `--ink-600`(보조) → `--ink-500`(캡션) → `--ink-200`(보더)
- **서피스** `--surface`(흰색) / `--surface-sunken`(페이지 배경) / `--surface-muted`
- **브랜드** `--brand-500` — rg-manager 고유 파랑. 강조가 필요한 한 곳에만 쓴다
- **의미색** `--success-* / --warning-* / --danger-* / --info-*` (각각 `fg`·`bg`·`border`)
- **간격** `--space-1`(4px) … `--space-10`(64px)
- **라운드** `--radius-sm`(8) `--radius-md`(10, 버튼·입력) `--radius-xl`(16, 카드) `--radius-2xl`(24, 시트)
- **컨트롤 높이** `--control-sm`(32) `--control-md`(40, 기본) `--control-lg`(48)
- **타이포** `--text-base`/`--leading-base`(14/24) 부터 `--text-4xl`(32/40) 까지

### 그림자를 쓰지 않는 이유

서피스는 **1px 보더**로 나눈다. 그림자(`--shadow-popover`, `--shadow-overlay`)는
실제로 떠 있는 것 — 팝오버·메뉴·모달 — 에만 쓴다. 카드에 그림자를 넣지 않는다.

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

## 컴포넌트

### 레이아웃
`Container` `Stack` `Row` `Grid` `Divider` `Section`
`AppShell` `Topbar` `Main` `NavItem` `NavSection` `SubNav` `DetailLayout` `StickyActions`

### 액션
`Button` `IconButton` `ButtonGroup` `Menu`/`MenuItem` `Popover` `Toolbar` `Chip` `Tabs` `Segmented`

### 표시
`Card` `Badge` `Tag` `Avatar` `AvatarGroup` `Stat` `IconTile` `DataTable`
`List`/`ListRow` `DescriptionList` `Breadcrumb` `PageHeader` `Icon`

### 입력
`Field` `Input` `Textarea` `Select` `InputGroup` `Checkbox` `Radio`
`Switch` `SwitchField` `Choice` `SearchInput`

### 피드백
`Callout` `PromoCard` `EmptyState` `Modal` `ConfirmDialog`
`Skeleton` `SkeletonList` `Progress` `Pagination` `Tooltip` `InfoHint`

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
<Field label="질문" required counter={{ value: q.length, max: 200 }}>
  {(props) => <Input value={q} onChange={…} {...props} />}
</Field>
```
`Field` 가 라벨-입력 연결(`id`), 힌트/오류(`aria-describedby`), 글자 수, `aria-invalid`
를 모두 맡는다.

## 아이콘

이모지(📅 📍 🏆) 대신 `Icon` 을 쓴다. 이모지는 기기마다 모양이 달라지고 크기·색을
글자와 함께 제어할 수 없다. 아이콘은 24px 그리드에 stroke 1.5 로 통일돼 있고,
목록은 `/design-system` 의 **기초 → 아이콘** 에 있다.

```jsx
<Icon name="calendar" size={16} />
```

없는 아이콘이 필요하면 `components/ui/Icon.jsx` 의 `paths` 에 추가한다.

## 옛 클래스와의 브리지

`App.css` 는 아직 `.btn` `.card` `.badge` `.empty-state` 같은 옛 클래스를 쓰는
화면들을 위해 남아 있다. 두 가지가 되어 있다.

1. **토큰 별칭** — `--color-gray-700` 같은 옛 이름이 새 토큰을 가리킨다.
   그래서 옮기지 않은 화면도 새 색·간격을 그대로 따라간다.
2. **브리지 블록** (`App.css` 아래쪽 `DESIGN SYSTEM BRIDGE`) — 옛 클래스를 새 문법에
   맞춰 다시 칠한다.

> `--radius-sm/md/lg/xl` 은 두 파일에 같은 이름이 있다. `App.css` 에서 다시 정의하면
> 새 컴포넌트 값까지 덮어써서 무너지므로 **별칭을 두지 않았다.**

**새 코드에서는 옛 클래스를 쓰지 않는다.** 화면을 손볼 일이 생기면 그 김에
`components/ui` 로 옮기고, 그 화면이 마지막 사용처였다면 브리지에서 해당 규칙을 지운다.

## 규칙

1. `style={{ … }}` 를 새로 쓰지 않는다. 필요하면 컴포넌트나 `ui.css` 에 추가한다.
2. 토큰에 없는 숫자·색을 쓰지 않는다.
3. 같은 모양이 두 번째로 필요해지면 그때 컴포넌트로 만든다.
4. 컴포넌트를 추가하면 `index.js` · `/design-system` 화면 · 테스트를 함께 갱신한다.
5. 터치 타깃은 44px 이상 (`--control-md` 는 모바일에서 자동으로 44px 이 된다).
6. 반응형은 CSS 로 한다. `useIsMobile()` 은 정말 동작이 달라질 때만 쓴다.

## 남은 일

옛 클래스와 인라인 스타일이 남아 있는 화면들이 있다. 화면을 만질 때마다 하나씩 옮긴다.
현황은 이렇게 센다.

```bash
cd client/src && grep -rho "style={{" --include="*.jsx" . | wc -l
```
