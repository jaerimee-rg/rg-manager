import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import FaqChats from '../Faq/FaqChats';
import FaqFiles from '../Faq/FaqFiles';
import RichText from '../../components/common/RichText';

function AdminFaq() {
  const [users, setUsers] = useState([]);
  const [filterUserId, setFilterUserId] = useState('all');
  const [faqs, setFaqs] = useState([]);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    loadFaqs();
  }, [filterUserId]);

  const loadUsers = async () => {
    try {
      const response = await fetchWithAuth('/api/auth/users');
      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('사용자 목록 로드 실패:', error);
    }
  };

  const loadFaqs = async () => {
    try {
      const query = filterUserId !== 'all' ? `?filterUserId=${filterUserId}` : '';
      const response = await fetchWithAuth(`/api/faqs${query}`);
      const data = await response.json();
      setFaqs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('FAQ 목록 로드 실패:', error);
    }
  };

  const userName = (userId) => users.find((u) => u.id === userId)?.username || `사용자 ${userId}`;

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <h2 className="page-title">FAQ</h2>
      </div>

      <div className="card">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">사용자</label>
          <select value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)}>
            <option value="all">전체 사용자</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">대화 내역</h3>
        </div>
        <FaqChats filterUserId={filterUserId} />
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">파일</h3>
        </div>
        <FaqFiles filterUserId={filterUserId} userName={userName} />
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            FAQ 목록
            <span className="badge badge-primary" style={{ marginLeft: 8 }}>{faqs.length}개</span>
          </h3>
        </div>

        {faqs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">등록된 FAQ가 없습니다</div>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '120px' }}>사용자</th>
                  <th>질문 / 답변</th>
                  <th style={{ width: '90px' }}>공개</th>
                </tr>
              </thead>
              <tbody>
                {faqs.map((faq) => (
                  <tr key={faq.id}>
                    <td>{userName(faq.userId)}</td>
                    <td>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{faq.question}</div>
                      <div className="faq-answer-preview"><RichText text={faq.answer} /></div>
                    </td>
                    <td>
                      <span className={`badge ${faq.isPublished ? 'badge-success' : 'badge-gray'}`}>
                        {faq.isPublished ? '공개' : '비공개'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

export default AdminFaq;
