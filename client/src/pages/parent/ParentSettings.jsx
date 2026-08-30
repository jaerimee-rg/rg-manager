import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import ParentLayout from '../../components/parent/ParentLayout';
import ChildFaceCard from './ChildFaceCard';
import RoleSwitcher from '../../components/common/RoleSwitcher';

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
  // 아이를 어느 선생님 학생으로 등록할지 (선생님이 여럿일 때만 고른다)
  const [childTeacherId, setChildTeacherId] = useState('');
  const [addingTeacher, setAddingTeacher] = useState(false);
  const [invite, setInvite] = useState('');
  const [teacherError, setTeacherError] = useState('');
  const [teacherNotice, setTeacherNotice] = useState('');

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

    const teachers = me?.teachers || [];
    const teacherId = teachers.length === 1 ? teachers[0].id : childTeacherId;

    if (teachers.length > 1 && !teacherId) {
      setError('어느 선생님의 아이인지 선택해 주세요.');
      return;
    }

    const response = await fetchWithAuth('/api/parent/children', {
      method: 'POST',
      body: JSON.stringify({
        teacherId: teacherId || undefined,
        children: [{ name: child.name.trim(), birthdate: child.birthdate }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error || '추가에 실패했어요.');
      return;
    }

    setChild({ name: '', birthdate: '' });
    setChildTeacherId('');
    setAdding(false);
    load();
  };

  /**
   * 초대 링크를 붙여넣어 선생님을 추가한다 (docs/accounts-roles FR-353).
   * 링크가 있어야만 연결되므로 학부모가 스스로 해도 권한이 늘지 않는다.
   */
  const addTeacher = async (e) => {
    e.preventDefault();
    setTeacherError('');
    setTeacherNotice('');

    if (!invite.trim()) {
      setTeacherError('초대 링크를 입력해 주세요.');
      return;
    }

    const response = await fetchWithAuth('/api/parent/teachers', {
      method: 'POST',
      body: JSON.stringify({ invite: invite.trim() })
    });

    const data = await response.json();
    if (!response.ok) {
      setTeacherError(data.error || '연결에 실패했어요.');
      return;
    }

    setInvite('');
    setAddingTeacher(false);
    setTeacherNotice(data.alreadyLinked ? '이미 연결된 선생님이에요.' : '선생님을 연결했어요.');
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
                  {/* 선생님이 여럿이면 어느 학원 아이인지 알아야 한다 */}
                  {(me?.teachers || []).length > 1 && c.teacherName ? ` · ${c.teacherName} 선생님` : ''}
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
            {(me?.teachers || []).length > 1 && (
              <select
                value={childTeacherId}
                onChange={(e) => setChildTeacherId(e.target.value)}
                aria-label="선생님 선택"
                style={{
                  width: '100%', padding: '12px', marginBottom: '8px', fontSize: '16px',
                  fontFamily: 'inherit', background: '#fff',
                  border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius-md)'
                }}
              >
                <option value="">어느 선생님의 아이인가요?</option>
                {me.teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>{teacher.name} 선생님</option>
                ))}
              </select>
            )}
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

      <div className="card" style={{ padding: '16px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-gray-500)', margin: 0 }}>연결된 선생님</h3>
          {!addingTeacher && (
            <button className="btn btn-sm btn-outline" onClick={() => setAddingTeacher(true)}>＋ 선생님 추가</button>
          )}
        </div>

        {(me?.teachers || []).length === 0 ? (
          <div style={{
            background: 'var(--color-warning-bg)', color: '#7A5D00', padding: '10px 12px',
            borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', lineHeight: 1.55
          }}>
            연결된 선생님이 없어 일정을 볼 수 없어요.
            선생님께 받은 초대 링크로 연결해 주세요.
          </div>
        ) : (
          me.teachers.map((teacher) => (
            <div key={teacher.id} style={{
              padding: '10px 0', borderTop: '1px solid var(--color-gray-100)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'
            }}>
              <div style={{ fontWeight: 700 }}>{teacher.name} 선생님</div>
              {teacher.since && (
                <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-400)' }}>
                  {String(teacher.since).slice(0, 10)} 연결
                </div>
              )}
            </div>
          ))
        )}

        {addingTeacher && (
          <form onSubmit={addTeacher} style={{ marginTop: '10px' }}>
            <input
              type="text" value={invite} aria-label="초대 링크"
              placeholder="선생님께 받은 초대 링크"
              onChange={(e) => setInvite(e.target.value)}
              style={{ width: '100%', padding: '12px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius-md)', fontSize: '16px' }}
            />
            {teacherError && (
              <div role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', marginTop: '8px' }}>{teacherError}</div>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>연결하기</button>
              <button type="button" className="btn btn-outline" onClick={() => { setAddingTeacher(false); setTeacherError(''); }}>취소</button>
            </div>
          </form>
        )}

        {teacherNotice && (
          <div role="status" style={{ fontSize: '0.8125rem', color: 'var(--color-gray-500)', marginTop: '8px' }}>{teacherNotice}</div>
        )}

        <p style={{ fontSize: '0.6875rem', color: 'var(--color-gray-400)', lineHeight: 1.6, marginTop: '10px' }}>
          연결 해제는 선생님께 문의해 주세요.
        </p>
      </div>

      {/* 같은 카카오 계정의 선생님·관리자 화면으로 (docs/accounts-roles FR-322) */}
      <RoleSwitcher variant="card" />

      <button className="btn btn-outline" style={{ width: '100%' }} onClick={logout}>로그아웃</button>

      <p style={{ fontSize: '0.6875rem', color: 'var(--color-gray-400)', lineHeight: 1.6, marginTop: '14px', textAlign: 'center' }}>
        아이 정보 수정·삭제는 선생님께 문의해 주세요.
      </p>
    </ParentLayout>
  );
}

export default ParentSettings;
