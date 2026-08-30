import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import ParentList from '../Parents/ParentList';
import { userLabel } from '../../utils/userName';

/**
 * 관리자 대시보드의 학부모 화면.
 * 선생님을 고르면 그 선생님의 학부모만, 전체를 고르면 모든 학부모를 본다.
 */
function AdminParents() {
  const [teachers, setTeachers] = useState([]);
  const [selected, setSelected] = useState('all');

  useEffect(() => {
    fetchWithAuth('/api/auth/users')
      .then((r) => (r.ok ? r.json() : []))
      .then((users) => setTeachers(users.filter((u) => u.role === 'user')))
      .catch(() => {});
  }, []);

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2>학부모</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-gray-500)', marginTop: '4px' }}>
            가입한 학부모와 학생 연결 상태를 봅니다. 선생님별로 걸러 볼 수 있어요.
          </p>
        </div>
        <span style={{ flex: 1 }} />
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          aria-label="선생님 선택"
          style={{
            padding: '10px 12px', border: '1px solid var(--color-gray-300)',
            borderRadius: 'var(--radius-md)', fontSize: '0.9375rem', background: '#fff'
          }}
        >
          <option value="all">전체 선생님</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{userLabel(t)}</option>
          ))}
        </select>
      </div>

      <ParentList key={selected} filterUserId={selected} embedded />
    </div>
  );
}

export default AdminParents;
