import React, { useState, useEffect, useMemo, useRef } from "react";
import { fetchWithAuth } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { calculateAge } from "../../utils/dateHelpers";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { Toast } from "../ui";
import MakeupAttendanceDialog from "./MakeupAttendanceDialog";
import { makeupResultMessage } from "./makeupAttendance";

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

  // 보강 출석 추가 대화상자
  const [showAddModal, setShowAddModal] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const showToast = (message, duration = 3000) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), duration);
  };

  useEffect(() => () => clearTimeout(toastTimer.current), []);

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

  // 보강 출석을 넣고 나면 보고 있는 날·수업의 출석 수에 더한다.
  // 다시 불러오지 않는 건 저장하지 않은 체크를 지우지 않으려는 것 — 넣은 학생은 이미 저장돼 있다.
  const handleMakeupAdded = (result, { date, classId }) => {
    setShowAddModal(false);
    showToast(makeupResultMessage(result));
    const sameView = date === selectedDate && (!selectedClass || classId === parseInt(selectedClass));
    if (sameView && result.added?.length) {
      setCheckedStudents((prev) => new Set([...prev, ...result.added]));
    }
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
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + 보강 출석 추가
        </button>
      </div>

      {showAddModal && (
        <MakeupAttendanceDialog
          students={students}
          classes={classes}
          initialDate={selectedDate}
          initialClassId={selectedClass}
          onClose={() => setShowAddModal(false)}
          onAdded={handleMakeupAdded}
        />
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
                borderRadius: 'var(--shape-box)',
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

      <Toast>{toast}</Toast>
    </div>
  );
}

export default AttendanceCheck;
