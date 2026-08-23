import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { useIsMobile } from '../../hooks/useMediaQuery';

// 서버가 목록을 내려주지만, 아이콘·색은 화면 쪽 표현이므로 여기서 정한다.
const PROVIDER_STYLE = {
  openai: { icon: '🤖', accent: '#10A37F' },
  gemini: { icon: '✨', accent: '#4285F4' }
};

const styleFor = (id) => PROVIDER_STYLE[id] || { icon: '⚙️', accent: 'var(--color-primary)' };

const EFFORT_LABEL = {
  minimal: '최소 (minimal)',
  low: '낮음 (low)',
  medium: '보통 (medium)',
  high: '높음 (high)'
};

function AdminSettings() {
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState('');
  const [effectiveProvider, setEffectiveProvider] = useState('');
  const [selected, setSelected] = useState('');
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('');
  const [timeoutSec, setTimeoutSec] = useState(20);
  const [savedTimeoutSec, setSavedTimeoutSec] = useState(20);
  const [range, setRange] = useState({ min: 5000, max: 60000 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    window.scrollTo(0, 0);
    loadSettings();
  }, []);

  const applyData = (data) => {
    const list = Array.isArray(data.providers) ? data.providers : [];
    setProviders(list);
    setProvider(data.provider || '');
    setEffectiveProvider(data.effectiveProvider || data.provider || '');
    setSelected(data.provider || '');
    const sec = Math.round((data.timeoutMs || 20000) / 1000);
    setTimeoutSec(sec);
    setSavedTimeoutSec(sec);
    if (data.timeoutRange) setRange(data.timeoutRange);

    const current = list.find((p) => p.id === data.provider);
    if (current) {
      setModel(current.model || '');
      setEffort(current.effort || '');
    }
  };

  const loadSettings = async () => {
    try {
      const response = await fetchWithAuth('/api/settings/ai');
      const data = await response.json();

      if (response.ok) applyData(data);
      else alert(data.error || 'AI 설정을 불러오지 못했습니다.');
    } catch (error) {
      console.error('AI 설정 로드 실패:', error);
      alert('AI 설정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 제공자를 바꾸면 그 제공자에 저장돼 있던 모델·강도를 불러온다.
  const handleSelectProvider = (id) => {
    setSelected(id);
    const next = providers.find((p) => p.id === id);
    if (next) {
      setModel(next.model || '');
      setEffort(next.effort || '');
    }
  };

  // 마지막으로 저장된 값으로 즉시 되돌린다 (서버를 다시 부르지 않는다).
  const revert = () => {
    setSelected(provider);
    const saved = providers.find((p) => p.id === provider);
    if (saved) {
      setModel(saved.model || '');
      setEffort(saved.effort || '');
    }
    setTimeoutSec(savedTimeoutSec);
  };

  const handleSave = async () => {
    if (!model.trim()) {
      alert('모델 이름을 입력해 주세요.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetchWithAuth('/api/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selected,
          model: model.trim(),
          effort,
          timeoutMs: timeoutSec * 1000
        })
      });

      const data = await response.json();

      if (response.ok) {
        applyData(data);
        alert('AI 설정이 저장되었습니다.');
      } else {
        // 저장에 실패하면 화면도 저장된 값으로 되돌려 실제 상태와 어긋나지 않게 한다.
        revert();
        alert(data.error || 'AI 설정 저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('AI 설정 저장 실패:', error);
      revert();
      alert('AI 설정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const current = providers.find((p) => p.id === selected);
  const savedCurrent = providers.find((p) => p.id === provider);
  const labelOf = (id) => providers.find((p) => p.id === id)?.label || id;

  const isDirty =
    Boolean(selected) &&
    (selected !== provider ||
      model.trim() !== (savedCurrent?.model || '') ||
      effort !== (savedCurrent?.effort || '') ||
      timeoutSec !== savedTimeoutSec);



  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <h2 className="page-title">설정</h2>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">FAQ 챗봇 AI</h3>
        </div>

        <p className="ai-setting-intro">
          학부모 질문에 답할 때 사용할 AI 와 세부 설정입니다.
          <br />
          어떤 설정이든 답변 문장은 등록된 FAQ 원문을 그대로 사용합니다.
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
                      onChange={() => handleSelectProvider(p.id)}
                      style={{ marginTop: 4 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ai-setting-provider-name">
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
                        {!p.configured && <span className="badge badge-gray">API 키 없음</span>}
                      </div>
                      <div className="ai-setting-provider-desc">{p.description}</div>
                      <div className="ai-setting-provider-model">{`모델: ${p.model}`}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            {effectiveProvider && effectiveProvider !== provider && (
              <div role="alert" className="ai-setting-warning">
                <strong>{labelOf(provider)}</strong> 를 골라 두었지만 이 서버에 해당 API 키가 없어
                실제로는 <strong>{labelOf(effectiveProvider)}</strong> 로 답변하고 있습니다.
                <br />
                서버 환경변수에 키를 넣어주세요.
              </div>
            )}

            {current && (
              <fieldset className="ai-setting-detail">
                <legend>{current.label} 세부 설정</legend>

                <div className="form-group">
                  <label className="form-label" htmlFor="ai-model">모델</label>
                  <select
                    id="ai-model"
                    value={model}
                    disabled={saving}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    {current.modelOptions.map((m) => (
                      <option key={m} value={m}>
                        {m}
                        {m === current.defaultModel ? ' (기본값)' : ''}
                      </option>
                    ))}
                  </select>
                  <div className="form-help">
                    모델을 바꾸면 다음 질문부터 적용됩니다. 이 계정에서 쓸 수 없는 모델이면
                    답변이 실패하고 학부모에게는 안내 문구가 나갑니다.
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="ai-effort">{current.effortLabel}</label>
                  <select
                    id="ai-effort"
                    value={effort}
                    disabled={saving}
                    onChange={(e) => setEffort(e.target.value)}
                  >
                    <option value="">모델 기본값에 맡기기</option>
                    {current.effortOptions.map((v) => (
                      <option key={v} value={v}>
                        {EFFORT_LABEL[v] || v}
                      </option>
                    ))}
                  </select>
                  <div className="form-help">{current.effortHelp}</div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="ai-timeout">응답 대기 시간 (초)</label>
                  <input
                    id="ai-timeout"
                    type="number"
                    min={range.min / 1000}
                    max={range.max / 1000}
                    value={timeoutSec}
                    disabled={saving}
                    onChange={(e) => setTimeoutSec(Number(e.target.value))}
                  />
                  <div className="form-help">
                    이 시간을 넘기면 답변을 포기하고 안내 문구를 보냅니다.
                    추론 강도를 높이면 더 오래 걸리니 함께 늘려주세요.
                  </div>
                </div>
              </fieldset>
            )}

            {providers.some((p) => !p.configured) && (
              <p className="ai-setting-note">
                API 키가 없는 제공자는 선택할 수 없습니다.
                서버 환경변수에 키를 넣은 뒤 다시 시도해주세요.
              </p>
            )}

            <div className="ai-setting-actions">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !isDirty}>
                {saving ? '저장 중...' : '저장'}
              </button>
              {isDirty && (
                <button className="btn btn-secondary" onClick={revert} disabled={saving}>
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
