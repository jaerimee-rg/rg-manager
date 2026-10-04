import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { matchKoreanSearch } from '../../utils/koreanSearch';
import { calculateAge } from '../../utils/dateHelpers';
import { useIsMobile } from '../../hooks/useMediaQuery';

function ClassStudentManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const classItem = location.state?.classItem;

  const [students, setStudents] = useState([]);
  const isMobile = useIsMobile();
  const [enrolledSearch, setEnrolledSearch] = useState('');
  const [availableSearch, setAvailableSearch] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);

    if (!classItem) {
      navigate('/classes');
      return;
    }

    loadStudents();
  }, []);

  const loadStudents = async () => {
    try {
      const response = await fetchWithAuth('/api/students');
      const data = await response.json();
      setStudents(data);
    } catch (error) {
      console.error('학생 목록 로드 실패:', error);
    }
  };

  const getStudentsInClass = () => {
    if (!classItem) return [];
    let filtered = students.filter(student =>
      student.classIds && student.classIds.includes(classItem.id)
    );
    if (enrolledSearch) {
      filtered = filtered.filter(s =>
        matchKoreanSearch(enrolledSearch, s.name)
      );
    }
    return filtered;
  };

  const getStudentsNotInClass = () => {
    if (!classItem) return [];
    let filtered = students.filter(student =>
      !student.classIds || !student.classIds.includes(classItem.id)
    );
    if (availableSearch) {
      filtered = filtered.filter(s =>
        matchKoreanSearch(availableSearch, s.name)
      );
    }
    return filtered;
  };

  const getEnrolledCount = () => {
    if (!classItem) return 0;
    return students.filter(student =>
      student.classIds && student.classIds.includes(classItem.id)
    ).length;
  };

  const getAvailableCount = () => {
    if (!classItem) return 0;
    return students.filter(student =>
      !student.classIds || !student.classIds.includes(classItem.id)
    ).length;
  };

  const addStudentToClass = async (studentId) => {
    try {
      const student = students.find(s => s.id === studentId);
      const updatedClassIds = [...(student.classIds || []), classItem.id];
      const response = await fetchWithAuth(`/api/students/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...student, classIds: updatedClassIds })
      });
      if (response.ok) {
        await loadStudents();
      }
    } catch (error) {
      console.error('학생 등록 실패:', error);
      alert('학생 등록에 실패했습니다.');
    }
  };

  const removeStudentFromClass = async (studentId) => {
    if (confirm('이 학생을 수업에서 제외하시겠습니까?')) {
      try {
        const student = students.find(s => s.id === studentId);
        const updatedClassIds = (student.classIds || []).filter(id => id !== classItem.id);
        const response = await fetchWithAuth(`/api/students/${studentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...student, classIds: updatedClassIds })
        });
        if (response.ok) {
          await loadStudents();
        }
      } catch (error) {
        console.error('학생 제외 실패:', error);
        alert('학생 제외에 실패했습니다.');
      }
    }
  };

  if (!classItem) {
    return null;
  }

  const studentsInClass = getStudentsInClass();
  const studentsNotInClass = getStudentsNotInClass();

  return (
    <div className="animate-fadeIn">
      {/* Page Header */}
      <div className="page-header">
        <h2 className="page-title page-title--sub">{classItem.name} - 학생 관리</h2>
        <button
          className="btn btn-secondary"
          onClick={() => navigate('/classes')}
        >
          목록으로
        </button>
      </div>

      {/* Class Info Card */}
      <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="info-box" style={{ margin: 0 }}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--spacing-lg)',
            fontSize: '0.9375rem'
          }}>
            <div>
              <span style={{ color: 'var(--color-gray-500)' }}>수업 시간</span>
              <span style={{ marginLeft: 'var(--spacing-sm)', fontWeight: 600 }}>{classItem.schedule}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-gray-500)' }}>시간</span>
              <span style={{ marginLeft: 'var(--spacing-sm)', fontWeight: 600 }}>{classItem.duration}</span>
            </div>
            {classItem.instructor && (
              <div>
                <span style={{ color: 'var(--color-gray-500)' }}>강사</span>
                <span style={{ marginLeft: 'var(--spacing-sm)', fontWeight: 600 }}>{classItem.instructor}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Student Lists Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: 'var(--spacing-lg)'
      }}>
        {/* Enrolled Students */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              등록된 학생
              <span className="badge badge-success" style={{ marginLeft: '8px' }}>
                {getEnrolledCount()}명
              </span>
            </h3>
          </div>

          {/* Search Input */}
          <div style={{ marginTop: 'var(--spacing-md)', position: 'relative' }}>
            <input
              type="text"
              placeholder="이름으로 검색"
              value={enrolledSearch}
              onChange={(e) => setEnrolledSearch(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              style={{ paddingRight: enrolledSearch ? '36px' : undefined }}
            />
            {enrolledSearch && (
              <button
                type="button"
                onClick={() => setEnrolledSearch('')}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'var(--color-gray-300)',
                  border: 'none',
                  borderRadius: 'var(--shape-blob)',
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: 'var(--paper)',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            )}
          </div>

          {studentsInClass.length > 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-sm)',
              marginTop: 'var(--spacing-lg)'
            }}>
              {studentsInClass.map(student => (
                <div
                  key={student.id}
                  className="list-item"
                  style={{
                    borderLeft: '4px solid var(--color-success)',
                    marginBottom: 0
                  }}
                >
                  <div className="list-item-content">
                    <div className="list-item-title">{student.name}</div>
                    <div className="list-item-subtitle">
                      {student.birthdate} ({calculateAge(student.birthdate)}세)
                    </div>
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => removeStudentFromClass(student.id)}
                  >
                    제외
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 'var(--spacing-2xl) var(--spacing-lg)' }}>
              {enrolledSearch ? (
                <>
                  <div className="empty-state-icon">🔍</div>
                  <div className="empty-state-title">검색 결과가 없습니다</div>
                  <div className="empty-state-description">다른 이름으로 검색해보세요.</div>
                </>
              ) : (
                <>
                  <div className="empty-state-icon">👥</div>
                  <div className="empty-state-title">등록된 학생이 없습니다</div>
                  <div className="empty-state-description">{isMobile ? '아래에서' : '오른쪽에서'} 학생을 등록해주세요.</div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Available Students */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              등록 가능한 학생
              <span className="badge badge-primary" style={{ marginLeft: '8px' }}>
                {getAvailableCount()}명
              </span>
            </h3>
          </div>

          {/* Search Input */}
          <div style={{ marginTop: 'var(--spacing-md)', position: 'relative' }}>
            <input
              type="text"
              placeholder="이름으로 검색"
              value={availableSearch}
              onChange={(e) => setAvailableSearch(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              style={{ paddingRight: availableSearch ? '36px' : undefined }}
            />
            {availableSearch && (
              <button
                type="button"
                onClick={() => setAvailableSearch('')}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'var(--color-gray-300)',
                  border: 'none',
                  borderRadius: 'var(--shape-blob)',
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: 'var(--paper)',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            )}
          </div>

          {studentsNotInClass.length > 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-sm)',
              marginTop: 'var(--spacing-lg)'
            }}>
              {studentsNotInClass.map(student => (
                <div
                  key={student.id}
                  className="list-item"
                  style={{
                    borderLeft: '4px solid var(--color-gray-300)',
                    marginBottom: 0
                  }}
                >
                  <div className="list-item-content">
                    <div className="list-item-title">{student.name}</div>
                    <div className="list-item-subtitle">
                      {student.birthdate} ({calculateAge(student.birthdate)}세)
                    </div>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => addStudentToClass(student.id)}
                  >
                    등록
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 'var(--spacing-2xl) var(--spacing-lg)' }}>
              {availableSearch ? (
                <>
                  <div className="empty-state-icon">🔍</div>
                  <div className="empty-state-title">검색 결과가 없습니다</div>
                  <div className="empty-state-description">다른 이름으로 검색해보세요.</div>
                </>
              ) : (
                <>
                  <div className="empty-state-icon">✓</div>
                  <div className="empty-state-title">모든 학생이 등록되어 있습니다</div>
                  <div className="empty-state-description">등록 가능한 학생이 없습니다.</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ClassStudentManagement;
