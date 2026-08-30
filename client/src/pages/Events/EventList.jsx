import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { typeOf, formatRange, formatWhen, isPast, isAcceptingRegistration, todayString } from '../../utils/eventFormat';
import EventRegistrations from './EventRegistrations';
import {
  Badge, Button, Card, Checkbox, DataTable, EmptyState,
  PageHeader, Row, SkeletonList, Toolbar, Chip
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

  const actions = (event) => (
    <Row gap={2} justify="end" wrap>
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

  const registrationLink = (event) =>
    event.type === 'closure' ? (
      <span className="ui-text-subtle">—</span>
    ) : (
      <button
        type="button"
        className="ui-link"
        onClick={() => setOpenRegistrations(openRegistrations === event.id ? null : event.id)}
      >
        {event.registrationCount || 0}건
      </button>
    );

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
      render: (event) => event.location || <span className="ui-text-subtle">—</span>
    },
    {
      key: 'participants',
      header: '참가 학생',
      width: '96px',
      numeric: true,
      render: (event) =>
        event.type === 'competition' ? `${event.participantCount || 0}명` : <span className="ui-text-subtle">—</span>
    },
    { key: 'registrations', header: '신청', width: '80px', numeric: true, render: registrationLink },
    { key: 'status', header: '공개 · 접수', width: '140px', render: (event) => <StatusBadges event={event} /> },
    { key: 'actions', header: '관리', width: '1%', hideLabelOnMobile: true, render: actions }
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
        description="[+ 이벤트] 로 첫 일정을 올려보세요."
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

      <div className="ui-events-layout" data-split={openRegistrations && !isMobile ? 'true' : undefined}>
        <div>
          {loading ? (
            <SkeletonList rows={4} />
          ) : (
            <DataTable
              columns={columns}
              rows={events}
              caption={`전체 ${events.length}건`}
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
    </>
  );
}

export default EventList;
