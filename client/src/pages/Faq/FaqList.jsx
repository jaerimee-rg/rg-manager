import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { matchKoreanSearch } from '../../utils/koreanSearch';
import { copyToClipboard } from '../../utils/copyToClipboard';
import FaqFormModal from '../../components/Faq/FaqFormModal';
import ChannelSettingsModal from '../../components/Faq/ChannelSettingsModal';
import FaqChats from './FaqChats';

const SWIPE_REVEAL_WIDTH = 124;
const MIN_SWIPE_DISTANCE = 50;

function FaqList({ initialTab = 'faq', basePath = '/faq' }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [tab, setTab] = useState(initialTab);
  const [faqs, setFaqs] = useState([]);
  const [channel, setChannel] = useState(null);
  const [search, setSearch] = useState('');
  const [unansweredCount, setUnansweredCount] = useState(0);
  const [toast, setToast] = useState('');

  const [editingFaq, setEditingFaq] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 모바일 스와이프 (기존 수업 목록과 동일한 패턴)
  const [swipedId, setSwipedId] = useState(null);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [swipeOffset, setSwipeOffset] = useState({});

  useEffect(() => {
    window.scrollTo(0, 0);
    loadFaqs();
    loadChannel();
    loadUnansweredCount();
  }, []);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const loadFaqs = async () => {
    try {
      const response = await fetchWithAuth('/api/faqs');
      const data = await response.json();
      setFaqs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('FAQ 목록 로드 실패:', error);
    }
  };

  const loadChannel = async () => {
    try {
      const response = await fetchWithAuth('/api/chat/channel');
      const data = await response.json();
      setChannel(data);
    } catch (error) {
      console.error('채팅 채널 로드 실패:', error);
    }
  };

  const loadUnansweredCount = async () => {
    try {
      const response = await fetchWithAuth('/api/chat/sessions?unansweredOnly=true&limit=1');
      const data = await response.json();
      setUnansweredCount(data.total || 0);
    } catch (error) {
      console.error('미답변 수 로드 실패:', error);
    }
  };

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 1800);
  };

  const chatUrl = channel ? `${window.location.origin}/chat/${channel.publicId}` : '';

  const handleShare = async () => {
    if (!channel) return;
    const ok = await copyToClipboard(chatUrl);
    showToast(ok ? '학부모 질문 링크가 복사되었습니다' : '복사에 실패했습니다');
  };

  const handleSaveFaq = async (payload) => {
    try {
      const url = editingFaq ? `/api/faqs/${editingFaq.id}` : '/api/faqs';
      const response = await fetchWithAuth(url, {
        method: editingFaq ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });

      if (!response.ok) return false;

      setFormOpen(false);
      setEditingFaq(null);
      await loadFaqs();
      await loadChannel();
      showToast(editingFaq ? 'FAQ가 수정되었습니다' : 'FAQ가 등록되었습니다');
      return true;
    } catch (error) {
      console.error('FAQ 저장 실패:', error);
      return false;
    }
  };

  const handleSaveChannel = async (payload) => {
    try {
      const response = await fetchWithAuth('/api/chat/channel', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      if (!response.ok) return false;

      const data = await response.json();
      setChannel({ ...data, faqCount: channel?.faqCount });
      setSettingsOpen(false);
      showToast('채널 설정이 저장되었습니다');
      return true;
    } catch (error) {
      console.error('채널 설정 저장 실패:', error);
      return false;
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const response = await fetchWithAuth(`/api/faqs/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setSwipedId(null);
        setSwipeOffset({});
        await loadFaqs();
        await loadChannel();
        showToast('FAQ가 삭제되었습니다');
      }
    } catch (error) {
      console.error('FAQ 삭제 실패:', error);
    }
  };

  const openEdit = (faq) => {
    setEditingFaq(faq);
    setFormOpen(true);
    setSwipedId(null);
    setSwipeOffset({});
  };

  const handleTouchStart = (e, id) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    if (swipedId && swipedId !== id) {
      setSwipedId(null);
      setSwipeOffset({});
    }
  };

  const handleTouchMove = (e, id) => {
    const currentTouch = e.targetTouches[0].clientX;
    setTouchEnd(currentTouch);
    const diff = touchStart - currentTouch;
    if (diff > 0) {
      setSwipeOffset({ [id]: Math.min(diff, SWIPE_REVEAL_WIDTH) });
    } else if (swipedId === id) {
      setSwipeOffset({ [id]: Math.max(SWIPE_REVEAL_WIDTH + diff, 0) });
    }
  };

  const handleTouchEnd = (id) => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;

    if (distance > MIN_SWIPE_DISTANCE) {
      setSwipedId(id);
      setSwipeOffset({ [id]: SWIPE_REVEAL_WIDTH });
    } else {
      setSwipedId(null);
      setSwipeOffset({});
    }
  };

  const handleCardClick = (id) => {
    if (swipedId === id) {
      setSwipedId(null);
      setSwipeOffset({});
    }
  };

  const changeTab = (next) => {
    setTab(next);
    navigate(next === 'faq' ? basePath : `${basePath}/chats`);
  };

  const filteredFaqs = search.trim()
    ? faqs.filter(
        (f) =>
          matchKoreanSearch(search, f.question) ||
          matchKoreanSearch(search, f.answer) ||
          f.question.includes(search) ||
          f.answer.includes(search)
      )
    : faqs;

  return (
    <div className="animate-fadeIn">
      {/* 페이지 헤더 — 우측 공유/설정 아이콘 */}
      <div className="faq-page-head">
        <div>
          <h2 className="page-title" style={{ marginBottom: 4 }}>FAQ</h2>
          <div className="faq-page-desc">
            자주 묻는 질문을 등록하면 학부모가 링크로 접속해 AI 답변을 받을 수 있습니다.
          </div>
        </div>
        <div className="faq-page-actions">
          <button
            className="faq-icon-btn"
            onClick={handleShare}
            title="학부모 질문 링크 복사"
            aria-label="학부모 질문 링크 복사"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
          </button>
          <button
            className="faq-icon-btn"
            onClick={() => setSettingsOpen(true)}
            title="채팅 채널 설정"
            aria-label="채팅 채널 설정"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        </div>
      </div>

      {channel && !channel.isActive && (
        <div className="faq-inactive-notice">
          현재 질문 접수가 중단되어 있습니다. 설정에서 다시 켤 수 있습니다.
        </div>
      )}

      {channel && channel.isActive && channel.aiEnabled === false && (
        <div className="faq-inactive-notice">
          AI 자동 답변이 꺼져 있습니다. 접수된 질문은 대화 내역에서 직접 답변해 주세요.
        </div>
      )}

      {/* 탭 */}
      <div className="faq-tabs">
        <button className={tab === 'faq' ? 'on' : ''} onClick={() => changeTab('faq')}>
          FAQ 관리
        </button>
        <button className={tab === 'chats' ? 'on' : ''} onClick={() => changeTab('chats')}>
          대화 내역
          {unansweredCount > 0 && (
            <span className="badge badge-danger" style={{ marginLeft: 6 }}>{unansweredCount}</span>
          )}
        </button>
      </div>

      {tab === 'chats' ? (
        <FaqChats onCountChange={setUnansweredCount} />
      ) : (
        <>
          <div className="faq-toolbar">
            <input
              type="text"
              className="faq-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="질문 검색 (초성 검색 가능)"
            />
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingFaq(null);
                setFormOpen(true);
              }}
            >
              + FAQ 등록
            </button>
          </div>

          {filteredFaqs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">💬</div>
              <div className="empty-state-title">
                {faqs.length === 0 ? '등록된 FAQ가 없습니다' : '검색 결과가 없습니다'}
              </div>
              <div className="empty-state-description">
                {faqs.length === 0
                  ? 'FAQ를 등록하면 학부모 질문에 AI가 답변할 수 있습니다.'
                  : '다른 검색어로 시도해 보세요.'}
              </div>
            </div>
          ) : !isMobile ? (
            <div className="card">
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>질문 / 답변</th>
                      <th style={{ width: '90px' }}>공개</th>
                      <th style={{ width: '150px' }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFaqs.map((faq) => (
                      <tr key={faq.id}>
                        <td>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>{faq.question}</div>
                          <div className="faq-answer-preview">{faq.answer}</div>
                        </td>
                        <td>
                          <span className={`badge ${faq.isPublished ? 'badge-success' : 'badge-gray'}`}>
                            {faq.isPublished ? '공개' : '비공개'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(faq)}>
                              수정
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(faq.id)}>
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div>
              <div className="faq-swipe-hint">← 카드를 왼쪽으로 밀면 수정·삭제가 나옵니다</div>
              {filteredFaqs.map((faq) => (
                <div key={faq.id} className="swipeable-container">
                  <div className="swipeable-actions" style={{ gap: 'var(--spacing-xs)' }}>
                    <button
                      className="swipeable-action-btn"
                      style={{ backgroundColor: 'var(--color-gray-600)', color: 'white' }}
                      onClick={() => openEdit(faq)}
                      aria-label="수정"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                    </button>
                    <button
                      className="swipeable-action-btn delete"
                      onClick={() => handleDelete(faq.id)}
                      aria-label="삭제"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                  <div
                    className="swipeable-card faq-card"
                    style={{ transform: `translateX(-${swipeOffset[faq.id] || 0}px)` }}
                    onTouchStart={(e) => handleTouchStart(e, faq.id)}
                    onTouchMove={(e) => handleTouchMove(e, faq.id)}
                    onTouchEnd={() => handleTouchEnd(faq.id)}
                    onClick={() => handleCardClick(faq.id)}
                  >
                    <span className={`badge ${faq.isPublished ? 'badge-success' : 'badge-gray'}`}>
                      {faq.isPublished ? '공개' : '비공개'}
                    </span>
                    <div className="faq-card-question">{faq.question}</div>
                    <div className="faq-answer-preview">{faq.answer}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {formOpen && (
        <FaqFormModal
          faq={editingFaq}
          onClose={() => {
            setFormOpen(false);
            setEditingFaq(null);
          }}
          onSaved={handleSaveFaq}
        />
      )}

      {settingsOpen && channel && (
        <ChannelSettingsModal
          channel={channel}
          onClose={() => setSettingsOpen(false)}
          onSaved={handleSaveChannel}
        />
      )}

      {toast && <div className="faq-toast">{toast}</div>}
    </div>
  );
}

export default FaqList;
