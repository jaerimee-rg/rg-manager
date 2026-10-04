import React, { useState } from 'react';
import {
  Avatar, AvatarGroup, Badge, Breadcrumb, Button, ButtonGroup, Callout, Card, CardFooter,
  CardHeader, Checkbox, Chip, Choice, DataTable, DescriptionList, Divider, EmptyState, Field,
  Grid, Icon, IconButton, IconTile, Input, InputGroup, List, ListRow, Menu, MenuItem,
  MenuSeparator, Modal, PageHeader, Pagination, Popover, Progress, PromoCard, Radio, Row,
  SearchInput, Section, Segmented, Select, Skeleton, Stack, Stat, Switch, SwitchField, Tabs, Tag, Textarea,
  Toolbar, Tooltip, InfoHint, iconNames
} from '../components/ui';

/**
 * 디자인 시스템 목록 화면.
 * 새 화면을 만들기 전에 여기서 쓸 컴포넌트를 먼저 찾는다.
 * 여기 없는 모양이 필요하면 페이지에 인라인으로 만들지 말고
 * components/ui 에 추가한 뒤 이 화면에도 올린다.
 */
function Swatch({ token, name }) {
  return (
    <Stack gap={1}>
      <div
        style={{
          height: 48,
          borderRadius: 'var(--shape-box)',
          background: `var(${token})`,
          border: 'var(--stroke-thin)'
        }}
      />
      <span className="ui-text-xs ui-text-muted">{name}</span>
      <span className="ui-text-xs ui-text-subtle">{token}</span>
    </Stack>
  );
}

function DesignSystem() {
  const [tab, setTab] = useState('foundation');
  const [modalOpen, setModalOpen] = useState(false);
  const [checked, setChecked] = useState(true);
  const [switched, setSwitched] = useState(true);
  const [view, setView] = useState('list');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(2);
  const [picked, setPicked] = useState('b');
  const [memo, setMemo] = useState('');

  const tableRows = [
    { id: 1, name: '김하늘', klass: '화·목 초등부', status: 'active', count: 12 },
    { id: 2, name: '이서연', klass: '월·수 유아부', status: 'pending', count: 4 },
    { id: 3, name: '박지우', klass: '토 선수반', status: 'off', count: 0 }
  ];

  const tableColumns = [
    {
      key: 'name',
      header: '학생',
      render: (row) => (
        <Row gap={3}>
          <Avatar name={row.name} />
          <span className="ui-list-row__title">{row.name}</span>
        </Row>
      )
    },
    { key: 'klass', header: '수업' },
    {
      key: 'status',
      header: '상태',
      render: (row) => (
        <Badge dot tone={row.status === 'active' ? 'success' : row.status === 'pending' ? 'warning' : 'muted'}>
          {row.status === 'active' ? '수강 중' : row.status === 'pending' ? '대기' : '휴원'}
        </Badge>
      )
    },
    { key: 'count', header: '출석', numeric: true, render: (row) => `${row.count}회` }
  ];

  return (
    <div className="ui-container">
      <PageHeader
        title="디자인 시스템"
        description="화면을 만들 때 쓰는 컴포넌트 모음이에요. 같은 모양을 페이지마다 다시 만들지 말고 여기 있는 걸 가져다 쓰세요."
        actions={<Button variant="primary" icon="plus">컴포넌트 추가</Button>}
      />

      <Tabs
        className="ui-mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'foundation', label: '기초' },
          { id: 'actions', label: '액션' },
          { id: 'data', label: '데이터' },
          { id: 'forms', label: '입력' },
          { id: 'feedback', label: '피드백' }
        ]}
      />

      {tab === 'foundation' && (
        <Stack gap={6}>
          <Card>
            <CardHeader
              title="색"
              description="바탕은 종이, 선과 제목은 검정 잉크, 강조색은 별 노랑 하나. 빨강은 오류·되돌릴 수 없는 동작에만, 카카오 노랑은 카카오 버튼에만."
            />
            <Grid cols={4} auto>
              <Swatch token="--paper" name="종이 (페이지 바탕)" />
              <Swatch token="--sheet" name="한 장 (카드·패널)" />
              <Swatch token="--field" name="입력칸" />
              <Swatch token="--ink" name="잉크 (선·제목)" />
              <Swatch token="--pencil" name="연필 (보조 글)" />
              <Swatch token="--rule" name="연필 선 (구분선)" />
              <Swatch token="--star" name="별 노랑 (강조)" />
              <Swatch token="--star-soft" name="옅은 별 (확인 필요)" />
              <Swatch token="--alert" name="빨강 (오류)" />
              <Swatch token="--alert-soft" name="옅은 빨강" />
              <Swatch token="--kakao" name="카카오 (버튼 전용)" />
            </Grid>
          </Card>

          <Card>
            <CardHeader
              title="타이포그래피"
              description="제목은 Black Han Sans, 본문은 Pretendard, 말을 거는 한 줄은 Gaegu 손글씨. 본문 15/24."
            />
            <Stack gap={3}>
              <div className="ui-display" style={{ fontSize: 'var(--text-4xl)', lineHeight: 'var(--leading-4xl)' }}>
                페이지 제목 34/40 · Black Han Sans
              </div>
              <div className="ui-display" style={{ fontSize: 'var(--display-lg)' }}>모달 제목 22 · Black Han Sans</div>
              <div className="ui-display" style={{ fontSize: 'var(--display-md)' }}>카드 제목 19 · Black Han Sans</div>
              <div>본문 15/24 · Pretendard — 리듬체조 수업 출석과 이벤트 신청을 한곳에서 관리합니다.</div>
              <div className="ui-text-sm ui-text-muted">보조 13/18 — 부가 설명에 쓴다.</div>
              <div className="ui-text-xs ui-text-subtle">캡션 12/16 — 라벨과 메타 정보.</div>
              <div className="ui-hand">손글씨 18 · Gaegu — 도움말과 빈 화면 문구처럼 한두 줄만.</div>
              <div>강조할 단어는 <span className="ui-highlight">형광펜</span>으로 칠한다.</div>
            </Stack>
          </Card>

          <Card>
            <CardHeader
              title="선과 모양"
              description="서피스는 그림자 대신 잉크 선으로 나눈다. 테두리는 손으로 그린 듯 살짝 일렁인다 — 작은 것은 크게, 큰 패널은 살짝."
            />
            <Grid cols={4} auto>
              {[
                ['--shape-panel', '카드 · 표 · 모달', 'var(--stroke)'],
                ['--shape-box', '알림 · 메뉴 · 세그먼트', 'var(--stroke)'],
                ['--shape-field', '입력칸', 'var(--stroke-thin)'],
                ['--shape-btn', '버튼 · 칩 · 토스트', 'var(--stroke)'],
                ['--shape-tag', '배지', 'var(--stroke-thin)'],
                ['--shape-blob', '아바타 · 아이콘 원', 'var(--stroke-thin)']
              ].map(([token, name, stroke]) => (
                <Stack gap={1} key={token}>
                  <div
                    style={{
                      height: 48,
                      width: token === '--shape-blob' ? 48 : 'auto',
                      background: 'var(--surface)',
                      border: stroke,
                      borderRadius: `var(${token})`
                    }}
                  />
                  <span className="ui-text-xs ui-text-muted">{name}</span>
                  <span className="ui-text-xs ui-text-subtle">{token}</span>
                </Stack>
              ))}
            </Grid>
            <Divider variant="zig" spacing="lg" />
            <span className="ui-text-xs ui-text-subtle">지그재그 구분선 — &lt;Divider variant="zig" /&gt;</span>
          </Card>

          <Card>
            <CardHeader title="아이콘" description="이모지 대신 선 아이콘을 쓴다. 크기와 색이 글자를 따라간다." />
            <Row gap={4} wrap>
              {iconNames.map((name) => (
                <Stack gap={1} key={name} style={{ alignItems: 'center', width: 68 }}>
                  <IconTile icon={name} />
                  <span className="ui-text-xs ui-text-subtle ui-truncate" style={{ maxWidth: 68 }}>{name}</span>
                </Stack>
              ))}
            </Row>
          </Card>

          <Card>
            <CardHeader title="레이아웃" description="Container · Stack · Row · Grid 로 짠다. 여백은 space 토큰만 쓴다." />
            <Grid cols={3}>
              <Card padding="sm"><span className="ui-text-sm">Grid cols=3</span></Card>
              <Card padding="sm"><span className="ui-text-sm">태블릿 2열</span></Card>
              <Card padding="sm"><span className="ui-text-sm">모바일 1열</span></Card>
            </Grid>
          </Card>
        </Stack>
      )}

      {tab === 'actions' && (
        <Stack gap={6}>
          <Card>
            <CardHeader title="버튼" description="높이 40px, 라운드 10px. 모바일에서는 44px 로 커진다." />
            <Stack gap={4}>
              <Row gap={2} wrap>
                <Button variant="primary">기본</Button>
                <Button variant="brand">브랜드</Button>
                <Button variant="secondary">보조</Button>
                <Button variant="outline">외곽선</Button>
                <Button variant="ghost">고스트</Button>
                <Button variant="danger">삭제</Button>
                <Button variant="danger-quiet">취소</Button>
              </Row>
              <Row gap={2} wrap align="baseline">
                <Button size="sm">작게</Button>
                <Button size="md">보통</Button>
                <Button size="lg">크게</Button>
                <Button icon="plus" variant="primary">아이콘</Button>
                <Button loading>저장 중</Button>
                <Button disabled>비활성</Button>
              </Row>
              <Row gap={2} wrap>
                <IconButton icon="search" label="검색" />
                <IconButton icon="filter" label="필터" />
                <IconButton icon="bell" label="알림" badge="3" />
                <IconButton icon="more" label="더보기" variant="plain" />
              </Row>
            </Stack>
          </Card>

          <Card>
            <CardHeader title="메뉴 · 팝오버" description="바깥 클릭과 Esc 로 닫힌다. 좁은 화면에서는 아래 시트로 붙는다." />
            <Row gap={2} wrap>
              <Menu trigger={(props) => <Button iconEnd="chevronDown" {...props}>관리</Button>}>
                <MenuItem icon="edit">수정</MenuItem>
                <MenuItem icon="download">내보내기</MenuItem>
                <MenuSeparator />
                <MenuItem icon="trash" tone="danger">삭제</MenuItem>
              </Menu>

              <Popover
                title="수업 종류"
                trigger={(props) => <Chip dropdown {...props}>수업 종류</Chip>}
                footer={({ close }) => (
                  <>
                    <Button onClick={close}>초기화</Button>
                    <Button variant="primary" onClick={close}>적용</Button>
                  </>
                )}
              >
                <Stack gap={1}>
                  <Checkbox label="유아부" defaultChecked />
                  <Checkbox label="초등부" />
                  <Checkbox label="선수반" />
                </Stack>
              </Popover>

              <Button onClick={() => setModalOpen(true)}>모달 열기</Button>
            </Row>
          </Card>

          <Card>
            <CardHeader title="필터 줄" description="모바일에서는 가로로 스크롤된다." />
            <Toolbar>
              <Chip selected>전체</Chip>
              <Chip count={12}>대회</Chip>
              <Chip count={3}>스페셜</Chip>
              <Chip dropdown>기간</Chip>
              <Tag onRemove={() => {}}>2026년 8월</Tag>
            </Toolbar>
            <Divider spacing="md" />
            <Row gap={3} wrap>
              <Segmented
                value={view}
                onChange={setView}
                items={[{ id: 'list', label: '목록' }, { id: 'grid', label: '갤러리' }]}
              />
              <Breadcrumb items={[{ label: '수업', href: '#' }, { label: '화·목 초등부' }]} />
            </Row>
          </Card>
        </Stack>
      )}

      {tab === 'data' && (
        <Stack gap={6}>
          <Grid cols={4}>
            <Stat label="지금 수업 중" value="2반" variant="star" hint="화·목 초등부 · 토 선수반" />
            <Stat label="미확정 신청" value="7건" variant="alert" hint="가장 오래된 신청 9/28" />
            <Stat label="이번 주 출석" value="132회" icon="checkCircle" tone="success" hint="지난주보다 8회 많아요" />
            <Stat label="9월 출석 합계" value="512회" variant="ink" hint="8월 488회" />
          </Grid>

          <Card padding="none">
            <DataTable columns={tableColumns} rows={tableRows} caption="전체 3명" />
          </Card>

          <Card>
            <CardHeader title="목록" description="표까지 필요 없을 때 쓴다." />
            <List>
              <ListRow leading={<Avatar name="김하늘" />} title="김하늘" subtitle="화·목 초등부" trailing={<Badge tone="success" dot>수강 중</Badge>} chevron onClick={() => {}} />
              <ListRow leading={<Avatar name="이서연" />} title="이서연" subtitle="월·수 유아부" trailing={<Badge tone="warning">대기</Badge>} chevron onClick={() => {}} />
            </List>
          </Card>

          <Grid cols={2}>
            <Card>
              <CardHeader title="상세 정보" />
              <DescriptionList
                items={[
                  { label: '생년월일', value: '2016-04-11' },
                  { label: '수업', value: '화·목 초등부' },
                  { label: '학부모', value: '김지연' },
                  { label: '등록일', value: '2025-03-02' }
                ]}
              />
            </Card>
            <Card>
              <CardHeader title="배지 · 아바타" />
              <Stack gap={4}>
                <Row gap={2} wrap>
                  <Badge>기본</Badge>
                  <Badge tone="brand">브랜드</Badge>
                  <Badge tone="success" dot>수강 중</Badge>
                  <Badge tone="warning" dot>대기</Badge>
                  <Badge tone="danger">마감</Badge>
                  <Badge tone="solid">확정</Badge>
                  <Badge tone="muted">휴원</Badge>
                </Row>
                <Row gap={3}>
                  <Avatar name="김하늘" size="sm" />
                  <Avatar name="이서연" />
                  <Avatar name="박지우" size="lg" />
                  <AvatarGroup people={[{ name: '김하늘' }, { name: '이서연' }, { name: '박지우' }, { name: '최유진' }, { name: '한지민' }]} max={3} />
                </Row>
              </Stack>
            </Card>
          </Grid>

          <Pagination page={page} pageCount={8} onChange={setPage} info="전체 152건" />
        </Stack>
      )}

      {tab === 'forms' && (
        <Grid cols={2}>
          <Card>
            <CardHeader title="입력" description="라벨·힌트·오류를 Field 가 묶는다." />
            <Stack gap={4}>
              <Field label="학생 이름" required hint="공백 없이 입력해 주세요">
                {(props) => <Input placeholder="김하늘" {...props} />}
              </Field>
              <Field label="생년월일" error="날짜 형식이 올바르지 않아요">
                {(props) => <Input defaultValue="2016/4/11" invalid {...props} />}
              </Field>
              <Field label="수업">
                {(props) => (
                  <Select {...props}>
                    <option>화·목 초등부</option>
                    <option>월·수 유아부</option>
                  </Select>
                )}
              </Field>
              <Field label="수업 시간">
                {(props) => (
                  <InputGroup addon="분">
                    <Input type="number" defaultValue={50} {...props} />
                  </InputGroup>
                )}
              </Field>
              <Field label="메모" counter={{ value: memo.length, max: 100 }}>
                {(props) => (
                  <Textarea
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="특이사항을 적어 주세요"
                    {...props}
                  />
                )}
              </Field>
              <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} placeholder="학생 검색" shortcut="⌘K" />
            </Stack>
          </Card>

          <Card>
            <CardHeader title="선택" />
            <Stack gap={4}>
              <Stack gap={2}>
                <Checkbox label="지난 일정도 보기" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
                <Radio name="demo" label="전체 공개" defaultChecked />
                <Radio name="demo" label="비공개" />
              </Stack>
              <SwitchField
                label="카카오 알림 받기"
                checked={switched}
                onChange={(e) => setSwitched(e.target.checked)}
                description={
                  switched
                    ? '새 신청이 들어오면 카카오톡으로 알려 드려요.'
                    : '알림을 보내지 않아요. 앱에서만 확인할 수 있어요.'
                }
              />
              <Divider label="또는" />
              <Stack gap={2}>
                <Choice selected={picked === 'a'} onClick={() => setPicked('a')}>
                  <span className="ui-choice__mark" data-on={picked === 'a' || undefined}>
                    {picked === 'a' && <Icon name="check" size={14} strokeWidth={3} />}
                  </span>
                  맨손
                </Choice>
                <Choice selected={picked === 'b'} onClick={() => setPicked('b')}>
                  <span className="ui-choice__mark" data-on={picked === 'b' || undefined}>
                    {picked === 'b' && <Icon name="check" size={14} strokeWidth={3} />}
                  </span>
                  후프
                </Choice>
              </Stack>
              <ButtonGroup stackMobile>
                <Button>취소</Button>
                <Button variant="primary">저장</Button>
              </ButtonGroup>
            </Stack>
          </Card>
        </Grid>
      )}

      {tab === 'feedback' && (
        <Stack gap={6}>
          <Stack gap={3}>
            <Callout tone="brand">접수는 이벤트 시작 하루 전까지 받아요.</Callout>
            <Callout tone="success">신청이 저장됐어요.</Callout>
            <Callout tone="warning" onDismiss={() => {}}>정원이 두 자리 남았어요.</Callout>
            <Callout tone="danger">이미 마감된 이벤트예요.</Callout>
          </Stack>

          <Grid cols={2}>
            <PromoCard
              title="카카오 알림을 켜 보세요"
              action={<Button variant="primary" size="sm">알림 설정</Button>}
              onDismiss={() => {}}
            >
              새 신청이 들어오면 카카오톡으로 바로 알려 드려요.
            </PromoCard>
            <Card>
              <CardHeader title="진행률" />
              <Stack gap={3}>
                <Stack gap={1}>
                  <Row justify="between" className="ui-text-sm"><span>확정</span><span>18 / 24</span></Row>
                  <Progress value={18} max={24} label="확정 인원" />
                </Stack>
                <Stack gap={1}>
                  <Row justify="between" className="ui-text-sm">
                    <Row gap={1}><span>정원</span><InfoHint content="정원을 넘으면 대기로 접수돼요." /></Row>
                    <span>24 / 24</span>
                  </Row>
                  <Progress value={24} max={24} tone="warning" label="정원" />
                </Stack>
              </Stack>
            </Card>
          </Grid>

          <Grid cols={2}>
            <Card padding="none">
              <EmptyState
                icon="calendar"
                title="다가오는 일정이 없습니다"
                description="이벤트를 등록하면 학부모 일정에 바로 보여요."
                action={<Button variant="primary" icon="plus" size="sm">이벤트</Button>}
              />
            </Card>
            <Card>
              <CardHeader title="로딩" />
              <Stack gap={3}>
                <Skeleton width="60%" />
                <Skeleton width="100%" />
                <Skeleton width="80%" />
                <Skeleton width="100%" height={80} radius="var(--radius-lg)" />
              </Stack>
            </Card>
          </Grid>

          <Card>
            <CardHeader title="툴팁" />
            <Row gap={4}>
              <Tooltip content="출석은 수업 당일에만 체크할 수 있어요.">
                <Button>도움말 보기</Button>
              </Tooltip>
              <Row gap={1}>출석률 <InfoHint content="최근 8주 기준으로 계산해요." /></Row>
            </Row>
            <CardFooter>
              <Button>취소</Button>
              <Button variant="primary">확인</Button>
            </CardFooter>
          </Card>
        </Stack>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="이벤트 신청"
        description="모바일에서는 아래에서 올라오는 시트로 열려요."
        footer={
          <>
            <Button onClick={() => setModalOpen(false)}>취소</Button>
            <Button variant="primary" onClick={() => setModalOpen(false)}>신청하기</Button>
          </>
        }
      >
        <Stack gap={4}>
          <Callout tone="brand">접수 마감은 8월 30일 오후 6시예요.</Callout>
          <Field label="참가 학생">
            {(props) => (
              <Select {...props}>
                <option>김하늘</option>
                <option>이서연</option>
              </Select>
            )}
          </Field>
          <Section title="종목" description="여러 개 고를 수 있어요">
            <Stack gap={2}>
              <Choice><span className="ui-choice__mark" />맨손</Choice>
              <Choice selected><span className="ui-choice__mark" data-on><Icon name="check" size={14} strokeWidth={3} /></span>후프</Choice>
            </Stack>
          </Section>
        </Stack>
      </Modal>
    </div>
  );
}

export default DesignSystem;
