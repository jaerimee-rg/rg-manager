import React, { useState } from 'react';
import { APPARATUS_PRESET } from '../../utils/eventFormat';

const MAX_OPTIONS = 20;
const LABEL_MAX = 30;

/**
 * 이벤트 옵션 편집기.
 * 옵션의 id 는 학부모 신청과 묶여 있으므로 라벨만 바꾸고 id 는 그대로 넘긴다.
 */
function OptionsEditor({ options, onChange, usageById = {}, showApparatus = false }) {
  const [draft, setDraft] = useState('');

  const add = (label) => {
    const value = String(label || '').trim().slice(0, LABEL_MAX);
    if (!value) return;
    if (options.length >= MAX_OPTIONS) {
      alert(`옵션은 최대 ${MAX_OPTIONS}개까지 등록할 수 있습니다.`);
      return;
    }
    if (options.some((o) => o.label === value)) return;
    onChange([...options, { id: null, label: value }]);
  };

  const addFromDraft = () => {
    add(draft);
    setDraft('');
  };

  const addApparatus = () => {
    const missing = APPARATUS_PRESET.filter((name) => !options.some((o) => o.label === name));
    if (!missing.length) return;
    onChange([...options, ...missing.slice(0, MAX_OPTIONS - options.length).map((label) => ({ id: null, label }))]);
  };

  const rename = (index, label) => {
    const next = [...options];
    next[index] = { ...next[index], label: label.slice(0, LABEL_MAX) };
    onChange(next);
  };

  const remove = (index) => {
    const option = options[index];
    const used = option.id ? usageById[option.id] || 0 : 0;

    if (used > 0 && !confirm(`"${option.label}" 옵션은 ${used}건의 신청이 선택했습니다.\n삭제하면 그 신청에는 "(삭제된 옵션)" 으로 표시됩니다. 삭제할까요?`)) {
      return;
    }

    onChange(options.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div style={{ border: '1px solid var(--color-gray-200)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        {options.length === 0 && (
          <div style={{ padding: '14px', fontSize: '0.8125rem', color: 'var(--color-gray-500)', textAlign: 'center' }}>
            옵션이 없으면 학부모는 참가 신청만 하게 됩니다.
          </div>
        )}

        {options.map((option, index) => {
          const used = option.id ? usageById[option.id] || 0 : 0;
          return (
            <div
              key={option.id || `new-${index}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                borderBottom: index < options.length - 1 ? '1px solid var(--color-gray-100)' : 'none'
              }}
            >
              <input
                type="text"
                value={option.label}
                onChange={(e) => rename(index, e.target.value)}
                maxLength={LABEL_MAX}
                aria-label={`옵션 ${index + 1}`}
                style={{
                  flex: 1, minWidth: 0, border: '1px solid transparent', borderRadius: 'var(--radius-sm)',
                  padding: '8px 9px', fontSize: '1rem', background: 'var(--bg-tertiary)', fontFamily: 'inherit'
                }}
              />
              {used > 0 && (
                <span style={{ fontSize: '0.6875rem', color: 'var(--color-gray-500)', whiteSpace: 'nowrap' }}>
                  신청 {used}건
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(index)}
                title="옵션 삭제"
                aria-label={`${option.label} 옵션 삭제`}
                style={{
                  border: 'none', background: 'none', color: 'var(--color-gray-400)',
                  cursor: 'pointer', fontSize: '1rem', width: '32px', height: '32px', borderRadius: '6px'
                }}
              >
                ✕
              </button>
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: '8px', padding: '10px', background: 'var(--bg-tertiary)' }}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addFromDraft();
              }
            }}
            placeholder="옵션 추가 (예: 단체전, 의상 대여, 5km)"
            maxLength={LABEL_MAX}
            aria-label="새 옵션"
            style={{
              flex: 1, minWidth: 0, padding: '9px 11px', border: '1px solid var(--color-gray-300)',
              borderRadius: 'var(--radius-sm)', fontSize: '1rem', fontFamily: 'inherit'
            }}
          />
          <button type="button" className="btn btn-outline btn-sm" onClick={addFromDraft}>
            추가
          </button>
        </div>
      </div>

      {showApparatus && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={addApparatus}>
            🎀 종목 6개 불러오기
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)' }}>
            맨손 · 볼 · 후프 · 곤봉 · 리본 · 줄 을 옵션으로 추가합니다
          </span>
        </div>
      )}
    </div>
  );
}

export default OptionsEditor;
