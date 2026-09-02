import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import { consumeReturnTo, returnPathFor } from '../../utils/returnTo';

const emptyChild = () => ({ name: '', birthdate: '' });

/** 학부모명 기본값. 서버의 services/parentOnboarding.defaultParentName 과 같은 규칙이다. */
export const defaultParentName = (childName) => {
  const name = String(childName ?? '').replace(/\s+/g, '');
  return name ? `${name}엄마` : '';
};

const PARENT_NAME_MAX = 20;

/**
 * 가입 직후 아이 등록.
 * 이름·생년월일이 선생님 학생과 맞으면 자동 연결되고, 아니면 확인 대기로 남는다.
 */
function ParentOnboarding({ teachers = [], onDone }) {
  const navigate = useNavigate();
  const [children, setChildren] = useState([emptyChild()]);
  /* 학부모명("예림엄마")은 첫 아이 이름에서 자동으로 만들어 제안한다.
     한 번이라도 직접 고치면 그 뒤로는 아이 이름을 바꿔도 건드리지 않는다. */
  const [parentName, setParentName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  /* 아이는 선생님 1명의 학생에 대응한다 (docs/accounts-roles FR-354~355).
     선생님이 한 명이면 고를 것이 없으므로 자동으로 정해진다. */
  const [teacherId, setTeacherId] = useState(teachers.length === 1 ? teachers[0].id : '');
  const [agreed, setAgreed] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedName = teachers.find((x) => String(x.id) === String(teacherId))?.name || '';

  const update = (index, patch) => {
    setChildren((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
    // 아직 학부모명을 직접 고치지 않았으면 첫 아이 이름을 따라 제안값이 바뀐다
    if (index === 0 && !nameTouched && patch.name !== undefined) {
      setParentName(defaultParentName(patch.name));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    const cleaned = children
      .map((c) => ({ name: c.name.trim(), birthdate: c.birthdate }))
      .filter((c) => c.name || c.birthdate);

    if (cleaned.length === 0) return setError('아이 이름과 생년월일을 입력해주세요.');
    if (cleaned.some((c) => !c.name)) return setError('아이 이름을 입력해주세요.');
    if (cleaned.some((c) => !c.birthdate)) return setError('생년월일을 선택해주세요.');
    if (teachers.length > 1 && !teacherId) return setError('어느 선생님의 아이인지 선택해 주세요.');
    // 비워 두면 첫 아이 이름으로 만든 제안값을 그대로 쓴다
    const finalName = (parentName.trim() || defaultParentName(cleaned[0].name)).slice(0, PARENT_NAME_MAX);
    if (!finalName) return setError('학부모명을 입력해주세요.');
    if (!agreed) return setError('안내에 동의해 주세요.');

    setSaving(true);
    try {
      const response = await fetchWithAuth('/api/parent/children', {
        method: 'POST',
        body: JSON.stringify({ teacherId: teacherId || undefined, parentName: finalName, children: cleaned })
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || '저장에 실패했습니다.');
        return;
      }

      // 상위(ParentApp)의 "아이 있음" 판정을 먼저 새로 고친 뒤에 이동한다
      await onDone?.();
      // 공유 링크를 눌러 가입까지 온 학부모는 그 이벤트로 바로 간다
      const returnTo = returnPathFor('parent', consumeReturnTo());
      navigate(returnTo || '/parent/schedule', { state: { justOnboarded: true } });
    } catch {
      setError('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '24px 16px' }}>
      <form onSubmit={submit} style={{
        maxWidth: '480px', margin: '0 auto', background: '#fff',
        borderRadius: 'var(--radius-lg)', padding: '24px 20px'
      }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '6px' }}>아이 정보를 알려 주세요</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-gray-600)', lineHeight: 1.6, marginBottom: '20px' }}>
          {selectedName ? `${selectedName} 선생님이 ` : '선생님이 '}등록한 학생 정보와 대조해 자동으로 연결해요.
          아이가 여러 명이면 모두 추가해 주세요.
        </p>

        {teachers.length > 1 && (
          <div style={{ marginBottom: '14px' }}>
            <label htmlFor="onboarding-teacher" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '6px' }}>
              어느 선생님의 아이인가요? <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <select
              id="onboarding-teacher"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              style={{ width: '100%', padding: '12px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius-md)', fontSize: '16px', fontFamily: 'inherit', background: '#fff' }}
            >
              <option value="">선생님을 선택해 주세요</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>{teacher.name} 선생님</option>
              ))}
            </select>
          </div>
        )}

        {children.map((child, index) => (
          <div
            key={index}
            style={{
              background: 'var(--bg-tertiary)', border: '1px solid var(--color-gray-200)',
              borderRadius: 'var(--radius-md)', padding: '14px', marginBottom: '10px', position: 'relative'
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '8px' }}>
              아이 {index + 1}
            </div>
            {children.length > 1 && (
              <button
                type="button"
                onClick={() => setChildren((prev) => prev.filter((_, i) => i !== index))}
                aria-label={`아이 ${index + 1} 삭제`}
                style={{
                  position: 'absolute', top: '10px', right: '10px', border: 'none', background: 'none',
                  color: 'var(--color-gray-400)', cursor: 'pointer', fontSize: '1rem'
                }}
              >
                ✕
              </button>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label htmlFor={`child-name-${index}`} style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '6px' }}>
                  이름 <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <input
                  id={`child-name-${index}`} type="text" value={child.name} maxLength={20}
                  onChange={(e) => update(index, { name: e.target.value })}
                  placeholder="예: 김민서"
                  style={{ width: '100%', padding: '12px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius-md)', fontSize: '16px' }}
                />
              </div>
              <div>
                <label htmlFor={`child-birth-${index}`} style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '6px' }}>
                  생년월일 <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <input
                  id={`child-birth-${index}`} type="date" value={child.birthdate}
                  onChange={(e) => update(index, { birthdate: e.target.value })}
                  style={{ width: '100%', padding: '12px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius-md)', fontSize: '16px' }}
                />
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setChildren((prev) => [...prev, emptyChild()])}
          style={{
            width: '100%', border: '1px dashed var(--color-gray-300)', background: '#fff',
            color: 'var(--color-primary)', fontWeight: 700, padding: '12px',
            borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: '0.875rem', marginBottom: '14px'
          }}
        >
          + 아이 추가
        </button>

        {/* 선생님 화면과 알림에 이 이름으로 보인다. 아이 이름에서 만든 제안값이 채워져 있다. */}
        <div style={{ marginBottom: '14px' }}>
          <label htmlFor="parent-name" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '6px' }}>
            학부모명 <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <input
            id="parent-name" type="text" value={parentName} maxLength={PARENT_NAME_MAX}
            onChange={(e) => { setNameTouched(true); setParentName(e.target.value); }}
            placeholder="예: 예림엄마"
            style={{ width: '100%', padding: '12px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius-md)', fontSize: '16px' }}
          />
          <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '6px', lineHeight: 1.5 }}>
            선생님에게 이 이름으로 보여요. 원하시는 호칭으로 바꿔도 좋아요 (내 정보에서 언제든 변경).
          </div>
        </div>

        <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '0.75rem', color: 'var(--color-gray-600)', lineHeight: 1.5, marginBottom: '14px' }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: '3px' }} />
          입력한 학부모명과 아이 이름·생년월일은 {selectedName ? `${selectedName} 선생님` : '선생님'}이 학생 정보와 대조하고 학부모를 알아보는 데에만 사용됩니다.
        </label>

        {error && (
          <div role="alert" style={{
            background: 'var(--color-danger-bg)', color: 'var(--color-danger)',
            padding: '10px 12px', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', marginBottom: '12px'
          }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%' }}>
          {saving ? '저장 중...' : '시작하기'}
        </button>
      </form>
    </div>
  );
}

export default ParentOnboarding;
