import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import ParentLayout from '../../components/parent/ParentLayout';
import { typeOf } from '../../utils/eventFormat';
import {
  filterRemainingThisYear, groupByMonth, dDay, formatCardDate, dayLabel, childBadge
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
 */
function ParentSchedule() {
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [currentChild, setCurrentChild] = useState(null);
  const [filter, setFilter] = useState('all');
  // 선생님이 여럿일 때만 쓰는 필터 (docs/accounts-roles FR-357)
  const [teacherFilter, setTeacherFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = async (teacherId = 'all') => {
    try {
      // 연결된 선생님이 여럿이면 서버가 전부 모아 주고, 칩을 고르면 그 선생님 것만 받는다
      const query = teacherId && teacherId !== 'all' ? `?teacherId=${teacherId}` : '';
      const response = await fetchWithAuth(`/api/parent/events${query}`);
      if (!response.ok) return;

      const payload = await response.json();
      setData(payload);
      setCurrentChild((prev) => prev ?? payload.children[0]?.id ?? null);
    } catch (error) {
      console.error('일정 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(teacherFilter);
  }, [teacherFilter]);

  if (loading) {
    return (
      <ParentLayout title="일정">
        <div style={{ textAlign: 'center', color: 'var(--color-gray-500)', padding: '40px 0' }}>불러오는 중...</div>
      </ParentLayout>
    );
  }

  const today = data?.today || '';
  const children = data?.children || [];
  const teachers = data?.teachers || [];
  // 선생님이 한 명이면 칩도 배지도 군더더기라 숨긴다
  const manyTeachers = teachers.length > 1;
  const visible = filterRemainingThisYear(data?.events || [], today)
    .filter((e) => filter === 'all' || e.type === filter);
  const groups = groupByMonth(visible);
  const year = today.slice(0, 4);

  return (
    <ParentLayout title="일정" subtitle={`${year}년 남은 일정`}>
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
                borderRadius: 'var(--radius-full)', minHeight: '40px',
                border: `1px solid ${child.id === currentChild ? 'var(--color-gray-900)' : 'var(--color-gray-200)'}`,
                background: child.id === currentChild ? 'var(--color-gray-900)' : '#fff',
                color: child.id === currentChild ? '#fff' : 'var(--color-gray-700)',
                fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
              }}
            >
              {child.childName}
              {child.status !== 'linked' && (
                <span style={{
                  fontSize: '0.625rem', fontWeight: 700, padding: '1px 6px',
                  borderRadius: 'var(--radius-full)', background: 'var(--color-warning-bg)', color: '#B26A00'
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
              padding: '6px 11px', borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap',
              border: `1px solid ${filter === f.key ? 'var(--color-primary)' : 'var(--color-gray-200)'}`,
              background: filter === f.key ? 'var(--color-primary)' : '#fff',
              color: filter === f.key ? '#fff' : 'var(--color-gray-700)',
              fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {children.length === 0 && (
        <div style={{
          background: 'var(--color-warning-bg)', color: '#7A5D00', padding: '11px 12px',
          borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', marginBottom: '12px', lineHeight: 1.55
        }}>
          아직 등록한 아이가 없어요. 내 정보에서 아이를 추가하면 신청할 수 있어요.
        </div>
      )}

      {visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 20px' }}>
          <div style={{ fontSize: '2.5rem' }}>🗓️</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '8px' }}>
            {filter === 'all' ? `${year}년 남은 일정이 없어요` : '해당하는 일정이 없어요'}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray-500)', lineHeight: 1.6, marginTop: '6px' }}>
            선생님이 새 일정을 올리면 여기에 보여요.
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
              const badge = event.type === 'closure' ? null : childBadge(childState);
              const dowColor = weekend === 'sun' ? 'var(--color-danger)' : weekend === 'sat' ? 'var(--color-primary)' : 'inherit';

              return (
                <button
                  key={event.id}
                  onClick={() => navigate(`/parent/events/${event.id}`)}
                  style={{
                    width: '100%', textAlign: 'left', background: '#fff', border: '1px solid transparent',
                    borderRadius: 'var(--radius-lg)', padding: '14px', marginBottom: '10px',
                    display: 'flex', gap: '12px', cursor: 'pointer', fontFamily: 'inherit'
                  }}
                >
                  <div style={{
                    width: '46px', flexShrink: 0, textAlign: 'center', borderRadius: 'var(--radius-md)',
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
