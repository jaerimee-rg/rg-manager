import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useMediaQuery';

function CompetitionForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const editCompetition = location.state?.competition;

  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const [formData, setFormData] = useState({ name: '', date: getTodayDate(), location: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    window.scrollTo(0, 0);

    if (editCompetition) {
      setFormData({
        name: editCompetition.name,
        date: editCompetition.date,
        location: editCompetition.location
      });
      setIsEditing(true);
      setEditId(editCompetition.id);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEditing) {
        const response = await fetchWithAuth(`/api/competitions/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        if (response.ok) {
          alert('대회 정보가 수정되었습니다.');
          navigate('/events');
        }
      } else {
        const response = await fetchWithAuth('/api/competitions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        if (response.ok) {
          alert('대회가 등록되었습니다.');
          navigate('/events');
        }
      }
    } catch (error) {
      console.error('대회 저장 실패:', error);
      alert('대회 정보 저장에 실패했습니다.');
    }
  };

  return (
    <div className="animate-fadeIn">
      {/* Page Header */}
      <div className="page-header">
        <h2 className="page-title">{isEditing ? '대회 수정' : '새 대회 등록'}</h2>
        <button
          className="btn btn-secondary"
          onClick={() => navigate('/events')}
        >
          목록으로
        </button>
      </div>

      {/* Form Card */}
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 'var(--spacing-lg)'
          }}>
            <div className="form-group" style={{ marginBottom: 0, gridColumn: isMobile ? '1' : '1 / -1' }}>
              <label className="form-label">대회명</label>
              <input
                type="text"
                placeholder="예: 2024 전국 리듬체조 대회"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">날짜</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
                required
                style={{ minHeight: '44px' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">장소</label>
              <input
                type="text"
                placeholder="예: 서울 올림픽공원 체조경기장"
                value={formData.location}
                onChange={(e) => setFormData({...formData, location: e.target.value})}
                required
              />
            </div>
          </div>

          {/* Actions */}
          <div style={{
            display: 'flex',
            gap: 'var(--spacing-md)',
            marginTop: 'var(--spacing-xl)',
            paddingTop: 'var(--spacing-xl)',
            borderTop: '1px solid var(--color-gray-200)'
          }}>
            <button type="submit" className="btn btn-primary btn-lg">
              {isEditing ? '수정 완료' : '등록하기'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              onClick={() => navigate('/events')}
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CompetitionForm;
