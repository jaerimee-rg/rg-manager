import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { typeOf, formatRange, formatWhen, isPast, isAcceptingRegistration, todayString } from '../../utils/eventFormat';
import EventRegistrations from './EventRegistrations';

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'competition', label: '🏆 대회' },
  { key: 'special', label: '⭐ 스페셜' },
  { key: 'closure', label: '🚫 휴관일' }
];

function StatusBadges({ event }) {
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      <span className={`badge ${event.isPublished === false ? 'badge-gray' : 'badge-success'}`}>
        {event.isPublished === false ? '비공개' : '공개'}
      </span>
      {event.type !== 'closure' && (
        <span className={`badge ${isAcceptingRegistration(event) ? 'badge-primary' : 'badge-gray'}`}>
          {isAcceptingRegistration(event) ? '접수 중' : '마감'}
        </span>
      )}
    </div>
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
    <>
      <button className="btn btn-outline btn-sm" onClick={() => navigate(`${basePath}/edit`, { state: { event } })}>
        수정
      </button>
      {event.type === 'competition' && (
        <button
          className="btn btn-outline btn-sm"
          onClick={() => navigate('/competitions/manage', {
            state: { competition: { id: event.competitionId, name: event.title, date: event.date, location: event.location } }
          })}
        >
          참가 학생
        </button>
      )}
      <button className="btn btn-sm" onClick={() => remove(event)}
        style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
        삭제
      </button>
    </>
  );

  const registrationLink = (event) =>
    event.type === 'closure' ? (
      <span style={{ color: 'var(--color-gray-400)' }}>—</span>
    ) : (
      <button
        type="button"
        onClick={() => setOpenRegistrations(openRegistrations === event.id ? null : event.id)}
        style={{
          border: 'none', background: 'none', color: 'var(--color-primary)', fontWeight: 700,
          cursor: 'pointer', textDecoration: 'underline', fontSize: '0.9rem', whiteSpace: 'nowrap', padding: 0
        }}
      >
        {event.registrationCount || 0}건
      </button>
    );

  return (
    <div className="container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <h2>이벤트 관리</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-gray-500)', marginTop: '4px' }}>
            대회·스페셜 이벤트·휴관일을 등록하면 학부모 일정에 바로 보이고, 신청 현황을 확인할 수 있습니다.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate(`${basePath}/new`)}>+ 이벤트</button>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              style={{
                padding: '7px 12px', borderRadius: 'var(--radius-full)',
                border: `1px solid ${filter === f.key ? 'var(--color-primary)' : 'var(--color-gray-200)'}`,
                background: filter === f.key ? 'var(--color-primary)' : '#fff',
                color: filter === f.key ? '#fff' : 'var(--color-gray-700)',
                fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={includePast} onChange={(e) => setIncludePast(e.target.checked)} />
          지난 일정 보기
          {pastEvents.length > 0 && (
            <span style={{ color: 'var(--color-gray-500)' }}>({pastEvents.length})</span>
          )}
        </label>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: openRegistrations && !isMobile ? 'minmax(0, 1fr) 380px' : '1fr',
        gap: '16px', alignItems: 'start'
      }}>
        <div>
          {loading ? (
            <div className="card" style={{ padding: '30px', textAlign: 'center', color: 'var(--color-gray-500)' }}>
              불러오는 중...
            </div>
          ) : events.length === 0 ? (
            <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-gray-500)' }}>
              {pastEvents.length > 0 ? (
                <>
                  <div style={{ fontWeight: 700, color: 'var(--color-gray-700)' }}>다가오는 일정이 없습니다</div>
                  <div style={{ fontSize: '0.875rem', marginTop: '6px' }}>
                    지난 일정 {pastEvents.length}건은 그대로 있어요. 기존 대회도 여기에 들어 있습니다.
                  </div>
                  <button className="btn btn-outline btn-sm" style={{ marginTop: '12px' }} onClick={() => setIncludePast(true)}>
                    지난 일정 {pastEvents.length}건 보기
                  </button>
                </>
              ) : (
                '등록된 이벤트가 없습니다. [+ 이벤트] 로 첫 일정을 올려보세요.'
              )}
            </div>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {events.map((event) => {
                const meta = typeOf(event.type);
                return (
                  <div key={event.id} className="card" style={{ padding: '14px', opacity: isPast(event) ? 0.55 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span className={`badge ${meta.className}`}>{meta.emoji} {meta.short}</span>
                      <StatusBadges event={event} />
                      <span style={{ flex: 1 }} />
                      {event.type !== 'closure' && registrationLink(event)}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{event.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '3px' }}>
                      📅 {formatWhen(event)}
                    </div>
                    {event.location && (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray-800)', fontWeight: 600, marginTop: '3px' }}>
                        📍 {event.location}
                      </div>
                    )}
                    {event.type === 'competition' && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '3px' }}>
                        👥 참가 학생 {event.participantCount || 0}명
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>{actions(event)}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ width: '84px' }}>종류</th>
                    <th style={{ minWidth: '180px' }}>이벤트</th>
                    <th style={{ width: '150px' }}>날짜</th>
                    <th style={{ minWidth: '150px' }}>장소</th>
                    <th style={{ width: '90px', textAlign: 'center', whiteSpace: 'nowrap' }}>참가 학생</th>
                    <th style={{ width: '70px', textAlign: 'center', whiteSpace: 'nowrap' }}>신청</th>
                    <th style={{ width: '100px', whiteSpace: 'nowrap' }}>공개 · 접수</th>
                    <th style={{ width: '1%' }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => {
                    const meta = typeOf(event.type);
                    return (
                      <tr key={event.id} style={{ opacity: isPast(event) ? 0.55 : 1 }}>
                        <td><span className={`badge ${meta.className}`}>{meta.emoji} {meta.short}</span></td>
                        <td>
                          <div style={{ fontWeight: 700, wordBreak: 'keep-all' }}>{event.title}</div>
                          {event.options?.length > 0 && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                              옵션 {event.options.length}개
                            </div>
                          )}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {formatRange(event.date, event.endDate)}{event.startTime ? ` ${event.startTime}` : ''}
                        </td>
                        <td style={{ wordBreak: 'keep-all' }}>
                          {event.location || <span style={{ color: 'var(--color-gray-400)' }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {event.type === 'competition'
                            ? `${event.participantCount || 0}명`
                            : <span style={{ color: 'var(--color-gray-400)' }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'center' }}>{registrationLink(event)}</td>
                        <td><StatusBadges event={event} /></td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                            {actions(event)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
    </div>
  );
}

export default EventList;
