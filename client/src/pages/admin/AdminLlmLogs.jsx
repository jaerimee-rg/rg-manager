import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { useIsMobile } from '../../hooks/useMediaQuery';

const PAGE_SIZE = 50;

// status 는 aiAnswer.js 가 남기는 값이다.
const STATUS = {
  ok: { label: '성공', badge: 'badge-success' },
  ai_error: { label: '실패', badge: 'badge-danger' },
  no_faq: { label: 'FAQ 없음', badge: 'badge-gray' }
};

const statusLabel = (s) => STATUS[s]?.label || s || '-';
const statusBadge = (s) => STATUS[s]?.badge || 'badge-gray';

export const formatTimestamp = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export const formatMs = (ms) => {
  if (ms === null || ms === undefined) return '-';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

const num = (v) => (v === null || v === undefined ? '-' : v.toLocaleString());

function DetailModal({ log, onClose }) {
  if (!log) return null;

  const rows = [
    ['Model', log.model ? `${log.model}${log.provider ? ` (${log.provider})` : ''}` : '-'],
    ['System Prompt', log.systemPrompt],
    ['User Prompt', log.userPrompt],
    ['Response', log.response]
  ];

  return (
    <div className="llm-modal-backdrop" onClick={onClose}>
      <div
        className="card llm-modal"
        role="dialog"
        aria-modal="true"
        aria-label="AI 호출 상세"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header">
          <h3 className="card-title">AI 호출 상세</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="llm-modal-body">
          <div className="llm-detail-meta">
            <span>{formatTimestamp(log.createdAt)}</span>
            <span className={`badge ${statusBadge(log.status)}`}>{statusLabel(log.status)}</span>
            <span>{log.promptId || '-'}</span>
            <span>
              입력 {num(log.inputTokens)} · 출력 {num(log.outputTokens)} · {formatMs(log.latencyMs)}
            </span>
          </div>

          {log.errorMessage && (
            <div className="llm-detail-error" role="alert">
              {log.errorMessage}
            </div>
          )}

          {rows.map(([title, value]) => (
            <section key={title} className="llm-detail-section">
              <h4>{title}</h4>
              <pre>{value || '(없음)'}</pre>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminLlmLogs({ users = [] }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [userId, setUserId] = useState('all');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    loadLogs();
  }, [page, userId, status]);

  // 조건이 바뀌면 첫 쪽부터 다시 본다.
  useEffect(() => {
    setPage(0);
  }, [userId, status]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE)
      });
      if (userId !== 'all') params.set('userId', userId);
      if (status !== 'all') params.set('status', status);

      const response = await fetchWithAuth(`/api/logs/llm?${params}`);
      const data = await response.json();

      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('AI 호출 이력 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (id) => {
    try {
      const response = await fetchWithAuth(`/api/logs/llm/${id}`);
      const data = await response.json();
      if (response.ok) setDetail(data);
      else alert(data.error || '상세를 불러오지 못했습니다.');
    } catch (error) {
      console.error('AI 호출 상세 로드 실패:', error);
      alert('상세를 불러오지 못했습니다.');
    }
  };

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div>
      <div className="llm-log-toolbar">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="llm-user">강사</label>
          <select id="llm-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="all">전체</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="llm-status">Status</label>
          <select id="llm-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">전체</option>
            <option value="ok">성공</option>
            <option value="ai_error">실패</option>
            <option value="no_faq">FAQ 없음</option>
          </select>
        </div>
        <div className="llm-log-count">총 {total.toLocaleString()}건</div>
      </div>

      {loading ? (
        <div className="llm-log-list">
          <div className="skeleton" style={{ height: 48, borderRadius: 8 }}></div>
          <div className="skeleton" style={{ height: 48, borderRadius: 8 }}></div>
        </div>
      ) : logs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🤖</div>
          <div className="empty-state-title">AI 호출 이력이 없습니다</div>
          <div className="empty-state-description">
            학부모가 채팅으로 질문하면 여기에 기록됩니다.
          </div>
        </div>
      ) : isMobile ? (
        <div className="llm-log-list">
          {logs.map((log) => (
            <button key={log.id} className="llm-log-card" onClick={() => openDetail(log.id)}>
              <div className="llm-log-card-top">
                <span>{formatTimestamp(log.createdAt)}</span>
                <span className={`badge ${statusBadge(log.status)}`}>{statusLabel(log.status)}</span>
              </div>
              <div className="llm-log-card-mid">
                {log.instructorName || '-'} · {log.visitorName || '-'}
              </div>
              <div className="llm-log-card-sub">
                {log.promptId || '-'} · 입력 {num(log.inputTokens)} · 출력 {num(log.outputTokens)} ·{' '}
                {formatMs(log.latencyMs)}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="table-container">
          <table className="llm-log-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>강사</th>
                <th>학부모</th>
                <th>Prompt Identifier</th>
                <th>Status</th>
                <th className="num">Input token</th>
                <th className="num">Output token</th>
                <th className="num">Response time</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  onClick={() => openDetail(log.id)}
                  tabIndex={0}
                  role="button"
                  aria-label={`${formatTimestamp(log.createdAt)} 호출 상세 보기`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openDetail(log.id);
                    }
                  }}
                >
                  <td>{formatTimestamp(log.createdAt)}</td>
                  <td>{log.instructorName || '-'}</td>
                  <td>{log.visitorName || '-'}</td>
                  <td>{log.promptId || '-'}</td>
                  <td>
                    <span className={`badge ${statusBadge(log.status)}`}>
                      {statusLabel(log.status)}
                    </span>
                  </td>
                  <td className="num">{num(log.inputTokens)}</td>
                  <td className="num">{num(log.outputTokens)}</td>
                  <td className="num">{formatMs(log.latencyMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="llm-log-pager">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            이전
          </button>
          <span>
            {page + 1} / {lastPage + 1}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
            disabled={page >= lastPage}
          >
            다음
          </button>
        </div>
      )}

      <DetailModal log={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

export default AdminLlmLogs;
