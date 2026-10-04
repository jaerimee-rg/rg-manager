import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useMediaQuery';

function CompetitionList({ basePath = '/competitions' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [competitions, setCompetitions] = useState([]);
  const [participantCounts, setParticipantCounts] = useState({});
  const isMobile = useIsMobile();
  const [swipedId, setSwipedId] = useState(null);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [swipeOffset, setSwipeOffset] = useState({});

  useEffect(() => {
    loadCompetitions();
  }, []);

  const loadCompetitions = async () => {
    try {
      const response = await fetchWithAuth('/api/competitions');
      const data = await response.json();
      setCompetitions(data);

      // Load participant counts for each competition
      const counts = {};
      await Promise.all(
        data.map(async (comp) => {
          const res = await fetchWithAuth(`/api/competitions/${comp.id}/student-ids`);
          const studentIds = await res.json();
          counts[comp.id] = studentIds.length;
        })
      );
      setParticipantCounts(counts);
    } catch (error) {
      console.error('Failed to load competitions:', error);
    }
  };

  const deleteCompetition = async (id) => {
    if (confirm('이 대회를 삭제하시겠습니까?')) {
      try {
        const response = await fetchWithAuth(`/api/competitions/${id}`, {
          method: 'DELETE'
        });
        if (response.ok) {
          setSwipedId(null);
          setSwipeOffset({});
          loadCompetitions();
        }
      } catch (error) {
        console.error('Failed to delete competition:', error);
        alert('대회 삭제에 실패했습니다.');
      }
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const isUpcoming = (dateString) => {
    if (!dateString) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const competitionDate = new Date(dateString);
    return competitionDate >= today;
  };

  const handleManageStudents = (competition) => {
    navigate(`${basePath}/manage`, { state: { competition } });
  };

  const handleEdit = (competition) => {
    navigate(`${basePath}/edit`, { state: { competition } });
  };

  // Swipe handlers
  const minSwipeDistance = 50;
  const swipeRevealWidth = 124;

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
      setSwipeOffset({ [id]: Math.min(diff, swipeRevealWidth) });
    } else if (swipedId === id) {
      setSwipeOffset({ [id]: Math.max(swipeRevealWidth + diff, 0) });
    }
  };

  const handleTouchEnd = (id) => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      setSwipedId(id);
      setSwipeOffset({ [id]: swipeRevealWidth });
    } else if (isRightSwipe || distance < minSwipeDistance) {
      setSwipedId(null);
      setSwipeOffset({});
    }
  };

  const handleCardClick = (competition) => {
    if (swipedId === competition.id) {
      setSwipedId(null);
      setSwipeOffset({});
    } else if (!swipedId) {
      handleManageStudents(competition);
    }
  };

  return (
    <div className="animate-fadeIn">
      {/* Page Header */}
      <div className="page-header">
        <h2 className="page-title">
          대회 관리
          <span className="badge badge-primary" style={{ marginLeft: '8px' }}>
            {competitions.length}개
          </span>
        </h2>
        <button
          className="btn btn-primary"
          onClick={() => navigate(`${basePath}/new`)}
        >
          + 대회 등록
        </button>
      </div>

      {/* Competition List Card */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            대회 목록
          </h3>
        </div>

        {/* Desktop View - Table */}
        {!isMobile && competitions.length > 0 && (
          <div className="table-container" style={{ marginTop: 'var(--spacing-lg)' }}>
            <table>
              <thead>
                <tr>
                  <th>대회명</th>
                  <th>날짜</th>
                  <th>장소</th>
                  <th style={{ textAlign: 'center' }}>참가 학생</th>
                                    <th style={{ width: '220px' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {competitions.map((competition) => (
                  <tr key={competition.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-gray-900)' }}>
                          {competition.name}
                        </span>
                        {isUpcoming(competition.date) && (
                          <span className="badge badge-success">예정</span>
                        )}
                      </div>
                    </td>
                    <td>{formatDate(competition.date)}</td>
                    <td>{competition.location}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-primary">
                        {participantCounts[competition.id] || 0}명
                      </span>
                    </td>
                                        <td>
                      <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleEdit(competition)}
                        >
                          수정
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleManageStudents(competition)}
                        >
                          참가 학생
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => deleteCompetition(competition.id)}
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

        {/* Mobile View - Swipeable */}
        {isMobile && competitions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'var(--spacing-lg)' }}>
            {competitions.map((competition) => (
              <div key={competition.id} className="swipeable-container">
                <div className="swipeable-actions" style={{ gap: 'var(--spacing-xs)' }}>
                  <button
                    className="swipeable-action-btn"
                    style={{ backgroundColor: 'var(--color-gray-500)', color: 'var(--paper)' }}
                    onClick={() => handleEdit(competition)}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                  <button
                    className="swipeable-action-btn delete"
                    onClick={() => deleteCompetition(competition.id)}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
                <div
                  className="swipeable-card"
                  style={{
                    transform: `translateX(-${swipeOffset[competition.id] || 0}px)`
                  }}
                  onTouchStart={(e) => handleTouchStart(e, competition.id)}
                  onTouchMove={(e) => handleTouchMove(e, competition.id)}
                  onTouchEnd={() => handleTouchEnd(competition.id)}
                  onClick={() => handleCardClick(competition)}
                >
                  <div className="toss-card-item-content">
                    <div className="toss-list-item-icon" style={{
                      backgroundColor: isUpcoming(competition.date)
                        ? 'var(--color-primary-bg)'
                        : 'var(--color-gray-100)'
                    }}>
                      🏆
                    </div>
                    <div className="toss-list-item-content">
                      <div className="toss-list-item-title">
                        {competition.name}
                        {isUpcoming(competition.date) && (
                          <span className="badge badge-success" style={{ marginLeft: '6px', fontSize: '0.6875rem' }}>
                            예정
                          </span>
                        )}
                      </div>
                      <div className="toss-list-item-subtitle">
                        {formatDate(competition.date)}
                      </div>
                      <div className="toss-list-item-subtitle">
                        {competition.location}
                      </div>
                    </div>
                    <div className="toss-list-item-value">
                      <div className="toss-list-item-value-main" style={{ color: 'var(--color-primary)' }}>
                        {participantCounts[competition.id] || 0}명
                      </div>
                      <div className="toss-list-item-value-sub">
                        참가 학생
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {competitions.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🏆</div>
            <div className="empty-state-title">등록된 대회가 없습니다</div>
            <div className="empty-state-description">
              새 대회를 등록하여 참가 학생을 관리해보세요.
            </div>
            <button
              className="btn btn-primary"
              onClick={() => navigate(`${basePath}/new`)}
              style={{ marginTop: 'var(--spacing-lg)' }}
            >
              + 대회 등록
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CompetitionList;
