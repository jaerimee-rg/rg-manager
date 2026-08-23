import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import DateRangePicker from '../../components/common/DateRangePicker';
import { useIsMobile } from '../../hooks/useMediaQuery';
import AdminLlmLogs from './AdminLlmLogs';

function AdminLogs() {
  const formatDateOnly = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getThisMonthRange = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start: formatDateOnly(firstDay),
      end: formatDateOnly(lastDay),
      startDate: firstDay,
      endDate: lastDay
    };
  };

  const thisMonth = getThisMonthRange();
  const [logs, setLogs] = useState([]);
  const [allLogs, setAllLogs] = useState([]);
  const [startDate, setStartDate] = useState(thisMonth.start);
  const [endDate, setEndDate] = useState(thisMonth.end);
  const [tab, setTab] = useState('activity');
  const [users, setUsers] = useState([]);
  const isMobile = useIsMobile();

  useEffect(() => {
    loadLogs();
    loadUsers();
  }, []);

  // AI 호출 이력의 강사 필터에 쓴다.
  const loadUsers = async () => {
    try {
      const response = await fetchWithAuth('/api/auth/users');
      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('사용자 목록 로드 실패:', error);
    }
  };

  useEffect(() => {
    filterLogs();
  }, [startDate, endDate, allLogs]);

  const loadLogs = async () => {
    try {
      const response = await fetchWithAuth('/api/logs');
      const data = await response.json();
      setAllLogs(data);
    } catch (error) {
      console.error('로그 로드 실패:', error);
    }
  };

  const filterLogs = () => {
    const filtered = allLogs.filter(log => {
      const logDate = log.createdAt.split('T')[0];
      return logDate >= startDate && logDate <= endDate;
    });
    setLogs(filtered);
  };

  const getActionText = (action) => {
    const actionMap = {
      'LOGIN': '로그인',
      'SIGNUP': '회원가입',
      'CREATE_STUDENT': '학생 생성',
      'UPDATE_STUDENT': '학생 수정',
      'DELETE_STUDENT': '학생 삭제',
      'CREATE_CLASS': '수업 생성',
      'UPDATE_CLASS': '수업 수정',
      'DELETE_CLASS': '수업 삭제',
      'REORDER_CLASSES': '수업 순서 변경',
      'CREATE_ATTENDANCE': '출석 체크',
      'DELETE_ATTENDANCE': '출석 삭제',
      'DELETE_ATTENDANCE_BULK': '출석 일괄 삭제',
      'UPDATE_USER': '사용자 수정',
      'DELETE_USER': '사용자 삭제'
    };
    return actionMap[action] || action;
  };

  const getActionBadgeClass = (action) => {
    if (action.includes('DELETE')) return 'badge-danger';
    if (action.includes('CREATE') || action === 'SIGNUP') return 'badge-success';
    if (action.includes('UPDATE') || action === 'REORDER_CLASSES') return 'badge-warning';
    return 'badge-gray';
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`;
  };

  return (
    <div className="animate-fadeIn">
      {/* Page Header */}
      <div className="page-header">
        <h2 className="page-title">로그</h2>
      </div>

      <div className="faq-tabs">
        <button className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}>
          활동 로그
        </button>
        <button className={tab === 'llm' ? 'on' : ''} onClick={() => setTab('llm')}>
          AI 호출 로그
        </button>
      </div>

      {tab === 'llm' ? (
        <div className="card">
          <AdminLlmLogs users={users} />
        </div>
      ) : (
      <>

      {/* Filter Card */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">조회 기간</h3>
          {(startDate !== getThisMonthRange().start || endDate !== getThisMonthRange().end) && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const thisMonth = getThisMonthRange();
                setStartDate(thisMonth.start);
                setEndDate(thisMonth.end);
              }}
            >
              초기화
            </button>
          )}
        </div>

        <div style={{ marginTop: 'var(--spacing-lg)' }}>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onDateChange={(newStartDate, newEndDate) => {
              setStartDate(newStartDate);
              setEndDate(newEndDate);
            }}
            isMobile={isMobile}
            label=""
          />
        </div>
      </div>

      {/* Logs Card */}
      <div className="card" style={{ marginTop: 'var(--spacing-lg)' }}>
        <div className="card-header">
          <h3 className="card-title">
            로그 목록
            <span className="badge badge-primary" style={{ marginLeft: '8px' }}>
              {logs.length}개
            </span>
          </h3>
        </div>

        {logs.length > 0 ? (
          <>
            {/* Desktop Table */}
            {!isMobile && (
              <div className="table-container" style={{ marginTop: 'var(--spacing-lg)' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '180px' }}>시간</th>
                      <th style={{ width: '120px' }}>사용자</th>
                      <th style={{ width: '140px' }}>작업</th>
                      <th>상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id}>
                        <td>
                          <span style={{ color: 'var(--color-gray-600)', fontSize: '0.875rem' }}>
                            {formatDate(log.createdAt)}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{log.username}</span>
                        </td>
                        <td>
                          <span className={`badge ${getActionBadgeClass(log.action)}`}>
                            {getActionText(log.action)}
                          </span>
                        </td>
                        <td>
                          <span style={{ color: 'var(--color-gray-600)' }}>
                            {log.details || '-'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Mobile Cards - Toss Style with Date Grouping */}
            {isMobile && (
              <div style={{ marginTop: 'var(--spacing-lg)' }}>
                {(() => {
                  const groupedByDate = logs.reduce((acc, log) => {
                    const date = log.createdAt.split('T')[0];
                    if (!acc[date]) acc[date] = [];
                    acc[date].push(log);
                    return acc;
                  }, {});

                  const getActionIcon = (action) => {
                    if (action.includes('DELETE')) return '🗑️';
                    if (action.includes('CREATE') || action === 'SIGNUP') return '✨';
                    if (action.includes('UPDATE') || action === 'REORDER_CLASSES') return '✏️';
                    if (action === 'LOGIN') return '🔐';
                    return '📋';
                  };

                  const getIconClass = (action) => {
                    if (action.includes('DELETE')) return 'danger';
                    if (action.includes('CREATE') || action === 'SIGNUP') return 'success';
                    if (action.includes('UPDATE') || action === 'REORDER_CLASSES') return 'warning';
                    return 'gray';
                  };

                  const formatDateHeader = (dateStr) => {
                    const date = new Date(dateStr);
                    const month = date.getMonth() + 1;
                    const day = date.getDate();
                    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
                    return `${month}월 ${day}일 (${weekdays[date.getDay()]})`;
                  };

                  const formatTime = (dateStr) => {
                    const date = new Date(dateStr);
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    return `${hours}:${minutes}`;
                  };

                  return Object.entries(groupedByDate).map(([date, dateLogs]) => (
                    <div key={date} className="toss-list" style={{ marginBottom: 'var(--spacing-md)' }}>
                      <div className="toss-list-header">
                        {formatDateHeader(date)}
                      </div>
                      {dateLogs.map(log => (
                        <div
                          key={log.id}
                          className="toss-list-item"
                          style={{ cursor: 'default' }}
                        >
                          <div className={`toss-list-item-icon ${getIconClass(log.action)}`}>
                            {getActionIcon(log.action)}
                          </div>
                          <div className="toss-list-item-content">
                            <div className="toss-list-item-title">
                              {getActionText(log.action)}
                            </div>
                            <div className="toss-list-item-subtitle">
                              {formatTime(log.createdAt)} · {log.username}
                            </div>
                          </div>
                          {log.details && (
                            <div className="toss-list-item-value">
                              <div className="toss-list-item-value-sub" style={{
                                maxWidth: '120px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {log.details}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ));
                })()}
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">로그가 없습니다</div>
            <div className="empty-state-description">선택한 기간에 해당하는 로그가 없습니다.</div>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}

export default AdminLogs;
