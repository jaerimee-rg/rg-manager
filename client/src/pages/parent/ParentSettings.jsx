import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import ParentLayout from '../../components/parent/ParentLayout';
import ChildFaceCard from './ChildFaceCard';

const STATUS = {
  linked: { label: '연결됨', className: 'badge-success' },
  pending: { label: '확인 대기', className: 'badge-warning' },
  unlinked: { label: '연결 해제됨', className: 'badge-gray' }
};

function ParentSettings() {
  const { logout } = useAuth();
  const [me, setMe] = useState(null);
  const [adding, setAdding] = useState(false);
  const [child, setChild] = useState({ name: '', birthdate: '' });
  const [error, setError] = useState('');

  const load = async () => {
    const response = await fetchWithAuth('/api/parent/me');
    if (response.ok) setMe(await response.json());
  };

  useEffect(() => {
    load();
  }, []);

  const addChild = async (e) => {
    e.preventDefault();
    setError('');

    if (!child.name.trim() || !child.birthdate) {
      setError('아이 이름과 생년월일을 입력해주세요.');
      return;
    }

    const response = await fetchWithAuth('/api/parent/children', {
      method: 'POST',
      body: JSON.stringify({ children: [{ name: child.name.trim(), birthdate: child.birthdate }] })
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error || '추가에 실패했어요.');
      return;
    }

    setChild({ name: '', birthdate: '' });
    setAdding(false);
    load();
  };

  return (
    <ParentLayout title="내 정보" subtitle={me ? `카카오 · ${me.user.username}` : ''}>
      <div className="card" style={{ padding: '16px', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-gray-500)', marginBottom: '10px' }}>내 아이</h3>

        {(me?.children || []).length === 0 && (
          <div style={{ fontSize: '0.875rem', color: 'var(--color-gray-500)', padding: '10px 0' }}>
            아직 등록한 아이가 없어요.
          </div>
        )}

        {(me?.children || []).map((c) => {
          const status = STATUS[c.status] || STATUS.pending;
          return (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0',
              borderTop: '1px solid var(--color-gray-100)'
            }}>
              <div style={{
                width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
                background: 'var(--color-primary-bg)', color: 'var(--color-primary)', fontWeight: 800,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {c.childName.slice(0, 1)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{c.childName}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)' }}>
                  {c.childBirthdate}{c.studentName ? ` · ${c.studentName}` : ''}
                </div>
              </div>
              <span className={`badge ${status.className}`}>{status.label}</span>
            </div>
          );
        })}

        {(me?.children || []).some((c) => c.status !== 'linked') && (
          <div style={{
            marginTop: '10px', background: 'var(--color-gray-100)', color: 'var(--color-gray-600)',
            padding: '10px 12px', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', lineHeight: 1.55
          }}>
            확인 대기 중인 아이는 선생님이 학생 명단과 연결하면 신청할 수 있어요.
            이름·생년월일이 다르면 선생님께 말씀해 주세요.
          </div>
        )}

        {adding ? (
          <form onSubmit={addChild} style={{ marginTop: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input
                type="text" value={child.name} maxLength={20} placeholder="아이 이름" aria-label="아이 이름"
                onChange={(e) => setChild((p) => ({ ...p, name: e.target.value }))}
                style={{ padding: '12px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius-md)', fontSize: '16px' }}
              />
              <input
                type="date" value={child.birthdate} aria-label="생년월일"
                onChange={(e) => setChild((p) => ({ ...p, birthdate: e.target.value }))}
                style={{ padding: '12px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius-md)', fontSize: '16px' }}
              />
            </div>
            {error && (
              <div role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', marginTop: '8px' }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>추가</button>
              <button type="button" className="btn btn-outline" onClick={() => { setAdding(false); setError(''); }}>취소</button>
            </div>
          </form>
        ) : (
          <button className="btn btn-outline" style={{ width: '100%', marginTop: '12px' }} onClick={() => setAdding(true)}>
            + 아이 추가
          </button>
        )}
      </div>

      <ChildFaceCard children={me?.children || []} onChanged={load} />

      {me?.teacher && (
        <div className="card" style={{ padding: '16px', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-gray-500)', marginBottom: '10px' }}>선생님</h3>
          <div style={{ fontWeight: 700 }}>{me.teacher.name} 선생님</div>
        </div>
      )}

      <button className="btn btn-outline" style={{ width: '100%' }} onClick={logout}>로그아웃</button>

      <p style={{ fontSize: '0.6875rem', color: 'var(--color-gray-400)', lineHeight: 1.6, marginTop: '14px', textAlign: 'center' }}>
        아이 정보 수정·삭제는 선생님께 문의해 주세요.
      </p>
    </ParentLayout>
  );
}

export default ParentSettings;
