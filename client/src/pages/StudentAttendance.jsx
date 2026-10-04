import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import DateRangePicker from '../components/common/DateRangePicker';
import { matchKoreanSearch } from '../utils/koreanSearch';
import { calculateAge } from '../utils/dateHelpers';
import { useIsMobile } from '../hooks/useMediaQuery';

function StudentAttendance() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);

  const formatDate = (date) => {
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
      start: formatDate(firstDay),
      end: formatDate(lastDay),
      startDate: firstDay,
      endDate: lastDay
    };
  };

  const thisMonth = getThisMonthRange();
  const [startDate, setStartDate] = useState(thisMonth.start);
  const [endDate, setEndDate] = useState(thisMonth.end);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const isMobile = useIsMobile();
  const [swipedId, setSwipedId] = useState(null);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [swipeOffset, setSwipeOffset] = useState({});

  // 학생 검색 상태
  const [studentSearchText, setStudentSearchText] = useState('');
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [dropdownTouchStartY, setDropdownTouchStartY] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    loadData();
  }, []);

  useEffect(() => {
    if (students.length > 0) {
      loadAttendanceRecords();
    }
  }, [startDate, endDate, selectedStudent, selectedClass, students]);

  // 학생 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showStudentDropdown && !e.target.closest('.student-search-container')) {
        setShowStudentDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showStudentDropdown]);

  const loadData = async () => {
    try {
      const [studentsRes, classesRes] = await Promise.all([
        fetchWithAuth('/api/students'),
        fetchWithAuth('/api/classes')
      ]);
      const studentsData = await studentsRes.json();
      const classesData = await classesRes.json();
      setStudents(studentsData);
      setClasses(classesData);
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    }
  };

  const loadAttendanceRecords = async () => {
    try {
      const response = await fetchWithAuth('/api/attendance');
      let records = await response.json();

      if (startDate && endDate) {
        records = records.filter(r => r.date >= startDate && r.date <= endDate);
      }

      if (selectedStudent) {
        records = records.filter(r => r.studentId === parseInt(selectedStudent));
      }

      if (selectedClass) {
        records = records.filter(r => r.classId === parseInt(selectedClass));
      }

      records.sort((a, b) => new Date(b.date) - new Date(a.date));

      setAttendanceRecords(records);
    } catch (error) {
      console.error('출석 기록 로드 실패:', error);
      setAttendanceRecords([]);
    }
  };

  const handleDeleteAttendance = async (recordId) => {
    if (!confirm('이 출석 기록을 삭제하시겠습니까?')) {
      return;
    }

    try {
      const response = await fetchWithAuth(`/api/attendance/${recordId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        await loadAttendanceRecords();
        alert('출석 기록이 삭제되었습니다.');
      }
    } catch (error) {
      console.error('출석 삭제 실패:', error);
      alert('출석 삭제에 실패했습니다.');
    }
  };

  const getClassName = (classId) => {
    const classItem = classes.find(c => c.id === classId);
    return classItem ? classItem.name : '-';
  };

  const getClassInfo = (classId) => {
    return classes.find(c => c.id === classId);
  };

  const getStudentName = (studentId) => {
    const student = students.find(s => s.id === studentId);
    return student ? student.name : '-';
  };

  const getStudentInfo = (studentId) => {
    return students.find(s => s.id === studentId);
  };

  const getFilteredStudents = () => {
    let filtered = students;
    if (selectedClass) {
      filtered = filtered.filter(student =>
        student.classIds && student.classIds.includes(parseInt(selectedClass))
      );
    }
    if (studentSearchText) {
      filtered = filtered.filter(s =>
        matchKoreanSearch(studentSearchText, s.name)
      );
    }
    return filtered;
  };

  const handleSelectStudent = (studentId) => {
    setSelectedStudent(studentId.toString());
    const student = students.find(s => s.id === studentId);
    setStudentSearchText(student ? student.name : '');
    setShowStudentDropdown(false);
  };

  const handleClearStudent = () => {
    setSelectedStudent('');
    setStudentSearchText('');
    setShowStudentDropdown(false);
  };

  const formatDisplayDate = (dateString) => {
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekday = weekdays[date.getDay()];
    return `${month}/${day}(${weekday})`;
  };

  const minSwipeDistance = 50;
  const swipeRevealWidth = 72;

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

  return (
    <div className="animate-fadeIn">
      {/* Page Header */}
      <div className="page-header">
        <h2 className="page-title">학생별 출석 조회</h2>
      </div>

      {/* Filter Card */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">조회 조건</h3>
          {(selectedStudent || selectedClass || startDate !== getThisMonthRange().start || endDate !== getThisMonthRange().end) && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const thisMonth = getThisMonthRange();
                setStartDate(thisMonth.start);
                setEndDate(thisMonth.end);
                setSelectedClass('');
                setSelectedStudent('');
                setStudentSearchText('');
              }}
            >
              초기화
            </button>
          )}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'auto 1fr 1fr',
          gap: 'var(--spacing-lg)',
          marginTop: 'var(--spacing-lg)'
        }}>
          <div>
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onDateChange={(newStartDate, newEndDate) => {
                setStartDate(newStartDate);
                setEndDate(newEndDate);
              }}
              isMobile={isMobile}
              label="기간 선택"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">수업</label>
            <select
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setSelectedStudent('');
                setStudentSearchText('');
              }}
            >
              <option value="">전체 수업</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group student-search-container" style={{ marginBottom: 0, position: 'relative' }}>
            <label className="form-label">학생</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="학생 이름 검색"
                value={studentSearchText}
                onChange={(e) => {
                  setStudentSearchText(e.target.value);
                  setSelectedStudent('');
                  setShowStudentDropdown(true);
                }}
                onFocus={() => setShowStudentDropdown(true)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
              {(selectedStudent || studentSearchText) && (
                <button
                  type="button"
                  onClick={handleClearStudent}
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
            {showStudentDropdown && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  maxHeight: '200px',
                  overflowY: 'auto',
                  backgroundColor: 'var(--surface)',
                  border: 'var(--stroke-thin)',
                  borderRadius: 'var(--shape-box)',
                  boxShadow: 'var(--shadow-popover)',
                  zIndex: 9999,
                  WebkitOverflowScrolling: 'touch'
                }}
              >
                <div
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleClearStudent();
                  }}
                  onTouchStart={(e) => {
                    setDropdownTouchStartY(e.touches[0].clientY);
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const touchEndY = e.changedTouches[0].clientY;
                    const distance = Math.abs(touchEndY - dropdownTouchStartY);
                    // 10px 이상 이동했으면 스크롤로 판단하여 선택하지 않음
                    if (distance < 10) {
                      handleClearStudent();
                    }
                  }}
                  style={{
                    padding: 'var(--spacing-md)',
                    cursor: 'pointer',
                    backgroundColor: !selectedStudent ? 'var(--color-primary-bg)' : 'transparent',
                    borderBottom: '1px solid var(--color-gray-100)',
                    fontWeight: 500,
                    color: 'var(--color-gray-600)'
                  }}
                >
                  전체 학생
                </div>
                {getFilteredStudents().map(s => (
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
                      backgroundColor: selectedStudent === s.id.toString() ? 'var(--color-primary-bg)' : 'transparent',
                      borderBottom: '1px solid var(--color-gray-100)'
                    }}
                  >
                    <div style={{ fontWeight: 500, pointerEvents: 'none' }}>{s.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', pointerEvents: 'none' }}>
                      {s.birthdate || '-'} ({calculateAge(s.birthdate)}세)
                    </div>
                  </div>
                ))}
                {getFilteredStudents().length === 0 && (
                  <div style={{ padding: 'var(--spacing-md)', color: 'var(--color-gray-500)', textAlign: 'center' }}>
                    검색 결과가 없습니다
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Selected Filter Info */}
        <div className="info-box" style={{ marginTop: 'var(--spacing-lg)' }}>
          <div className="info-box-title">
            {startDate} ~ {endDate}
            {selectedClass && ` | ${getClassName(parseInt(selectedClass))}`}
            {selectedStudent && ` | ${getStudentName(parseInt(selectedStudent))}`}
          </div>
        </div>
      </div>

      {/* Stats Card */}
      <div className="card" style={{ marginTop: 'var(--spacing-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-md)' }}>
          <h3 className="card-title">출석 현황</h3>
          <span style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            color: 'var(--color-success)'
          }}>
            {attendanceRecords.length}
          </span>
          <span style={{ color: 'var(--color-gray-500)' }}>명 출석</span>
        </div>
      </div>

      {/* Attendance List */}
      <div className="card" style={{ marginTop: 'var(--spacing-lg)' }}>
        <div className="card-header">
          <h3 className="card-title">
            출석 기록
            <span className="badge badge-success" style={{ marginLeft: '8px' }}>
              {attendanceRecords.length}건
            </span>
          </h3>
        </div>

        {attendanceRecords.length > 0 ? (
          <>
            {/* Desktop Table */}
            {!isMobile && (
              <div className="table-container" style={{ marginTop: 'var(--spacing-lg)' }}>
                <table>
                  <thead>
                    <tr>
                      <th>출석 날짜</th>
                      <th>이름</th>
                      <th>생년월일 / 나이</th>
                      <th>수업</th>
                      <th style={{ width: '80px' }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceRecords.map(record => {
                      const student = getStudentInfo(record.studentId);
                      const classInfo = getClassInfo(record.classId);
                      return (
                        <tr key={record.id}>
                          <td>
                            <span style={{ fontWeight: 600 }}>{formatDisplayDate(record.date)}</span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600, color: 'var(--color-gray-900)' }}>
                              {student?.name || '-'}
                            </span>
                          </td>
                          <td>
                            <span>{student?.birthdate || '-'}</span>
                            {student?.birthdate && (
                              <span className="badge badge-gray" style={{ marginLeft: '8px' }}>
                                {calculateAge(student.birthdate)}세
                              </span>
                            )}
                          </td>
                          <td>
                            <div style={{ fontWeight: 500 }}>{classInfo?.name || '-'}</div>
                            {classInfo?.schedule && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)' }}>
                                {classInfo.schedule}
                              </div>
                            )}
                          </td>
                          <td>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDeleteAttendance(record.id)}
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Mobile Cards - Swipeable with Date Grouping */}
            {isMobile && (
              <div style={{ marginTop: 'var(--spacing-lg)' }}>
                {(() => {
                  const groupedByDate = attendanceRecords.reduce((acc, record) => {
                    const date = record.date;
                    if (!acc[date]) acc[date] = [];
                    acc[date].push(record);
                    return acc;
                  }, {});

                  return Object.entries(groupedByDate).map(([date, records]) => (
                    <div key={date} style={{ marginBottom: 'var(--spacing-md)' }}>
                      <div className="toss-list-header" style={{
                        padding: 'var(--spacing-lg) var(--spacing-lg) var(--spacing-sm)',
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                        color: 'var(--color-gray-500)'
                      }}>
                        {formatDisplayDate(date)}
                      </div>
                      {records.map(record => {
                        const student = getStudentInfo(record.studentId);
                        const classInfo = getClassInfo(record.classId);
                        return (
                          <div key={record.id} className="swipeable-container">
                            <div className="swipeable-actions">
                              <button
                                className="swipeable-action-btn delete"
                                onClick={() => handleDeleteAttendance(record.id)}
                              >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                              </button>
                            </div>
                            <div
                              className="swipeable-card"
                              style={{
                                transform: `translateX(-${swipeOffset[record.id] || 0}px)`
                              }}
                              onTouchStart={(e) => handleTouchStart(e, record.id)}
                              onTouchMove={(e) => handleTouchMove(e, record.id)}
                              onTouchEnd={() => handleTouchEnd(record.id)}
                            >
                              <div className="toss-card-item-content">
                                <div className="toss-list-item-icon success">
                                  {student?.name?.charAt(0) || '?'}
                                </div>
                                <div className="toss-list-item-content">
                                  <div className="toss-list-item-title">
                                    {student?.name || '-'}
                                  </div>
                                  <div className="toss-list-item-subtitle">
                                    {classInfo?.name || '-'}
                                  </div>
                                </div>
                                <div className="toss-list-item-value">
                                  <div className="toss-list-item-value-main" style={{ color: 'var(--color-success)' }}>
                                    {calculateAge(student?.birthdate)}세
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">출석 기록이 없습니다</div>
            <div className="empty-state-description">선택한 조건에 해당하는 출석 기록이 없습니다.</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentAttendance;
