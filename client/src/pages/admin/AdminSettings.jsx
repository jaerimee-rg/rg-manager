import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { useIsMobile } from '../../hooks/useMediaQuery';

// 서버가 목록을 내려주지만, 아이콘·색은 화면 쪽 표현이므로 여기서 정한다.
const PROVIDER_STYLE = {
  openai: { icon: '🤖', accent: '#10A37F' },
  gemini: { icon: '✨', accent: '#4285F4' }
};

const styleFor = (id) => PROVIDER_STYLE[id] || { icon: '⚙️', accent: 'var(--color-primary)' };

function AdminSettings() {
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState('');
  const [effectiveProvider, setEffectiveProvider] = useState('');
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    window.scrollTo(0, 0);
    loadSettings();
  }, []);

  const applyData = (data) => {
    setProviders(Array.isArray(data.providers) ? data.providers : []);
    setProvider(data.provider || '');
    setEffectiveProvider(data.effectiveProvider || data.provider || '');
    setSelected(data.provider || '');
  };

  const loadSettings = async () => {
    try {
      const response = await fetchWithAuth('/api/settings/ai');
      const data = await response.json();

      if (response.ok) {
        applyData(data);
      } else {
        alert(data.error || 'AI 설정을 불러오지 못했습니다.');
      }
    } catch (error) {
      console.error('AI 설정 로드 실패:', error);
      alert('AI 설정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selected || selected === provider) return;

    setSaving(true);
    try {
      const response = await fetchWithAuth('/api/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selected })
      });

      const data = await response.json();

      if (response.ok) {
        applyData(data);
        alert('AI 설정이 저장되었습니다.');
      } else {
        // 저장에 실패하면 화면도 서버 값으로 되돌려 실제 상태와 어긋나지 않게 한다.
        setSelected(provider);
        alert(data.error || 'AI 설정 저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('AI 설정 저장 실패:', error);
      setSelected(provider);
      alert('AI 설정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const labelOf = (id) => providers.find((p) => p.id === id)?.label || id;

  const isDirty = Boolean(selected) && selected !== provider;

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <h2 className="page-title">설정</h2>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">AI 제공자</h3>
        </div>

        <p style={{
          color: 'var(--color-gray-600)',
          fontSize: '0.9375rem',
          lineHeight: 1.6,
          marginTop: 'var(--spacing-lg)',
          marginBottom: 'var(--spacing-lg)'
        }}>
          FAQ 챗봇이 학부모 질문에 답할 때 사용할 AI 를 고릅니다.
          <br />
          어떤 AI 를 골라도 답변 문장은 등록된 FAQ 원문을 그대로 사용합니다.
        </p>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <div className="skeleton" style={{ height: 84, borderRadius: 'var(--radius-md)' }}></div>
            <div className="skeleton" style={{ height: 84, borderRadius: 'var(--radius-md)' }}></div>
          </div>
        ) : (
          <>
            <div
              role="radiogroup"
              aria-label="AI 제공자"
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: 'var(--spacing-md)'
              }}
            >
              {providers.map((p) => {
                const { icon, accent } = styleFor(p.id);
                const isSelected = selected === p.id;

                return (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 'var(--spacing-md)',
                      padding: 'var(--spacing-lg)',
                      border: `2px solid ${isSelected ? accent : 'var(--color-gray-200)'}`,
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: isSelected ? 'var(--color-gray-50)' : 'transparent',
                      cursor: p.configured ? 'pointer' : 'not-allowed',
                      opacity: p.configured ? 1 : 0.6
                    }}
                  >
                    <input
                      type="radio"
                      name="aiProvider"
                      value={p.id}
                      checked={isSelected}
                      disabled={!p.configured || saving}
                      onChange={() => setSelected(p.id)}
                      style={{ marginTop: 4 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '6px',
                        fontWeight: 600,
                        color: 'var(--color-gray-900)'
                      }}>
                        <span aria-hidden="true">{icon}</span>
                        <span>{p.label}</span>
                        {provider === p.id && (
                          <span className="badge badge-primary">
                            {effectiveProvider === p.id ? '사용 중' : '선택됨'}
                          </span>
                        )}
                        {effectiveProvider === p.id && provider !== p.id && (
                          <span className="badge badge-primary">대신 사용 중</span>
                        )}
                        {!p.configured && (
                          <span className="badge badge-gray">API 키 없음</span>
                        )}
                      </div>
                      <div style={{
                        color: 'var(--color-gray-600)',
                        fontSize: '0.875rem',
                        marginTop: '4px'
                      }}>
                        {p.description}
                      </div>
                      <div style={{
                        color: 'var(--color-gray-500)',
                        fontSize: '0.8125rem',
                        marginTop: '6px'
                      }}>
                        {`모델: ${p.model}`}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {effectiveProvider && effectiveProvider !== provider && (
              <div
                role="alert"
                style={{
                  marginTop: 'var(--spacing-lg)',
                  padding: 'var(--spacing-md) var(--spacing-lg)',
                  border: '1px solid var(--color-warning, #d97706)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-gray-800)',
                  fontSize: '0.875rem',
                  lineHeight: 1.6
                }}
              >
                <strong>{labelOf(provider)}</strong> 를 골라 두었지만 이 서버에 해당 API 키가 없어
                실제로는 <strong>{labelOf(effectiveProvider)}</strong> 로 답변하고 있습니다.
                <br />
                서버 환경변수에 키를 넣어주세요.
              </div>
            )}

            {providers.some((p) => !p.configured) && (
              <p style={{
                color: 'var(--color-gray-500)',
                fontSize: '0.8125rem',
                marginTop: 'var(--spacing-md)',
                lineHeight: 1.6
              }}>
                API 키가 없는 제공자는 선택할 수 없습니다.
                서버 환경변수(로컬 <code>.env</code>, Vercel 환경변수)에 키를 넣은 뒤 다시 시도해주세요.
              </p>
            )}

            <div style={{
              display: 'flex',
              gap: 'var(--spacing-md)',
              marginTop: 'var(--spacing-xl)',
              paddingTop: 'var(--spacing-lg)',
              borderTop: '1px solid var(--color-gray-200)'
            }}>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={!isDirty || saving}
              >
                {saving ? '저장 중...' : '저장'}
              </button>
              {isDirty && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setSelected(provider)}
                  disabled={saving}
                >
                  취소
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminSettings;
