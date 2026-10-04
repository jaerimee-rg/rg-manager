import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useMediaQuery';

function ClassForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const editClass = location.state?.classItem;

  const [formData, setFormData] = useState({ name: '', schedule: '', duration: '', instructor: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    window.scrollTo(0, 0);

    if (editClass) {
      setFormData({
        name: editClass.name,
        schedule: editClass.schedule,
        duration: editClass.duration,
        instructor: editClass.instructor
      });
      setIsEditing(true);
      setEditId(editClass.id);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEditing) {
        const response = await fetchWithAuth(`/api/classes/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        if (response.ok) {
          alert('수업 정보가 수정되었습니다.');
          navigate('/classes');
        }
      } else {
        const response = await fetchWithAuth('/api/classes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        if (response.ok) {
          alert('수업이 등록되었습니다.');
          navigate('/classes');
        }
      }
    } catch (error) {
      console.error('수업 저장 실패:', error);
      alert('수업 정보 저장에 실패했습니다.');
    }
  };

  return (
    <div className="animate-fadeIn">
      {/* Page Header */}
      <div className="page-header">
        <h2 className="page-title page-title--sub">{isEditing ? '수업 수정' : '새 수업 등록'}</h2>
        <button
          className="btn btn-secondary"
          onClick={() => navigate('/classes')}
        >
          목록으로
        </button>
      </div>

      {/* Form Card */}
      <div className="card" data-tutorial-action="class-form">
        <form onSubmit={handleSubmit}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 'var(--spacing-lg)'
          }}>
            <div className="form-group" style={{ marginBottom: 0 }} data-tutorial="class-name">
              <label className="form-label">수업명</label>
              <input
                type="text"
                placeholder="예: 초급반"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }} data-tutorial="class-schedule">
              <label className="form-label">수업 시간</label>
              <input
                type="text"
                placeholder="예: 화/목 14:00"
                value={formData.schedule}
                onChange={(e) => setFormData({...formData, schedule: e.target.value})}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }} data-tutorial="class-duration">
              <label className="form-label">수업 길이</label>
              <input
                type="text"
                placeholder="예: 90분"
                value={formData.duration}
                onChange={(e) => setFormData({...formData, duration: e.target.value})}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">강사명</label>
              <input
                type="text"
                placeholder="강사 이름 (선택)"
                value={formData.instructor}
                onChange={(e) => setFormData({...formData, instructor: e.target.value})}
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
            <button type="submit" className="btn btn-primary btn-lg" data-tutorial="class-submit">
              {isEditing ? '수정 완료' : '등록하기'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              onClick={() => navigate('/classes')}
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ClassForm;
