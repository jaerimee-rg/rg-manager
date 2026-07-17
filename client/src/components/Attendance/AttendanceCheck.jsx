import React, { useState, useEffect, useMemo } from "react";
import { fetchWithAuth } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { matchKoreanSearch } from "../../utils/koreanSearch";
import { calculateAge } from "../../utils/dateHelpers";
import { useIsMobile } from "../../hooks/useMediaQuery";

function AttendanceCheck() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [checkedStudents, setCheckedStudents] = useState(new Set());
  const [hasChanges, setHasChanges] = useState(false);
  const isMobile = useIsMobile();

  // 보강 수업 추가 모달 상태
  const [showAddModal, setShowAddModal] = useState(false);
  const [addFormStudent, setAddFormStudent] = useState('');
  const [addFormClass, setAddFormClass] = useState('');
  const [addFormDate, setAddFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [studentSearchText, setStudentSearchText] = useState('');
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [dropdownTouchStartY, setDropdownTouchStartY] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    loadData();
  }, []);

  useEffect(() => {
    loadAttendance();
  }, [selectedDate, selectedClass]);

  const loadData = async () => {
    try {
      const [studentsRes, classesRes] = await Promise.all([
        fetchWithAuth("/api/students"),
        fetchWithAuth("/api/classes"),
      ]);
      const studentsData = await studentsRes.json();
      const classesData = await classesRes.json();
      setStudents(studentsData);
      setClasses(classesData);
    } catch (error) {
      console.error("데이터 로드 실패:", error);
    }
  };

  const loadAttendance = async () => {
    try {
      const response = await fetchWithAuth(`/api/attendance/date/${selectedDate}`);
      const allAttendance = await response.json();
      const filtered = allAttendance.filter(
        (a) => !selectedClass || a.classId === parseInt(selectedClass)
      );
      setCheckedStudents(new Set(filtered.map((a) => a.studentId)));
      setHasChanges(false);
    } catch (error) {
      console.error("출석 기록 로드 실패:", error);
      setCheckedStudents(new Set());
      setHasChanges(false);
    }
  };

  const toggleAttendance = (studentId) => {
    const newChecked = new Set(checkedStudents);
    if (newChecked.has(studentId)) {
      newChecked.delete(studentId);
    } else {
      newChecked.add(studentId);
    }
    setCheckedStudents(newChecked);
    setHasChanges(true);
  };

  const handleSubmit = async () => {
    if (!selectedClass) {
      alert("수업을 선택해주세요!");
      return;
    }

    try {
      // 새 bulk 엔드포인트 사용 (출석 저장 + 카카오 알림)
      const response = await fetchWithAuth("/api/attendance/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          classId: parseInt(selectedClass),
          studentIds: Array.from(checkedStudents),
          sendKakaoMessage: true, // 카카오 메시지 전송 시도
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || '출석 체크 중 오류가 발생했습니다.');
        }
        throw new Error('출석 체크 중 서버 오류가 발생했습니다.');
      }

      const result = await response.json();

      setHasChanges(false);

      let message = `출석 체크가 완료되었습니다! (${checkedStudents.size}명)`;
      if (result.kakaoMessage?.success) {
        message += '\n카카오톡 알림이 전송되었습니다.';
      }

      alert(message);
    } catch (error) {
      console.error("출석 체크 제출 실패:", error);
      alert(error.message || "출석 체크 제출에 실패했습니다.");
    }
  };

  const handleAddAttendance = async () => {
    if (!addFormStudent || !addFormClass || !addFormDate) {
      alert('학생, 수업, 날짜를 모두 선택해주세요.');
      return;
    }

    try {
      // 중복 체크
      const checkResponse = await fetchWithAuth(`/api/attendance/date/${addFormDate}`);
      const existingRecords = await checkResponse.json();

      const duplicate = existingRecords.find(
        r => r.studentId === parseInt(addFormStudent) &&
             r.classId === parseInt(addFormClass)
      );

      if (duplicate) {
        alert('이미 해당 날짜에 동일한 출석 기록이 있습니다.');
        return;
      }

      const response = await fetchWithAuth('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: parseInt(addFormStudent),
          classId: parseInt(addFormClass),
          date: addFormDate
        })
      });

      if (response.ok) {
        await loadAttendance();
        setShowAddModal(false);
        setAddFormStudent('');
        setAddFormClass('');
        setAddFormDate(new Date().toISOString().split('T')[0]);
        alert('보강 출석이 추가되었습니다.');
      }
    } catch (error) {
      console.error('출석 추가 실패:', error);
      alert('출석 추가에 실패했습니다.');
    }
  };

  const openAddModal = () => {
    setAddFormStudent('');
    setAddFormClass('');
    setAddFormDate(selectedDate);
    setStudentSearchText('');
    setShowStudentDropdown(false);
    setShowAddModal(true);
  };

  const getFilteredStudentsForModal = () => {
    if (!studentSearchText) return students;
    return students.filter(s =>
      matchKoreanSearch(studentSearchText, s.name)
    );
  };

  const getSelectedStudentName = () => {
    if (!addFormStudent) return '';
    const student = students.find(s => s.id === parseInt(addFormStudent));
    return student ? student.name : '';
  };

  const handleSelectStudent = (studentId) => {
    setAddFormStudent(studentId.toString());
    const student = students.find(s => s.id === studentId);
    setStudentSearchText(student ? student.name : '');
    setShowStudentDropdown(false);
  };

  const filteredStudents = useMemo(() => {
    if (!selectedClass) {
      return students;
    }
    return students.filter(
      (student) =>
        student.classIds && student.classIds.includes(parseInt(selectedClass))
    );
  }, [students, selectedClass]);

  // 현재 수업의 모든 학생이 출석 체크되어 있는지 여부
  const allChecked =
    filteredStudents.length > 0 &&
    filteredStudents.every((student) => checkedStudents.has(student.id));

  const toggleAllAttendance = () => {
    if (allChecked) {
      setCheckedStudents(new Set());
    } else {
      setCheckedStudents(new Set(filteredStudents.map((student) => student.id)));
    }
    setHasChanges(true);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekday = weekdays[date.getDay()];
    return `${month}월 ${day}일 (${weekday})`;
  };

  return (
    <div className="animate-fadeIn" data-tutorial-action="attendance-check">
      {/* Page Header */}
      <div className="page-header">
        <h2 className="page-title">출석 체크</h2>
        <button className="btn btn-primary" onClick={openAddModal}>
          + 보강 출석 추가
        </button>
      </div>

      {/* Add Attendance Modal */}
      {showAddModal && (
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
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '400px',
              maxHeight: '90vh',
              overflow: 'visible'
            }}
          >
            <div className="card-header">
              <h3 className="card-title">보강 출석 추가</h3>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: 'var(--color-gray-500)',
                  padding: '0',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>

            <div style={{ marginTop: 'var(--spacing-lg)', overflow: 'visible' }} onClick={() => setShowStudentDropdown(false)}>
              <div className="form-group">
                <label className="form-label">날짜 *</label>
                <input
                  type="date"
                  value={addFormDate}
                  onChange={(e) => setAddFormDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">수업 *</label>
                <select
                  value={addFormClass}
                  onChange={(e) => setAddFormClass(e.target.value)}
                >
                  <option value="">수업을 선택하세요</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                <label className="form-label">학생 *</label>
                <input
                  type="text"
                  placeholder="학생 이름을 검색하세요"
                  value={studentSearchText}
                  onChange={(e) => {
                    setStudentSearchText(e.target.value);
                    setAddFormStudent('');
                    setShowStudentDropdown(true);
                  }}
                  onFocus={() => setShowStudentDropdown(true)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
                {showStudentDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      maxHeight: '200px',
                      overflowY: 'auto',
                      backgroundColor: 'white',
                      border: '1px solid var(--color-gray-200)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                      zIndex: 9999,
                      WebkitOverflowScrolling: 'touch'
                    }}
                  >
                    {getFilteredStudentsForModal().length > 0 ? (
                      getFilteredStudentsForModal().map(s => (
                        <div
                          key={s.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectStudent(s.id);
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            setDropdownTouchStartY(e.touches[0].clientY);
                          }}
                          onTouchEnd={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const touchEndY = e.changedTouches[0].clientY;
                            const distance = Math.abs(touchEndY - dropdownTouchStartY);
                            // 10px 이상 이동했으면 스크롤로 판단하여 선택하지 않음
                            if (distance < 10) {
                              handleSelectStudent(s.id);
                            }
                          }}
                          style={{
                            padding: 'var(--spacing-md)',
                            cursor: 'pointer',
                            backgroundColor: addFormStudent === s.id.toString() ? 'var(--color-primary-bg)' : 'transparent',
                            borderBottom: '1px solid var(--color-gray-100)'
                          }}
                        >
                          <div style={{ fontWeight: 500, pointerEvents: 'none' }}>{s.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', pointerEvents: 'none' }}>
                            {s.birthdate || '-'} ({calculateAge(s.birthdate)}세)
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: 'var(--spacing-md)', color: 'var(--color-gray-500)', textAlign: 'center' }}>
                        검색 결과가 없습니다
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{
                display: 'flex',
                gap: 'var(--spacing-sm)',
                marginTop: 'var(--spacing-xl)'
              }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setShowAddModal(false)}
                >
                  취소
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={handleAddAttendance}
                >
                  추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Date & Class Selection */}
      <div className="card">
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: 'var(--spacing-lg)'
        }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">날짜</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">수업 선택</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
            >
              <option value="">수업을 선택하세요</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} - {c.schedule}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedClass && (
          <div className="info-box" style={{ marginTop: 'var(--spacing-lg)' }}>
            <div className="info-box-title">
              {(() => {
                const selectedClassData = classes.find(
                  (c) => c.id === parseInt(selectedClass)
                );
                return `${selectedClassData?.name} (${selectedClassData?.schedule}) - ${formatDate(selectedDate)}`;
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Attendance Content */}
      {!selectedClass ? (
        <div className="card" style={{ marginTop: 'var(--spacing-lg)' }}>
          <div className="empty-state">
            <div className="empty-state-icon">✓</div>
            <div className="empty-state-title">수업을 선택하세요</div>
            <div className="empty-state-description">위에서 수업을 선택하여 출석 체크를 시작하세요.</div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 'var(--spacing-lg)' }}>
          <div className="card-header">
            <h3 className="card-title">
              학생 목록
              <span className="badge badge-primary" style={{ marginLeft: '8px' }}>
                {filteredStudents.length}명
              </span>
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
              {hasChanges && (
                <span className="badge badge-warning">변경사항 있음</span>
              )}
              {filteredStudents.length > 0 && (
                <button
                  className="btn btn-secondary"
                  onClick={toggleAllAttendance}
                  data-testid="toggle-all-attendance"
                >
                  {allChecked ? '전체 해제' : '전체 출석'}
                </button>
              )}
            </div>
          </div>

          {filteredStudents.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👥</div>
              <div className="empty-state-title">등록된 학생이 없습니다</div>
              <div className="empty-state-description">이 수업에 학생을 등록해주세요.</div>
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 'var(--spacing-md)',
                marginTop: 'var(--spacing-lg)'
              }}>
                {filteredStudents.map((student) => (
                  <div
                    key={student.id}
                    onClick={() => toggleAttendance(student.id)}
                    className={`attendance-card ${checkedStudents.has(student.id) ? 'checked' : ''}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                      <input
                        type="checkbox"
                        checked={checkedStudents.has(student.id)}
                        onChange={() => {}}
                        style={{ pointerEvents: 'none' }}
                      />
                      <div>
                        <div style={{
                          fontWeight: 600,
                          color: checkedStudents.has(student.id) ? 'var(--color-success)' : 'var(--color-gray-900)'
                        }}>
                          {student.name}
                        </div>
                        <div style={{
                          fontSize: '0.8125rem',
                          color: checkedStudents.has(student.id) ? 'var(--color-success)' : 'var(--color-gray-500)'
                        }}>
                          {student.birthdate || "-"} ({calculateAge(student.birthdate)}세)
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Submit Bar */}
              <div style={{
                marginTop: 'var(--spacing-xl)',
                padding: 'var(--spacing-lg)',
                backgroundColor: 'var(--color-gray-50)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 'var(--spacing-md)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                  <span style={{ fontWeight: 600, color: 'var(--color-gray-900)' }}>
                    출석: <span style={{ color: 'var(--color-primary)', fontSize: '1.25rem' }}>{checkedStudents.size}</span>
                    <span style={{ color: 'var(--color-gray-500)' }}> / {filteredStudents.length}명</span>
                  </span>
                  {checkedStudents.size > 0 && (
                    <span className="badge badge-success">
                      {Math.round((checkedStudents.size / filteredStudents.length) * 100)}%
                    </span>
                  )}
                </div>
                <button
                  className="btn btn-success btn-lg"
                  onClick={handleSubmit}
                  style={{ minWidth: isMobile ? '100%' : '160px' }}
                >
                  출석 체크 저장
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default AttendanceCheck;
