import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { useIsMobile } from '../../hooks/useMediaQuery';

const MESSAGE_TYPES = {
  ATTENDANCE: { label: '출석 알림', badge: 'badge-primary' },
  FAQ_INQUIRY: { label: '문의 알림', badge: 'badge-success' },
  CUSTOM: { label: '직접 발송', badge: 'badge-gray' }
};

const messageTypeLabel = (type) => MESSAGE_TYPES[type]?.label || '커스텀';
const messageTypeBadge = (type) => MESSAGE_TYPES[type]?.badge || 'badge-gray';

function AdminNotifications() {
  const [logs, setLogs] = useState([]);
  const [kakaoUsers, setKakaoUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendForm, setSendForm] = useState({ recipientId: '', message: '' });
  const [sendLoading, setSendLoading] = useState(false);
  const [settings, setSettings] = useState([]);
  const [savingEvent, setSavingEvent] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  // 유형 필터가 바뀌면 목록만 다시 불러온다.
  useEffect(() => {
    loadLogs(typeFilter);
  }, [typeFilter]);

  const loadLogs = async (filter = typeFilter) => {
    try {
      const query = filter && filter !== 'all' ? `?eventType=${filter}` : '';
      const response = await fetchWithAuth(`/api/notifications/logs${query}`);
      const data = await response.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('알림 목록 로드 실패:', error);
    }
  };

  const loadData = async () => {
    try {
      const [usersRes, settingsRes] = await Promise.all([
        fetchWithAuth('/api/auth/kakao/users'),
        fetchWithAuth('/api/notifications/settings')
      ]);

      const usersData = await usersRes.json();
      const settingsData = await settingsRes.json();

      setKakaoUsers(usersData || []);
      setSettings(Array.isArray(settingsData) ? settingsData : []);
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEvent = async (eventType, enabled) => {
    setSavingEvent(eventType);
    try {
      const response = await fetchWithAuth(`/api/notifications/settings/${eventType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });

      const data = await response.json();

      if (response.ok) {
        setSettings(data);
      } else {
        alert(data.error || '알림 설정 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('알림 설정 변경 실패:', error);
      alert('알림 설정 변경에 실패했습니다.');
    } finally {
      setSavingEvent(null);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}.${month}.${day} ${hours}:${minutes}`;
  };

  const handleSendMessage = async () => {
    if (!sendForm.recipientId || !sendForm.message.trim()) {
      alert('수신자와 메시지를 입력해주세요.');
      return;
    }

    setSendLoading(true);
    try {
      const response = await fetchWithAuth('/api/auth/kakao/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: parseInt(sendForm.recipientId),
          message: sendForm.message
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert('메시지가 전송되었습니다.');
        setShowSendModal(false);
        setSendForm({ recipientId: '', message: '' });
        loadLogs();
      } else {
        alert(data.error || '메시지 전송에 실패했습니다.');
      }
    } catch (error) {
      console.error('메시지 전송 실패:', error);
      alert('메시지 전송에 실패했습니다.');
    } finally {
      setSendLoading(false);
    }
  };

  return (
    <div className="animate-fadeIn">
      {/* Page Header */}
      <div className="page-header">
        <h2 className="page-title">알림</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowSendModal(true)}
        >
          + 메시지 보내기
        </button>
      </div>

      {/* Send Message Modal */}
      {showSendModal && (
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
          onClick={() => setShowSendModal(false)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '500px',
              maxHeight: '90vh',
              overflow: 'auto'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="card-header">
              <h3 className="card-title">카카오톡 메시지 보내기</h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowSendModal(false)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 'var(--spacing-lg)' }}>
              <div className="form-group">
                <label className="form-label">수신자 *</label>
                <select
                  value={sendForm.recipientId}
                  onChange={(e) => setSendForm({ ...sendForm, recipientId: e.target.value })}
                >
                  <option value="">카카오 사용자를 선택하세요</option>
                  {kakaoUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.username} ({u.email || '이메일 없음'})
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '4px' }}>
                  * 카카오로 로그인한 사용자에게만 메시지를 보낼 수 있습니다.
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">메시지 *</label>
                <textarea
                  value={sendForm.message}
                  onChange={(e) => setSendForm({ ...sendForm, message: e.target.value })}
                  placeholder="메시지 내용을 입력하세요"
                  rows={5}
                  style={{
                    width: '100%',
                    padding: 'var(--spacing-md)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-gray-300)',
                    resize: 'vertical'
                  }}
                />
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
                  onClick={handleSendMessage}
                  disabled={sendLoading}
                  style={{ flex: 1 }}
                >
                  {sendLoading ? '전송 중...' : '메시지 전송'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowSendModal(false)}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 이벤트별 알림 on/off */}
      <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="card-header">
          <h3 className="card-title">알림 이벤트</h3>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-gray-500)' }}>
            끄면 모든 사용자에게 발송되지 않습니다
          </span>
        </div>

        <div style={{ marginTop: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
          {settings.map((setting) => (
            <div key={setting.eventType} className="notif-event">
              <div className="notif-event-text">
                <div className="notif-event-label">
                  {setting.label}
                  {!setting.enabled && (
                    <span className="badge badge-gray" style={{ marginLeft: 8 }}>
                      꺼짐
                    </span>
                  )}
                </div>
                <div className="notif-event-desc">{setting.description}</div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={setting.enabled}
                aria-label={setting.label}
                className={`notif-toggle ${setting.enabled ? 'on' : ''}`}
                disabled={savingEvent === setting.eventType}
                onClick={() => handleToggleEvent(setting.eventType, !setting.enabled)}
              >
                <span className="notif-toggle-knob" />
              </button>
            </div>
          ))}

          {settings.length === 0 && !loading && (
            <div style={{ color: 'var(--color-gray-500)', fontSize: '0.875rem' }}>
              알림 설정을 불러오지 못했습니다.
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)',
          gap: 'var(--spacing-lg)'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-primary)' }}>
              {total}
            </div>
            <div style={{ color: 'var(--color-gray-500)', fontSize: '0.875rem' }}>전체 알림</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-success)' }}>
              {logs.filter(l => l.success).length}
            </div>
            <div style={{ color: 'var(--color-gray-500)', fontSize: '0.875rem' }}>성공</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-danger)' }}>
              {logs.filter(l => !l.success).length}
            </div>
            <div style={{ color: 'var(--color-gray-500)', fontSize: '0.875rem' }}>실패</div>
          </div>
        </div>
      </div>

      {/* Message Logs */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            알림 목록
            <span className="badge badge-primary" style={{ marginLeft: '8px' }}>
              {logs.length}건
            </span>
          </h3>
          <select
            aria-label="알림 유형 필터"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ width: 'auto', minWidth: 140 }}
          >
            <option value="all">전체 유형</option>
            {settings.map((setting) => (
              <option key={setting.eventType} value={setting.eventType}>
                {setting.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
            로딩 중...
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔔</div>
            <div className="empty-state-title">알림이 없습니다</div>
            <div className="empty-state-description">카카오톡 메시지가 전송되면 여기에 기록됩니다.</div>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            {!isMobile && (
              <div className="table-container" style={{ marginTop: 'var(--spacing-lg)' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '140px' }}>일시</th>
                      <th>유형</th>
                      <th>발신자</th>
                      <th>수신자</th>
                      <th>상태</th>
                      <th>내용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id}>
                        <td>
                          <span style={{ fontSize: '0.8125rem', color: 'var(--color-gray-600)' }}>
                            {formatDate(log.createdAt)}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${messageTypeBadge(log.messageType)}`}>
                            {messageTypeLabel(log.messageType)}
                          </span>
                        </td>
                        <td>{log.senderName || '-'}</td>
                        <td>
                          <div>
                            <div style={{ fontWeight: 500 }}>{log.recipientName || '-'}</div>
                            {log.recipientEmail && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)' }}>
                                {log.recipientEmail}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          {log.success ? (
                            <span className="badge badge-success">성공</span>
                          ) : (
                            <span className="badge badge-danger" title={log.errorMessage}>
                              실패
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: '0.8125rem',
                            color: 'var(--color-gray-600)'
                          }} title={log.messageContent}>
                            {log.messageContent}
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
                {logs.map(log => (
                  <div
                    key={log.id}
                    className="list-item"
                    style={{
                      borderLeft: `4px solid ${log.success ? 'var(--color-success)' : 'var(--color-danger)'}`,
                      marginBottom: 0
                    }}
                  >
                    <div className="list-item-content" style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span className={`badge ${messageTypeBadge(log.messageType)}`}>
                          {messageTypeLabel(log.messageType)}
                        </span>
                        {log.success ? (
                          <span className="badge badge-success">성공</span>
                        ) : (
                          <span className="badge badge-danger">실패</span>
                        )}
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--color-gray-900)' }}>
                        {log.recipientName || '-'}
                        {log.recipientEmail && (
                          <span style={{ fontWeight: 400, fontSize: '0.8125rem', color: 'var(--color-gray-500)', marginLeft: '8px' }}>
                            {log.recipientEmail}
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: '0.8125rem',
                        color: 'var(--color-gray-600)',
                        marginTop: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}>
                        {log.messageContent}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-400)', marginTop: '8px' }}>
                        {formatDate(log.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AdminNotifications;
