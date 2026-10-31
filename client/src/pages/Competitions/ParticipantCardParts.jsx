import React from 'react';

const PAYMENT_ITEMS = [
  { field: 'paid', label: '참가비', tone: 'success' },
  { field: 'coachFeePaid', label: '출강비', tone: 'primary' },
  { field: 'photoFeePaid', label: '사진비', tone: 'primary' },
  { field: 'videoFeePaid', label: '영상비', tone: 'primary' },
  { field: 'costumeFeePaid', label: '의상대여비', tone: 'primary' }
];

/** 참가 학생 카드의 납부 체크. 카드를 누르면 종목 모달이 열리므로 onToggle 쪽에서 전파를 막는다. */
export function PaymentChecks({ student, onToggle }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: 'var(--spacing-sm)' }}>
      {PAYMENT_ITEMS.map(({ field, label, tone }) => {
        const checked = Boolean(student[field]);
        const color = `var(--color-${tone})`;

        return (
          <button
            key={field}
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={`${student.name} ${label}`}
            onClick={(e) => onToggle(student.id, field, e)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: 'var(--shape-btn)',
              backgroundColor: checked ? `var(--color-${tone}-bg)` : 'var(--color-gray-100)',
              cursor: 'pointer',
              border: 'var(--stroke-thin)',
              fontFamily: 'inherit'
            }}
          >
            <span style={{
              width: '14px',
              height: '14px',
              borderRadius: '3px',
              border: checked ? `2px solid ${color}` : '2px solid var(--color-gray-400)',
              backgroundColor: checked ? color : 'var(--field)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--paper)',
              fontSize: '9px',
              fontWeight: 'bold'
            }}>
              {checked && '✓'}
            </span>
            <span style={{
              fontSize: '0.6875rem',
              fontWeight: 500,
              color: checked ? color : 'var(--color-gray-500)'
            }}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 학부모가 신청할 때 고른 항목. 신청 없이 직접 등록한 학생은 줄 자체가 없다. */
export function RegistrationOptions({ student }) {
  const options = student.registrationOptions || [];
  if (options.length === 0 && !student.registrationCancelled) return null;

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '4px',
      marginTop: 'var(--spacing-sm)',
      fontSize: '0.75rem'
    }}>
      <span style={{ color: 'var(--color-gray-500)', marginRight: '2px' }}>신청</span>
      {options.map((option) => (
        <span
          key={option.id}
          style={{ background: 'var(--color-gray-100)', borderRadius: 'var(--shape-tag)', padding: '2px 6px' }}
        >
          {option.label}
        </span>
      ))}
      {student.registrationCancelled && <span className="badge badge-danger">⚠ 신청 취소</span>}
    </div>
  );
}
