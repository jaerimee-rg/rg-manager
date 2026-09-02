import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { typeOf, formatRange, formatWhen, isPast, isAcceptingRegistration, todayString } from '../../utils/eventFormat';
import { copyToClipboard } from '../../utils/copyToClipboard';
import { eventShareUrl, canShareEvent, SHARE_DISABLED_HINT } from '../../utils/eventShare';
import EventRegistrations from './EventRegistrations';
import {
  Badge, Button, Card, Checkbox, DataTable, EmptyState,
  PageHeader, Row, SkeletonList, Toolbar, Chip, Toast
} from '../../components/ui';

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'competition', label: '대회' },
  { key: 'special', label: '스페셜' },
  { key: 'closure', label: '휴관일' }
];

function StatusBadges({ event }) {
  return (
    <Row gap={1} wrap>
      <Badge tone={event.isPublished === false ? 'neutral' : 'success'} dot>
        {event.isPublished === false ? '비공개' : '공개'}
      </Badge>
      {event.type !== 'closure' && (
        <Badge tone={isAcceptingRegistration(event) ? 'brand' : 'neutral'}>
          {isAcceptingRegistration(event) ? '접수 중' : '마감'}
        </Badge>
      )}
    </Row>
  );
}

function EventList({ basePath = '/events' }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [allEvents, setAllEvents] = useState([]);
  const [filter, setFilter] = useState('all');
  const [includePast, setIncludePast] = useState(false);
  const [openRegistrations, setOpenRegistrations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const showToast = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  };

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const toggleRegistrations = (eventId) =>
    setOpenRegistrations((current) => (current === eventId ? null : eventId));

  // 이벤트(행)를 누르면 누가 신청했는지 바로 본다. 휴관일은 신청이 없으니 열지 않는다.
  const openFromRow = (event) => {
    if (event.type === 'closure') return;
    toggleRegistrations(event.id);
  };

  /**
   * 학부모에게 보낼 공유 링크 — 학부모 앱의 이벤트 주소 그대로다.
   * 눌러서 열면 로그인돼 있으면 바로, 아니면 로그인을 거쳐 그 이벤트 신청 화면이 뜬다.
   */
  const share = async (event) => {
    const url = eventShareUrl(event.id);
    const ok = await copyToClipboard(url);
    showToast(ok ? '공유 링크를 복사했어요 · 학부모에게 보내면 로그인 뒤 바로 신청 화면이 열려요' : url);
  };

  const load = async () => {
    try {
      const params = new URLSearchParams({ includePast: 'true' });
      if (filter !== 'all') params.set('type', filter);

      // 지난 일정까지 한 번에 받아 두면 토글이 즉시 반응하고,
      // "지난 일정이 몇 건인지" 를 화면에서 알려줄 수 있다.
      const response = await fetchWithAuth(`/api/events?${params}`);
      if (response.ok) setAllEvents(await response.json());
    } catch (error) {
      console.error('이벤트 목록 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

  const today = todayString();
  const pastEvents = allEvents.filter((e) => isPast(e, today));
  const upcomingEvents = allEvents.filter((e) => !isPast(e, today));
  const events = includePast ? allEvents : upcomingEvents;

  const remove = async (event) => {
    const extra = event.type === 'competition'
      ? '\n연결된 대회의 참가 학생·신청 정보도 함께 삭제됩니다.'
      : '';
    if (!confirm(`"${event.title}" 이벤트를 삭제할까요?${extra}`)) return;

    const response = await fetchWithAuth(`/api/events/${event.id}`, { method: 'DELETE' });
    if (response.ok) {
      if (openRegistrations === event.id) setOpenRegistrations(null);
      load();
    } else {
      alert('삭제에 실패했습니다.');
    }
  };

  // 행 자체가 신청 현황을 여는 버튼이라, 칸 안의 버튼들은 클릭을 행까지 올려보내지 않는다.
  const stop = (e) => e.stopPropagation();

  const actions = (event) => (
    <Row gap={2} justify="end" wrap onClick={stop}>
      <Button
        size="sm"
        icon="link"
        disabled={!canShareEvent(event)}
        title={canShareEvent(event) ? '학부모에게 보낼 링크 복사' : SHARE_DISABLED_HINT}
        onClick={() => share(event)}
      >
        공유
      </Button>
      <Button size="sm" onClick={() => navigate(`${basePath}/edit`, { state: { event } })}>수정</Button>
      {event.type === 'competition' && (
        <Button
          size="sm"
          onClick={() => navigate('/competitions/manage', {
            state: { competition: { id: event.competitionId, name: event.title, date: event.date, location: event.location } }
          })}
        >
          참가 학생
        </Button>
      )}
      <Button size="sm" variant="danger-quiet" onClick={() => remove(event)}>삭제</Button>
    </Row>
  );

  const registrationLink = (event) => (
    <button
      type="button"
      className="ui-link"
      onClick={(e) => {
        stop(e);
        toggleRegistrations(event.id);
      }}
    >
      {event.registrationCount || 0}건
    </button>
  );

  // 휴관일은 장소·참가 학생·신청·접수가 아예 없는 일정이라 그 칸을 "—" 로 채우지 않는다.
  // 모바일 카드에서는 줄째로 사라지고, 데스크탑 표에서는 열을 맞추려고 빈 칸으로 남는다.
  const notForClosure = (event) => event.type === 'closure';

  // 컬럼 정의 하나로 데스크탑 표와 모바일 카드가 동시에 나온다.
  // (예전에는 같은 목록을 표용·카드용으로 두 벌 만들어 두고 있었다)
  const columns = [
    {
      key: 'type',
      header: '종류',
      width: '84px',
      render: (event) => {
        const meta = typeOf(event.type);
        return <Badge tone={meta.tone}>{meta.short}</Badge>;
      }
    },
    {
      key: 'title',
      header: '이벤트',
      render: (event) => (
        <>
          <div className="ui-list-row__title" style={{ whiteSpace: 'normal', wordBreak: 'keep-all' }}>{event.title}</div>
          {event.options?.length > 0 && (
            <div className="ui-list-row__subtitle">옵션 {event.options.length}개</div>
          )}
        </>
      )
    },
    {
      key: 'date',
      header: '날짜',
      width: '160px',
      render: (event) => (isMobile ? formatWhen(event) : `${formatRange(event.date, event.endDate)}${event.startTime ? ` ${event.startTime}` : ''}`)
    },
    {
      key: 'location',
      header: '장소',
      hidden: notForClosure,
      render: (event) => event.location || <span className="ui-text-subtle">—</span>
    },
    {
      key: 'participants',
      header: '참가 학생',
      width: '96px',
      numeric: true,
      hidden: notForClosure,
      render: (event) =>
        event.type === 'competition' ? `${event.participantCount || 0}명` : <span className="ui-text-subtle">—</span>
    },
    { key: 'registrations', header: '신청', width: '80px', numeric: true, hidden: notForClosure, render: registrationLink },
    { key: 'status', header: '공개 · 접수', width: '140px', hidden: notForClosure, render: (event) => <StatusBadges event={event} /> },
    // 버튼이 한 줄에 둘씩 들어갈 폭 — 1% 로 두면 공유·수정·삭제가 한 줄에 하나씩 쌓여 행이 세 배로 높아진다
    { key: 'actions', header: '관리', width: '160px', hideLabelOnMobile: true, render: actions }
  ];

  const emptyState =
    pastEvents.length > 0 ? (
      <EmptyState
        icon="calendar"
        title="다가오는 일정이 없습니다"
        description={`지난 일정 ${pastEvents.length}건은 그대로 있어요. 기존 대회도 여기에 들어 있습니다.`}
        action={
          <Button size="sm" onClick={() => setIncludePast(true)}>
            지난 일정 {pastEvents.length}건 보기
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon="calendar"
        title="등록된 이벤트가 없습니다"
        description="위 [이벤트] 버튼으로 첫 일정을 올려보세요."
        action={<Button variant="primary" icon="plus" onClick={() => navigate(`${basePath}/new`)}>이벤트</Button>}
      />
    );

  return (
    <>
      <PageHeader
        title="이벤트 관리"
        description="대회·스페셜 이벤트·휴관일을 등록하면 학부모 일정에 바로 보이고, 신청 현황을 확인할 수 있습니다."
        actions={
          <Button variant="primary" icon="plus" onClick={() => navigate(`${basePath}/new`)}>
            이벤트
          </Button>
        }
      />

      <Toolbar>
        {FILTERS.map((f) => (
          <Chip key={f.key} selected={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
        <span style={{ flex: 1 }} />
        <Checkbox
          label={pastEvents.length > 0 ? `지난 일정 보기 (${pastEvents.length})` : '지난 일정 보기'}
          checked={includePast}
          onChange={(e) => setIncludePast(e.target.checked)}
        />
      </Toolbar>

      {/* 2열이 될지(넓은 화면) 신청 현황이 화면을 덮을지(좁은 화면)는 CSS 가 정한다 */}
      <div className="ui-events-layout" data-split={openRegistrations ? 'true' : undefined}>
        <div>
          {loading ? (
            <SkeletonList rows={4} />
          ) : (
            <DataTable
              columns={columns}
              rows={events}
              caption={`전체 ${events.length}건`}
              onRowClick={openFromRow}
              empty={<Card>{emptyState}</Card>}
            />
          )}
        </div>

        {openRegistrations && (
          <EventRegistrations
            eventId={openRegistrations}
            onClose={() => setOpenRegistrations(null)}
            onChanged={load}
          />
        )}
      </div>

      <Toast>{toast}</Toast>
    </>
  );
}

export default EventList;
