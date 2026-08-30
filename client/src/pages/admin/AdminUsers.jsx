import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchWithAuth } from '../../utils/api';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { homePathFor } from '../../utils/roleRoutes';
import { hardNavigate } from '../../utils/navigation';

/* 한 카카오 계정이 역할마다 계정을 가질 수 있어(docs/accounts-roles FR-310),
   목록에 세 역할이 모두 섞여 나온다. 예전에는 학부모가 "일반 사용자" 로 보였다. */
const ROLE_BADGE = {
  admin: { label: '관리자', className: 'badge-primary' },
  user: { label: '선생님', className: 'badge-success' },
  parent: { label: '학부모', className: 'badge-warning' }
};

function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState({ username: '', password: '', role: 'user' });
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile();
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const { user, refreshUser, impersonate } = useAuth();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await fetchWithAuth('/api/auth/users');
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error('사용자 목록 로드 실패:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isEditing || saving) return;

    const username = formData.username.trim();
    if (!username) {
      setFormError('사용자 이름을 입력해주세요.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const response = await fetchWithAuth(`/api/auth/users/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, username })
      });

      const data = await response.json();

      // 실패하면 입력값을 지우지 않고 이유를 보여준다.
      if (!response.ok) {
        setFormError(data.error || '사용자 정보 저장에 실패했습니다.');
        return;
      }

      await loadUsers();

      // 내 이름을 바꿨다면 헤더 등에 남아 있는 예전 이름도 갱신한다.
      if (user && editId === user.id) {
        await refreshUser();
      }

      handleCancel();
      alert('사용자 정보가 수정되었습니다.');
    } catch (error) {
      console.error('사용자 저장 실패:', error);
      setFormError('사용자 정보 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (targetUser) => {
    setFormData({
      username: targetUser.username,
      password: '',
      role: targetUser.role
    });
    setIsEditing(true);
    setEditId(targetUser.id);
    setFormError('');
  };

  /** 같은 카카오 계정이 가진 다른 역할 계정 (docs/accounts-roles FR-383) */
  const otherAccountsOf = (target) =>
    target.kakaoId ? users.filter((u) => u.kakaoId === target.kakaoId && u.id !== target.id) : [];

  /** 이 카카오 계정에 이미 관리자 행이 있는가 */
  const hasAdminAccount = (target) =>
    Boolean(target.kakaoId) && users.some((u) => u.kakaoId === target.kakaoId && u.role === 'admin');

  /**
   * 같은 카카오 계정에 관리자 계정을 하나 더 만든다 (FR-382).
   * 역할 편집(승격)과 달리 기존 선생님 계정과 그 학생·수업이 그대로 남는다.
   */
  const handleGrantAdmin = async (target) => {
    if (!confirm(`${target.username} 님에게 관리자 계정을 추가할까요?\n기존 계정과 데이터는 그대로 유지됩니다.`)) return;

    try {
      const response = await fetchWithAuth(`/api/auth/users/${target.id}/grant-admin`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || '관리자 계정을 추가할 수 없습니다.');
        return;
      }
      await loadUsers();
      alert(`관리자 계정 ${data.user.username} 을(를) 만들었습니다.`);
    } catch (error) {
      console.error('관리자 계정 부여 실패:', error);
      alert('관리자 계정 추가에 실패했습니다.');
    }
  };

  /**
   * 이 계정으로 로그인 (FR-388). 돌아올 관리자 세션은 AuthContext 가 챙기고,
   * 화면은 전체 새로고침으로 그 역할의 시작 화면을 연다.
   */
  const handleImpersonate = async (target) => {
    const label = ROLE_BADGE[target.role]?.label || target.role;
    if (!confirm(`${target.username} (${label}) 계정으로 로그인할까요?\n화면 위 배너의 [관리자로 돌아가기]로 언제든 돌아올 수 있습니다.`)) return;

    try {
      const data = await impersonate(target.id);
      hardNavigate(homePathFor(data.role));
    } catch (error) {
      console.error('다른 계정으로 로그인 실패:', error);
      alert(error.message || '해당 계정으로 로그인할 수 없습니다.');
    }
  };

  const handleDelete = async (id) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      try {
        const response = await fetchWithAuth(`/api/auth/users/${id}`, {
          method: 'DELETE'
        });
        if (response.ok) {
          await loadUsers();
          alert('사용자가 삭제되었습니다.');
        }
      } catch (error) {
        console.error('사용자 삭제 실패:', error);
        alert('사용자 삭제에 실패했습니다.');
      }
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditId(null);
    setFormData({ username: '', password: '', role: 'user' });
    setFormError('');
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  };

  const handleToggleKakaoConsent = async (targetUserId, currentConsent) => {
    try {
      const response = await fetchWithAuth('/api/auth/kakao/consent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consent: !currentConsent,
          targetUserId: targetUserId
        })
      });

      if (response.ok) {
        await loadUsers();
        alert(!currentConsent ? '카카오톡 알림이 활성화되었습니다.' : '카카오톡 알림이 비활성화되었습니다.');
      } else {
        const data = await response.json();
        alert(data.error || '알림 설정 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('알림 설정 변경 실패:', error);
      alert('알림 설정 변경에 실패했습니다.');
    }
  };

  const handleTransfer = async () => {
    if (!transferFrom || !transferTo) {
      alert('이전할 사용자와 대상 사용자를 모두 선택해주세요.');
      return;
    }

    if (transferFrom === transferTo) {
      alert('같은 사용자에게 데이터를 이전할 수 없습니다.');
      return;
    }

    const fromUser = users.find(u => u.id === parseInt(transferFrom));
    const toUser = users.find(u => u.id === parseInt(transferTo));

    if (!confirm(`"${fromUser?.username}"의 모든 데이터를 "${toUser?.username}"에게 이전하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }

    setTransferLoading(true);
    try {
      const response = await fetchWithAuth('/api/auth/users/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: parseInt(transferFrom),
          toUserId: parseInt(transferTo)
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert(`데이터 이전이 완료되었습니다.\n\n이전된 항목:\n- 학생: ${data.transferred.students}명\n- 수업: ${data.transferred.classes}개\n- 출석: ${data.transferred.attendance}건\n- 대회: ${data.transferred.competitions}개`);
        setShowTransferModal(false);
        setTransferFrom('');
        setTransferTo('');
      } else {
        alert(data.error || '데이터 이전에 실패했습니다.');
      }
    } catch (error) {
      console.error('데이터 이전 실패:', error);
      alert('데이터 이전에 실패했습니다.');
    } finally {
      setTransferLoading(false);
    }
  };

  return (
    <div className="animate-fadeIn">
      {/* Page Header */}
      <div className="page-header">
        <h2 className="page-title">사용자 관리</h2>
        <button
          className="btn btn-secondary"
          onClick={() => setShowTransferModal(true)}
        >
          데이터 이전
        </button>
      </div>

      {/* Edit Form Card */}
      {isEditing && (
        <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div className="card-header">
            <h3 className="card-title">사용자 수정</h3>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleCancel}
            >
              취소
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
              gap: 'var(--spacing-lg)',
              marginTop: 'var(--spacing-lg)'
            }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">사용자 이름</label>
                <input
                  type="text"
                  placeholder="사용자 이름"
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  required
                  maxLength={30}
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">새 비밀번호</label>
                <input
                  type="password"
                  placeholder="변경시에만 입력"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">역할</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                  /* 학부모 행은 소속·자녀 연결이 걸려 있어 역할을 바꿀 수 없다 (FR-384) */
                  disabled={formData.role === 'parent'}
                >
                  {formData.role === 'parent' && <option value="parent">학부모</option>}
                  <option value="user">선생님</option>
                  <option value="admin">관리자</option>
                </select>
                {formData.role !== 'parent' && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', lineHeight: 1.5, marginTop: '6px' }}>
                    선생님을 관리자로 <b>승격</b>하면 선생님 계정이 사라집니다.
                    대신 목록의 <b>[관리자 계정 추가]</b>로 관리자 계정을 따로 만들 수 있어요.
                  </p>
                )}
              </div>
            </div>

            {formError && (
              <div
                role="alert"
                style={{
                  marginTop: 'var(--spacing-lg)',
                  color: 'var(--color-danger)',
                  fontSize: '0.875rem'
                }}
              >
                {formError}
              </div>
            )}

            <div style={{
              display: 'flex',
              gap: 'var(--spacing-md)',
              marginTop: 'var(--spacing-xl)',
              paddingTop: 'var(--spacing-xl)',
              borderTop: '1px solid var(--color-gray-200)'
            }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? '저장 중...' : '수정 완료'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCancel}
              >
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      {/* User List Card */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            사용자 목록
            <span className="badge badge-primary" style={{ marginLeft: '8px' }}>
              {users.length}명
            </span>
          </h3>
        </div>

        {users.length > 0 ? (
          <>
            {/* Desktop Table */}
            {!isMobile && (
              <div className="table-container" style={{ marginTop: 'var(--spacing-lg)' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>ID</th>
                      <th>사용자 이름</th>
                      <th>이메일</th>
                      <th>역할</th>
                      <th>카카오 알림</th>
                      <th>가입일</th>
                      <th style={{ width: '260px' }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        <td>
                          <span style={{ color: 'var(--color-gray-500)' }}>#{u.id}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                            <span style={{ fontWeight: 600, color: 'var(--color-gray-900)' }}>
                              {u.username}
                            </span>
                            {u.kakaoId && (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 20,
                                height: 20,
                                backgroundColor: '#FEE500',
                                borderRadius: '4px',
                                fontSize: '0.75rem'
                              }} title="카카오 계정">
                                💬
                              </span>
                            )}
                          </div>
                          {otherAccountsOf(u).length > 0 && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                              같은 카카오 계정: {otherAccountsOf(u).map((o) => ROLE_BADGE[o.role]?.label || o.role).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td>
                          <span style={{ color: 'var(--color-gray-600)', fontSize: '0.875rem' }}>
                            {u.email || '-'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${ROLE_BADGE[u.role]?.className || 'badge-gray'}`}>
                            {ROLE_BADGE[u.role]?.label || u.role}
                          </span>
                        </td>
                        <td>
                          {u.kakaoId ? (
                            <label style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              cursor: 'pointer'
                            }}>
                              <input
                                type="checkbox"
                                checked={u.kakaoMessageConsent || false}
                                onChange={() => handleToggleKakaoConsent(u.id, u.kakaoMessageConsent)}
                                style={{ marginRight: '6px' }}
                              />
                              <span style={{ fontSize: '0.8125rem', color: u.kakaoMessageConsent ? 'var(--color-success)' : 'var(--color-gray-500)' }}>
                                {u.kakaoMessageConsent ? '활성' : '비활성'}
                              </span>
                            </label>
                          ) : (
                            <span style={{ color: 'var(--color-gray-400)', fontSize: '0.8125rem' }}>-</span>
                          )}
                        </td>
                        <td>
                          <span style={{ color: 'var(--color-gray-600)' }}>
                            {formatDate(u.createdAt)}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleEdit(u)}
                            >
                              수정
                            </button>
                            {/* 그 사용자가 보는 화면을 그대로 본다 — 지금 로그인한 계정은 제외 (FR-388) */}
                            {u.id !== user?.id && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleImpersonate(u)}
                                title="이 사용자의 화면을 그대로 봅니다. 배너에서 관리자로 돌아올 수 있어요."
                              >
                                이 계정으로 로그인
                              </button>
                            )}
                            {/* 같은 카카오 계정에 관리자 행을 따로 만든다 (승격과 달리 기존 계정이 남는다) */}
                            {u.kakaoId && !hasAdminAccount(u) && (
                              <button className="btn btn-primary btn-sm" onClick={() => handleGrantAdmin(u)}>
                                관리자 계정 추가
                              </button>
                            )}
                            {u.kakaoId && hasAdminAccount(u) && u.role !== 'admin' && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-gray-400)', alignSelf: 'center' }}>
                                관리자 계정 있음
                              </span>
                            )}
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDelete(u.id)}
                              /* 관리자가 1명이라 자기 자신을 지우면 아무도 관리할 수 없다 */
                              disabled={u.id === user?.id}
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Mobile Cards */}
            {isMobile && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacing-md)',
                marginTop: 'var(--spacing-lg)'
              }}>
                {users.map(u => (
                  <div
                    key={u.id}
                    className="list-item"
                    style={{
                      borderLeft: `4px solid ${u.role === 'admin' ? 'var(--color-primary)' : 'var(--color-gray-300)'}`,
                      marginBottom: 0
                    }}
                  >
                    <div className="list-item-content">
                      <div className="list-item-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {u.username}
                        {u.kakaoId && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 18,
                            height: 18,
                            backgroundColor: '#FEE500',
                            borderRadius: '4px',
                            fontSize: '0.625rem'
                          }}>
                            💬
                          </span>
                        )}
                        <span className={`badge ${ROLE_BADGE[u.role]?.className || 'badge-gray'}`} style={{ marginLeft: '4px' }}>
                          {ROLE_BADGE[u.role]?.label || u.role}
                        </span>
                      </div>
                      <div className="list-item-subtitle">
                        #{u.id} | {u.email || '이메일 없음'} | {formatDate(u.createdAt)}
                      </div>
                      {u.kakaoId && (
                        <div style={{ marginTop: '8px' }}>
                          <label style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            cursor: 'pointer',
                            fontSize: '0.8125rem'
                          }}>
                            <input
                              type="checkbox"
                              checked={u.kakaoMessageConsent || false}
                              onChange={() => handleToggleKakaoConsent(u.id, u.kakaoMessageConsent)}
                              style={{ marginRight: '6px' }}
                            />
                            <span style={{ color: u.kakaoMessageConsent ? 'var(--color-success)' : 'var(--color-gray-500)' }}>
                              카카오 알림 {u.kakaoMessageConsent ? '활성' : '비활성'}
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleEdit(u)}
                      >
                        수정
                      </button>
                      {u.id !== user?.id && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleImpersonate(u)}
                        >
                          이 계정으로 로그인
                        </button>
                      )}
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(u.id)}
                        disabled={u.id === user?.id}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">👤</div>
            <div className="empty-state-title">등록된 사용자가 없습니다</div>
            <div className="empty-state-description">사용자가 등록되면 여기에 표시됩니다.</div>
          </div>
        )}
      </div>

      {/* Transfer Modal */}
      {showTransferModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--spacing-lg)'
          }}
          onClick={() => setShowTransferModal(false)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '480px',
              maxHeight: '90vh',
              overflow: 'auto'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="card-header">
              <h3 className="card-title">데이터 이전</h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowTransferModal(false)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 'var(--spacing-lg)' }}>
              <p style={{
                color: 'var(--color-gray-600)',
                fontSize: '0.9375rem',
                marginBottom: 'var(--spacing-xl)',
                lineHeight: 1.6
              }}>
                한 사용자의 모든 데이터(학생, 수업, 출석, 대회)를 다른 사용자에게 이전합니다.
                <br />
                <strong style={{ color: 'var(--color-danger)' }}>이 작업은 되돌릴 수 없습니다.</strong>
              </p>

              <div className="form-group">
                <label className="form-label">데이터를 가져올 사용자 (From)</label>
                <select
                  value={transferFrom}
                  onChange={(e) => setTransferFrom(e.target.value)}
                >
                  <option value="">선택하세요</option>
                  {/* 학부모는 학생·수업을 갖지 않으므로 이전 대상이 아니다 */}
                  {users.filter(u => u.role !== 'parent').map(u => (
                    <option key={u.id} value={u.id}>
                      {u.username} (#{u.id})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'center',
                margin: 'var(--spacing-md) 0',
                color: 'var(--color-gray-400)'
              }}>
                ↓
              </div>

              <div className="form-group">
                <label className="form-label">데이터를 받을 사용자 (To)</label>
                <select
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                >
                  <option value="">선택하세요</option>
                  {/* 받는 쪽은 선생님만 — 데이터의 실제 소유자가 되어야 한다 */}
                  {users.filter(u => u.role === 'user' && u.id !== parseInt(transferFrom)).map(u => (
                    <option key={u.id} value={u.id}>
                      {u.username} (#{u.id})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{
                display: 'flex',
                gap: 'var(--spacing-md)',
                marginTop: 'var(--spacing-xl)',
                paddingTop: 'var(--spacing-lg)',
                borderTop: '1px solid var(--color-gray-200)'
              }}>
                <button
                  className="btn btn-primary"
                  onClick={handleTransfer}
                  disabled={transferLoading || !transferFrom || !transferTo}
                  style={{ flex: 1 }}
                >
                  {transferLoading ? '이전 중...' : '데이터 이전'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowTransferModal(false)}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminUsers;
