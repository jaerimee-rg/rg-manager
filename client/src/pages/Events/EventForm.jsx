import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import { EVENT_TYPES, splitDeadline, joinDeadline } from '../../utils/eventFormat';
import OptionsEditor from './OptionsEditor';
import EventAlbumSection from './EventAlbumSection';

const TYPE_HINTS = {
  competition: '신청 → 확정 → 참가 학생',
  special: '러닝·특강·발표회',
  closure: '신청 없음 · 안내만'
};

const emptyForm = {
  type: 'competition',
  title: '',
  date: '',
  endDate: '',
  startTime: '',
  location: '',
  description: '',
  requireOption: false,
  isPublished: true,
  registrationOpen: true,
  deadlineDate: '',
  deadlineTime: ''
};

function Toggle({ checked, onChange, label, description, id }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '12px', padding: '12px 0', borderTop: '1px solid var(--color-gray-100)'
    }}>
      <div>
        <label htmlFor={id} style={{ fontSize: '0.9375rem', fontWeight: 600, cursor: 'pointer' }}>{label}</label>
        {description && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '2px' }}>{description}</div>
        )}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: '44px', height: '26px', flexShrink: 0, cursor: 'pointer' }}
      />
    </div>
  );
}

function EventForm({ basePath = '/events' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const editing = location.state?.event || null;

  const [form, setForm] = useState(emptyForm);
  const [options, setOptions] = useState([]);
  const [usageById, setUsageById] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editing) return;

    const deadline = splitDeadline(editing.registrationDeadline);
    setForm({
      type: editing.type,
      title: editing.title || '',
      date: editing.date || '',
      endDate: editing.endDate || '',
      startTime: editing.startTime || '',
      location: editing.location || '',
      description: editing.description || '',
      requireOption: editing.requireOption === true,
      isPublished: editing.isPublished !== false,
      registrationOpen: editing.registrationOpen !== false,
      deadlineDate: deadline.date,
      deadlineTime: deadline.time
    });
    setOptions(editing.options || []);

    // 옵션을 지울 때 "n건의 신청이 선택했습니다" 를 보여주기 위해 사용 수를 받아둔다.
    if (editing.type !== 'closure') {
      fetchWithAuth(`/api/events/${editing.id}/registrations`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          const map = {};
          for (const s of data.summary || []) map[s.id] = s.count;
          setUsageById(map);
        })
        .catch(() => {});
    }
  }, [editing]);

  const isClosure = form.type === 'closure';
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.title.trim()) return setError('이벤트 이름을 입력해주세요.');
    if (!form.date) return setError('날짜를 선택해주세요.');
    if (!isClosure && !form.location.trim()) return setError('장소를 입력해주세요.');
    if (form.endDate && form.endDate < form.date) return setError('종료일은 시작일보다 빠를 수 없습니다.');
    if (!isClosure && form.deadlineTime && !form.deadlineDate) {
      return setError('접수 마감 날짜를 선택해주세요.');
    }
    if (!isClosure && form.requireOption && options.length === 0) {
      return setError('옵션을 1개 이상 등록하거나 "옵션 1개 이상 필수" 를 꺼주세요.');
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        location: isClosure ? null : form.location.trim(),
        description: form.description.trim(),
        endDate: form.endDate || null,
        startTime: form.startTime || null,
        registrationDeadline: joinDeadline(form.deadlineDate, form.deadlineTime),
        options: options.map((o) => (o.id ? { id: o.id, label: o.label } : o.label))
      };

      const response = await fetchWithAuth(
        editing ? `/api/events/${editing.id}` : '/api/events',
        {
          method: editing ? 'PUT' : 'POST',
          body: JSON.stringify(payload)
        }
      );

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || '저장에 실패했습니다.');
        return;
      }

      if (data.removedOptionRegistrations > 0) {
        alert(`옵션을 지웠습니다. ${data.removedOptionRegistrations}건의 신청에는 "(삭제된 옵션)" 으로 표시됩니다.`);
      }

      navigate(basePath);
    } catch (err) {
      setError('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container">
      <div className="page-header">
        <h2>{editing ? '이벤트 수정' : '이벤트 등록'}</h2>
      </div>

      <form onSubmit={submit} className="card" style={{ padding: '20px', maxWidth: '680px' }}>
        <div className="form-group">
          <label>
            종류 <span style={{ color: 'var(--color-danger)' }}>*</span>{' '}
            {editing && (
              <span style={{ fontWeight: 400, color: 'var(--color-gray-400)', fontSize: '0.75rem' }}>
                등록 후에는 바꿀 수 없어요
              </span>
            )}
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {Object.entries(EVENT_TYPES).map(([key, meta]) => (
              <button
                key={key}
                type="button"
                disabled={!!editing}
                onClick={() => set({ type: key })}
                aria-pressed={form.type === key}
                style={{
                  border: `1px solid ${form.type === key ? 'var(--color-primary)' : 'var(--color-gray-200)'}`,
                  background: form.type === key ? 'var(--color-primary-bg)' : '#fff',
                  color: form.type === key ? 'var(--color-primary)' : 'var(--color-gray-700)',
                  borderRadius: 'var(--radius-md)', padding: '12px 8px',
                  cursor: editing ? 'not-allowed' : 'pointer', opacity: editing && form.type !== key ? 0.5 : 1,
                  fontSize: '0.875rem', fontWeight: 700, fontFamily: 'inherit',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'
                }}
              >
                <span style={{ fontSize: '1.3rem' }}>{meta.emoji}</span>
                {meta.label}
                <span style={{ fontSize: '0.6875rem', fontWeight: 400, color: 'var(--color-gray-500)' }}>
                  {TYPE_HINTS[key]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="ev-title">이벤트 이름 <span style={{ color: 'var(--color-danger)' }}>*</span></label>
          <input
            id="ev-title" type="text" value={form.title} maxLength={100}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="예: 2026 서울시 리듬체조 대회"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label htmlFor="ev-date">날짜 <span style={{ color: 'var(--color-danger)' }}>*</span></label>
            <input id="ev-date" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="ev-end">종료일 <span style={{ fontWeight: 400, color: 'var(--color-gray-400)' }}>(기간일 때)</span></label>
            <input id="ev-end" type="date" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label htmlFor="ev-time">시간 <span style={{ fontWeight: 400, color: 'var(--color-gray-400)' }}>(비우면 종일)</span></label>
            <input id="ev-time" type="time" value={form.startTime} onChange={(e) => set({ startTime: e.target.value })} />
          </div>
          {!isClosure && (
            <div className="form-group">
              <label htmlFor="ev-loc">장소 <span style={{ color: 'var(--color-danger)' }}>*</span></label>
              <input
                id="ev-loc" type="text" value={form.location}
                onChange={(e) => set({ location: e.target.value })}
                placeholder="예: 올림픽공원 체조경기장"
              />
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="ev-desc">학부모 안내</label>
          <textarea
            id="ev-desc" value={form.description} rows={4} maxLength={1000}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="학부모 일정 상세에 그대로 보입니다."
          />
        </div>

        {!isClosure && (
          <>
            <div className="form-group">
              <label>
                옵션{' '}
                <span style={{ fontWeight: 400, color: 'var(--color-gray-400)', fontSize: '0.75rem' }}>
                  학부모가 신청할 때 체크합니다 · 여러 개 선택 가능
                </span>
              </label>
              <OptionsEditor
                options={options}
                onChange={setOptions}
                usageById={usageById}
                showApparatus={form.type === 'competition'}
              />
            </div>

            <Toggle
              id="ev-require"
              checked={form.requireOption}
              onChange={(v) => set({ requireOption: v })}
              label="옵션 1개 이상 필수"
              description="켜면 학부모가 옵션을 고르지 않고는 신청할 수 없어요"
            />
          </>
        )}

        <Toggle
          id="ev-published"
          checked={form.isPublished}
          onChange={(v) => set({ isPublished: v })}
          label="학부모에게 공개"
          description="끄면 학부모 일정에 보이지 않아요 (준비 중인 이벤트)"
        />

        {!isClosure && (
          <>
            <Toggle
              id="ev-open"
              checked={form.registrationOpen}
              onChange={(v) => set({ registrationOpen: v })}
              label="접수 받기"
              description='끄면 학부모 화면에 "접수 마감" 으로 보여요'
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <div className="form-group">
                <label htmlFor="ev-deadline-date">
                  마감 날짜{' '}
                  <span style={{ fontWeight: 400, color: 'var(--color-gray-400)' }}>(비우면 시작 전까지)</span>
                </label>
                <input
                  id="ev-deadline-date" type="date" value={form.deadlineDate}
                  onChange={(e) => set({ deadlineDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="ev-deadline-time">
                  마감 시간{' '}
                  <span style={{ fontWeight: 400, color: 'var(--color-gray-400)' }}>(비우면 23:59)</span>
                </label>
                <input
                  id="ev-deadline-time" type="time" value={form.deadlineTime}
                  onChange={(e) => set({ deadlineTime: e.target.value })}
                />
              </div>
            </div>
          </>
        )}

        {form.type === 'competition' && (
          <div style={{
            background: 'var(--color-primary-bg)', color: 'var(--color-primary-dark)',
            padding: '12px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', lineHeight: 1.6
          }}>
            🏆 대회형은 저장하면 <b>대회 데이터(참가 학생·종목·참가비)</b>가 함께 만들어져 기존 [참가 학생 관리] 화면에서 그대로 쓸 수 있어요.
            학부모 신청은 <b>[확정]</b> 해야 참가 학생으로 올라갑니다.
          </div>
        )}

        {error && (
          <div role="alert" style={{
            marginTop: '14px', background: 'var(--color-danger-bg)', color: 'var(--color-danger)',
            padding: '11px 13px', borderRadius: 'var(--radius-md)', fontSize: '0.875rem'
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => navigate(basePath)}>
            취소
          </button>
        </div>
      </form>

      {editing && form.type !== 'closure' && <EventAlbumSection event={editing} />}
    </div>
  );
}

export default EventForm;
