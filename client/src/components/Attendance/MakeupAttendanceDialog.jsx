import React, { useEffect, useMemo, useState } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { calculateAge } from '../../utils/dateHelpers';
import { Badge, Button, Callout, CheckRow, DateField, Field, List, Modal, SearchInput, Select, Tag } from '../ui';
import {
  addButtonLabel,
  attendedStudentIds,
  pendingStudentIds,
  searchStudents,
  toggleId
} from './makeupAttendance';

/**
 * 보강 출석 추가 — 날짜·수업을 고르고 학생을 여러 명 골라 한 번에 넣는다.
 * 그 수업에 이미 출석한 학생은 목록에서 고를 수 없고, 서버도 한 번 더 걸러 낸다(POST /api/attendance/makeup).
 * 열 때마다 새로 그려지므로(부모가 열 때만 렌더) 상태는 initialDate·initialClassId 에서 시작한다.
 */
function MakeupAttendanceDialog({ students, classes, initialDate, initialClassId = '', onClose, onAdded }) {
  const [date, setDate] = useState(initialDate);
  const [classId, setClassId] = useState(initialClassId);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [records, setRecords] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 고른 날짜의 출석 기록 — 이미 출석한 학생을 막는 데 쓴다
  useEffect(() => {
    let cancelled = false;
    setRecords([]);
    fetchWithAuth(`/api/attendance/date/${date}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        if (!cancelled) setRecords(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const attended = useMemo(() => attendedStudentIds(records, classId), [records, classId]);
  const pendingIds = pendingStudentIds(selectedIds, attended);
  const visibleStudents = useMemo(() => searchStudents(students, query), [students, query]);
  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const canSubmit = Boolean(date && classId && pendingIds.length > 0) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetchWithAuth('/api/attendance/makeup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, classId: Number(classId), studentIds: pendingIds })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '보강 출석을 추가하지 못했어요.');
      onAdded(data, { date, classId: Number(classId) });
    } catch (e) {
      console.error('보강 출석 추가 실패:', e);
      setError(e.message || '보강 출석을 추가하지 못했어요.');
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="보강 출석 추가"
      description="학생을 여러 명 골라 한 번에 추가할 수 있어요."
      onClose={submitting ? undefined : onClose}
      className="ui-makeup"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            취소
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit} loading={submitting}>
            {addButtonLabel(pendingIds.length)}
          </Button>
        </>
      }
    >
      <Field label="날짜" required>
        {(props) => <DateField {...props} value={date} onChange={setDate} />}
      </Field>

      <Field label="수업" required>
        {(props) => (
          <Select {...props} value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">수업을 선택하세요</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="학생" required hint="여러 명을 고를 수 있어요. 그 수업에 이미 출석한 학생은 고를 수 없어요.">
        {(props) => (
          <SearchInput
            {...props}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery('')}
            placeholder="학생 이름 검색"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
        )}
      </Field>

      {pendingIds.length > 0 && (
        <div className="ui-makeup__picked" role="group" aria-label="고른 학생">
          <span className="ui-makeup__picked-count">{pendingIds.length}명 선택</span>
          {pendingIds.map((id) => {
            const name = studentById.get(id)?.name ?? '';
            return (
              <Tag key={id} onRemove={() => setSelectedIds((ids) => ids.filter((x) => x !== id))} removeLabel={`${name} 빼기`}>
                {name}
              </Tag>
            );
          })}
        </div>
      )}

      <List className="ui-makeup__list" role="group" aria-label="학생 목록">
        {visibleStudents.length === 0 ? (
          <p className="ui-makeup__empty">{students.length === 0 ? '등록된 학생이 없어요' : '검색 결과가 없어요'}</p>
        ) : (
          visibleStudents.map((s) => {
            const done = attended.has(s.id);
            return (
              <CheckRow
                key={s.id}
                title={s.name}
                subtitle={`${s.birthdate || '-'} (${calculateAge(s.birthdate)}세)`}
                trailing={done ? <Badge tone="muted">이미 출석</Badge> : null}
                checked={!done && selectedIds.includes(s.id)}
                disabled={done || submitting}
                onChange={() => setSelectedIds((ids) => toggleId(ids, s.id))}
              />
            );
          })
        )}
      </List>

      {error && <Callout tone="danger">{error}</Callout>}
    </Modal>
  );
}

export default MakeupAttendanceDialog;
