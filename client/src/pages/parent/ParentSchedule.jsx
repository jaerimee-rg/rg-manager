import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import ParentLayout from '../../components/parent/ParentLayout';
import { Spinner } from '../../components/ui';
import { typeOf } from '../../utils/eventFormat';
import {
  filterRemainingThisYear, filterPast, groupByMonth, dDay, formatCardDate, dayLabel, childBadge,
  SCHEDULE_PATH, PAST_SCHEDULE_PATH
} from '../../utils/parentSchedule';

const TONE_CLASS = {
  success: 'badge-success',
  primary: 'badge-primary',
  warning: 'badge-warning',
  gray: 'badge-gray'
};

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'competition', label: '🏆 대회' },
  { key: 'special', label: '⭐ 스페셜' },
  { key: 'closure', label: '🚫 휴관일' }
];

/**
 * 학부모 일정 — 달력 없이 올해 남은 일정만 카드로 보여준다.
 * 한 번의 조회로 이벤트와 자녀별 신청 상태를 함께 받는다.
 * 카드를 누르면 전체 화면 상세(`/parent/events/:eventId`, ParentEventDetail)로 간다 —
 * 선생님이 공유한 링크가 여는 화면과 같은 곳이다.
 *
 * 제목 줄의 "지난 일정 보기" 링크는 끝난 일정을 최근 것부터 보여주는 보기(`?view=past`)로 바꾼다.
 * 보기를 주소에 담아 두어서 상세에 갔다 와도, 브라우저 뒤로 가기를 눌러도 보던 목록이 그대로다.
 */
function ParentSchedule() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view') === 'past' ? 'past' : 'upcoming';
  const past = view === 'past';

  const [data, setData] = useState(null);
  const [currentChild, setCurrentChild] = useState(null);
  const [filter, setFilter] = useState('all');
  // 선생님이 여럿일 때만 쓰는 필터 (docs/accounts-roles FR-357)
  const [teacherFilter, setTeacherFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // isStale: 보기·선생님을 연달아 바꿨을 때 늦게 도착한 이전 응답이 화면을 덮지 않게 한다
  const load = async (teacherId, which, isStale) => {
    try {
      // 연결된 선생님이 여럿이면 서버가 전부 모아 주고, 칩을 고르면 그 선생님 것만 받는다
      const params = new URLSearchParams();
      if (teacherId && teacherId !== 'all') params.set('teacherId', teacherId);
      if (which === 'past') params.set('view', 'past');
      const query = params.toString() ? `?${params}` : '';
      const response = await fetchWithAuth(`/api/parent/events${query}`);
      if (!response.ok || isStale()) return;

      const payload = await response.json();
      if (isStale()) return;
      setData({ ...payload, view: which });
      setCurrentChild((prev) => prev ?? payload.children[0]?.id ?? null);
    } catch (error) {
      console.error('일정 조회 실패:', error);
    } finally {
      if (!isStale()) {
        // 실패했는데 다른 보기의 데이터가 남아 있으면 비운다 — 끝나지 않는 로딩보다 빈 목록이 낫다
        setData((prev) => (prev && prev.view !== which ? null : prev));
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let stale = false;
    load(teacherFilter, view, () => stale);
    return () => { stale = true; };
  }, [teacherFilter, view]);

  // 링크처럼 생긴 글자 버튼 — 채운 버튼이면 신청 같은 주요 동작처럼 보인다
  const viewToggle = (
    <button type="button" className="ui-link" onClick={() => navigate(past ? SCHEDULE_PATH : PAST_SCHEDULE_PATH)}>
      {past ? '남은 일정 보기' : '지난 일정 보기'}
    </button>
  );

  // 보기를 막 바꾼 참이면 남아 있는 건 이전 보기의 목록이다 — 새 목록이 올 때까지 기다린다
  if (loading || (data && data.view !== view)) {
    return (
      <ParentLayout title="일정" action={viewToggle}>
        <Spinner />
      </ParentLayout>
    );
  }

  const today = data?.today || '';
  const children = data?.children || [];
  const teachers = data?.teachers || [];
  // 선생님이 한 명이면 칩도 배지도 군더더기라 숨긴다
  const manyTeachers = teachers.length > 1;
  const visible = (past ? filterPast : filterRemainingThisYear)(data?.events || [], today)
    .filter((e) => filter === 'all' || e.type === filter);
  const groups = groupByMonth(visible);
  const year = today.slice(0, 4);

  // 지난 일정에서 연 상세는 뒤로 가기가 지난 일정으로 돌아오게 한다 (ParentEventDetail)
  const openEvent = (id) =>
    past ? navigate(`/parent/events/${id}`, { state: { back: PAST_SCHEDULE_PATH } }) : navigate(`/parent/events/${id}`);

  return (
    <ParentLayout title="일정" subtitle={past ? '지난 일정' : `${year}년 남은 일정`} action={viewToggle}>
      {manyTeachers && (
        <div className="teacher-filter" role="group" aria-label="선생님 필터">
          <button
            type="button"
            className={`teacher-filter-chip ${teacherFilter === 'all' ? 'active' : ''}`}
            aria-pressed={teacherFilter === 'all'}
            onClick={() => setTeacherFilter('all')}
          >
            전체
          </button>
          {teachers.map((teacher) => (
            <button
              key={teacher.id}
              type="button"
              className={`teacher-filter-chip ${String(teacherFilter) === String(teacher.id) ? 'active' : ''}`}
              aria-pressed={String(teacherFilter) === String(teacher.id)}
              onClick={() => setTeacherFilter(teacher.id)}
            >
              {teacher.name} 선생님
            </button>
          ))}
        </div>
      )}

      {children.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setCurrentChild(child.id)}
              aria-pressed={child.id === currentChild}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 12px',
                borderRadius: 'var(--shape-btn)', minHeight: '40px',
                border: 'var(--stroke-thin)',
                background: child.id === currentChild ? 'var(--ink)' : 'var(--field)',
                color: child.id === currentChild ? 'var(--paper)' : 'var(--ink-900)',
                fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
              }}
            >
              {child.childName}
              {child.status !== 'linked' && (
                <span style={{
                  fontSize: '0.625rem', fontWeight: 700, padding: '1px 6px',
                  borderRadius: 'var(--shape-tag)', background: 'var(--color-warning-bg)', color: 'var(--color-warning)'
                }}>
                  확인 대기
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', overflowX: 'auto', paddingBottom: '2px' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            style={{
              padding: '6px 11px', borderRadius: 'var(--shape-btn)', whiteSpace: 'nowrap',
              border: 'var(--stroke-thin)',
              background: filter === f.key ? 'var(--ink)' : 'var(--field)',
              color: filter === f.key ? 'var(--paper)' : 'var(--ink-900)',
              fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {children.length === 0 && (
        <div style={{
          background: 'var(--color-warning-bg)', color: 'var(--color-warning)', padding: '11px 12px',
          borderRadius: 'var(--shape-box)', fontSize: '0.8125rem', marginBottom: '12px', lineHeight: 1.55
        }}>
          아직 등록한 아이가 없어요. 내 정보에서 아이를 추가하면 신청할 수 있어요.
        </div>
      )}

      {visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 20px' }}>
          <div style={{ fontSize: '2.5rem' }}>🗓️</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '8px' }}>
            {filter !== 'all' ? '해당하는 일정이 없어요' : past ? '지난 일정이 없어요' : `${year}년 남은 일정이 없어요`}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray-500)', lineHeight: 1.6, marginTop: '6px' }}>
            {past ? '끝난 일정이 여기에 모여요.' : '선생님이 새 일정을 올리면 여기에 보여요.'}
          </div>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.key}>
            <div style={{
              position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-primary)',
              padding: '10px 2px 8px', fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-gray-800)'
            }}>
              {group.label} <span style={{ fontSize: '0.6875rem', color: 'var(--color-gray-400)', fontWeight: 600 }}>{group.year}</span>
            </div>

            {group.events.map((event) => {
              const meta = typeOf(event.type);
              const { day, dow, weekend } = dayLabel(event.date);
              const dd = dDay(event, today);
              const childState = event.children.find((c) => c.childId === currentChild);
              const badge = event.type === 'closure' ? null : childBadge(childState, { past });
              const dowColor = weekend === 'sun' ? 'var(--color-danger)' : weekend === 'sat' ? 'var(--color-primary)' : 'inherit';

              return (
                <button
                  key={event.id}
                  onClick={() => openEvent(event.id)}
                  style={{
                    width: '100%', textAlign: 'left', background: 'var(--surface)', border: 'var(--stroke)',
                    borderRadius: 'var(--shape-panel)', padding: '14px', marginBottom: '10px',
                    display: 'flex', gap: '12px', cursor: 'pointer', fontFamily: 'inherit'
                  }}
                >
                  <div style={{
                    width: '46px', flexShrink: 0, textAlign: 'center', borderRadius: 'var(--shape-box)',
                    padding: '8px 0', background: 'var(--bg-tertiary)'
                  }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.1, color: dowColor }}>{day}</div>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: dowColor === 'inherit' ? 'var(--color-gray-500)' : dowColor }}>{dow}</div>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span className={`badge ${meta.className}`}>{meta.emoji} {meta.short}</span>
                      {/* 선생님이 둘 이상일 때만 — 어느 학원 일정인지 구분해야 한다 */}
                      {manyTeachers && event.teacherName && (
                        <span className="badge badge-gray">{event.teacherName}</span>
                      )}
                      <span style={{
                        marginLeft: 'auto', fontSize: '0.6875rem', fontWeight: 800,
                        color: dd.urgent ? 'var(--color-danger)' : 'var(--color-gray-500)'
                      }}>
                        {dd.text}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.9375rem', fontWeight: 700, lineHeight: 1.35, marginBottom: '5px', wordBreak: 'keep-all' }}>
                      {event.title}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                      <span>📅 {formatCardDate(event)}</span>
                      {event.location && <span>📍 {event.location}</span>}
                    </div>
                    {event.type !== 'closure' && (
                      <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {badge && (
                          <span className={`badge ${TONE_CLASS[badge.tone]}`}>
                            {badge.tone === 'success' ? '✓ ' : ''}{badge.label}
                            {badge.tone === 'success' && childState ? ` · ${childState.childName}` : ''}
                          </span>
                        )}
                        {/* 몇 명이 신청했는지 — 취소는 뺀 수. 상세를 열지 않아도 분위기를 알 수 있다 */}
                        <span className="badge badge-gray">👥 신청 {event.registrationCount || 0}명</span>
                        {event.optionCount > 0 && <span className="badge badge-gray">옵션 {event.optionCount}</span>}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))
      )}

    </ParentLayout>
  );
}

export default ParentSchedule;
