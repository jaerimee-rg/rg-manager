import React, { useState, useEffect } from "react";
import { fetchWithAuth } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useIsMobile } from "../../hooks/useMediaQuery";

function StudentForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const editStudent = location.state?.student;

  const [classes, setClasses] = useState([]);
  const [formData, setFormData] = useState({
    name: "",
    birthdate: "",
    classIds: [],
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    window.scrollTo(0, 0);
    loadClasses();

    if (editStudent) {
      setFormData({
        name: editStudent.name,
        birthdate: editStudent.birthdate,
        classIds: editStudent.classIds || [],
      });
      setIsEditing(true);
      setEditId(editStudent.id);
    }
  }, []);

  const loadClasses = async () => {
    try {
      const response = await fetchWithAuth("/api/classes");
      const data = await response.json();
      setClasses(data);
    } catch (error) {
      console.error("수업 목록 로드 실패:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEditing) {
        const response = await fetchWithAuth(`/api/students/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (response.ok) {
          alert("학생 정보가 수정되었습니다.");
          navigate("/students");
        }
      } else {
        const response = await fetchWithAuth("/api/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (response.ok) {
          alert("학생이 등록되었습니다.");
          navigate("/students");
        }
      }
    } catch (error) {
      console.error("학생 저장 실패:", error);
      alert("학생 정보 저장에 실패했습니다.");
    }
  };

  const handleClassToggle = (classId) => {
    const currentClassIds = formData.classIds || [];
    if (currentClassIds.includes(classId)) {
      setFormData({
        ...formData,
        classIds: currentClassIds.filter((id) => id !== classId),
      });
    } else {
      setFormData({
        ...formData,
        classIds: [...currentClassIds, classId],
      });
    }
  };

  return (
    <div className="animate-fadeIn">
      {/* Page Header */}
      <div className="page-header">
        <h2 className="page-title page-title--sub">{isEditing ? "학생 수정" : "새 학생 등록"}</h2>
        <button
          className="btn btn-secondary"
          onClick={() => navigate("/students")}
        >
          목록으로
        </button>
      </div>

      {/* Form Card */}
      <div className="card" data-tutorial-action="student-form">
        <form onSubmit={handleSubmit}>
          {/* Basic Info */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 'var(--spacing-lg)'
          }}>
            <div className="form-group" style={{ marginBottom: 0 }} data-tutorial="student-name">
              <label className="form-label">이름</label>
              <input
                type="text"
                placeholder="학생 이름을 입력하세요"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }} data-tutorial="student-birthdate">
              <label className="form-label">생년월일</label>
              <input
                type={formData.birthdate ? "date" : "text"}
                placeholder="생년월일 선택"
                value={formData.birthdate}
                onFocus={(e) => { e.target.type = "date"; }}
                onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Class Selection */}
          {classes.length > 0 && (
            <div style={{ marginTop: 'var(--spacing-xl)' }} data-tutorial="student-class">
              <label className="form-label">수강 수업 선택</label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 'var(--spacing-md)',
                marginTop: 'var(--spacing-sm)'
              }}>
                {classes.map((cls) => {
                  const isSelected = (formData.classIds || []).includes(cls.id);
                  return (
                    <div
                      key={cls.id}
                      onClick={() => handleClassToggle(cls.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: 'var(--spacing-lg)',
                        border: isSelected ? 'var(--stroke)' : 'var(--stroke-thin)',
                        borderRadius: 'var(--shape-box)',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'var(--color-primary-bg)' : 'var(--bg-secondary)',
                        transition: 'all var(--transition-fast)'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        style={{ marginRight: 'var(--spacing-md)', pointerEvents: 'none' }}
                      />
                      <div>
                        <div style={{
                          fontWeight: 600,
                          color: isSelected ? 'var(--color-primary-dark)' : 'var(--color-gray-900)'
                        }}>
                          {cls.name}
                        </div>
                        <div style={{
                          fontSize: '0.8125rem',
                          color: isSelected ? 'var(--color-primary)' : 'var(--color-gray-500)'
                        }}>
                          {cls.schedule}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{
            display: 'flex',
            gap: 'var(--spacing-md)',
            marginTop: 'var(--spacing-xl)',
            paddingTop: 'var(--spacing-xl)',
            borderTop: '1px solid var(--color-gray-200)'
          }}>
            <button type="submit" className="btn btn-primary btn-lg" data-tutorial="student-submit">
              {isEditing ? "수정 완료" : "등록하기"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              onClick={() => navigate("/students")}
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default StudentForm;
