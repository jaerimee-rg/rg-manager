import React, { useState, useEffect, useMemo } from 'react';
import { fetchWithAuth } from '../../utils/api';
import InviteLinkBox from './InviteLinkBox';
import { suggestStudents, buildStudentView, filterParents, sortParents, parentLabel } from './parentLinking';

const STAT_STYLE = { background: '#fff', borderRadius: 'var(--radius-lg)', padding: '12px 14px' };

function Stat({ label, value, sub, warn }) {
  return (
    <div style={STAT_STYLE}>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', fontWeight: 600 }}>{label}</div>
      <div style={{
        fontSize: '1.375rem', fontWeight: 800, letterSpacing: '-0.5px', marginTop: '2px',
        color: warn && value > 0 ? '#B26A00' : 'inherit'
      }}>
        {value}
        {sub && <span style={{ fontSize: '0.8125rem', color: 'var(--color-gray-400)', fontWeight: 600 }}> {sub}</span>}
      </div>
    </div>
  );
}

/**
 * 학부모 관리 — 초대 링크와 학부모↔학생 연결.
 * 같은 데이터를 학부모별·학생별 두 방향으로 보여준다.
 * `filterUserId` 가 있으면 관리자 화면(다른 선생님의 학부모)으로 동작한다.
 */
function ParentList({ filterUserId = null, embedded = false }) {
  const [parents, setParents] = useState([]);
  const [summary, setSummary] = useState({ parentCount: 0, pendingChildren: 0, linkedStudents: 0 });
  const [students, setStudents] = useState([]);
  const [view, setView] = useState('parents');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2600);
  };

  const load = async () => {
    try {
      const params = filterUserId ? `?filterUserId=${filterUserId}` : '';
      const [parentsRes, studentsRes] = await Promise.all([
        fetchWithAuth(`/api/parents${params}`),
        fetchWithAuth(`/api/students${filterUserId && filterUserId !== 'all' ? `?filterUserId=${filterUserId}` : ''}`)
      ]);

      if (parentsRes.ok) {
        const data = await parentsRes.json();
        setParents(data.parents || []);
        setSummary(data.summary || {});
      }
      if (studentsRes.ok) setStudents(await studentsRes.json());
    } catch (error) {
      console.error('학부모 목록 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [filterUserId]);

  const linkChild = async (childId, studentId, childName, studentName) => {
    if (!studentId) return;
    const response = await fetchWithAuth(`/api/parents/children/${childId}/link`, {
      method: 'PUT',
      body: JSON.stringify({ studentId: Number(studentId) })
    });

    if (response.ok) {
      showToast(`${childName} ↔ ${studentName} 연결 · 이제 바로 신청할 수 있어요`);
      load();
    } else {
      const err = await response.json();
      alert(err.error || '연결에 실패했습니다.');
    }
  };

  const unlinkChild = async (childId, childName) => {
    if (!confirm(`${childName} 의 학생 연결을 해제할까요?\n해제하면 학부모는 신청할 수 없게 됩니다.`)) return;

    const response = await fetchWithAuth(`/api/parents/children/${childId}/link`, { method: 'DELETE' });
    if (response.ok) {
      showToast('연결을 해제했어요');
      load();
    }
  };

  const addLink = async (parentUserId, studentId, parentName, studentName) => {
    if (!studentId) return;
    const response = await fetchWithAuth(`/api/parents/${parentUserId}/children`, {
      method: 'POST',
      body: JSON.stringify({ studentId: Number(studentId) })
    });

    if (response.ok) {
      showToast(`${parentName} 에 ${studentName} 연결을 추가했어요`);
      load();
    } else {
      const err = await response.json();
      alert(err.error || '연결에 실패했습니다.');
    }
  };

  const removeParent = async (parent) => {
    /* 학부모가 다른 선생님에게도 다닐 수 있어(docs/accounts-roles FR-350) 선생님은
       계정을 지우지 않고 **자기 연결만** 끊는다. 서버가 그렇게 처리한다. */
    if (!confirm(`${parentLabel(parent)} 학부모와의 연결을 해제할까요?\n내 일정·사진을 더 이상 볼 수 없게 됩니다. (다른 선생님과의 연결은 그대로예요)`)) return;

    const response = await fetchWithAuth(`/api/parents/${parent.userId}`, { method: 'DELETE' });
    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      showToast(data.unlinkedOnly ? '학부모 연결을 해제했어요' : '학부모 계정을 삭제했어요');
      load();
    }
  };

  const visibleParents = useMemo(() => sortParents(filterParents(parents, query)), [parents, query]);
  const studentRows = useMemo(() => {
    const rows = buildStudentView(students, parents);
    const q = query.replace(/\s+/g, '');
    if (!q) return rows;
    return rows.filter(
      (r) => r.student.name.replace(/\s+/g, '').includes(q) ||
        r.links.some(({ parent }) => parentLabel(parent).replace(/\s+/g, '').includes(q))
    );
  }, [students, parents, query]);

  const studentLabel = (s) => `${s.name} · ${s.birthdate}`;

  return (
    <div className={embedded ? '' : 'container'}>
      {!embedded && (
        <div className="page-header">
          <h2>학부모</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-gray-500)', marginTop: '4px' }}>
            초대 링크로 가입한 학부모를 학생과 연결합니다. 연결된 아이만 일정에 신청할 수 있어요.
          </p>
        </div>
      )}

      {!filterUserId && <InviteLinkBox onToast={showToast} />}

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '10px', marginBottom: '14px'
      }}>
        <Stat label="가입 학부모" value={summary.parentCount || 0} />
        <Stat label="확인 대기 아이" value={summary.pendingChildren || 0} warn />
        <Stat label="연결된 학생" value={summary.linkedStudents || 0} sub={`/ ${students.length}`} />
        <Stat label="학부모 없는 학생" value={Math.max(0, students.length - (summary.linkedStudents || 0))} />
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ display: 'inline-flex', background: 'var(--color-gray-100)', padding: '3px', borderRadius: 'var(--radius-md)' }}>
          {[['parents', '학부모별'], ['students', '학생별']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              aria-pressed={view === key}
              style={{
                border: 'none', background: view === key ? '#fff' : 'none',
                color: view === key ? 'var(--color-gray-900)' : 'var(--color-gray-600)',
                fontWeight: 700, fontSize: '0.875rem', padding: '8px 14px',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'inherit'
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="학부모·아이 이름 검색"
          aria-label="학부모·아이 이름 검색"
          style={{
            flex: 1, minWidth: '180px', height: '42px', padding: '0 12px',
            border: '1px solid var(--color-gray-200)', borderRadius: 'var(--radius-md)',
            fontSize: '1rem', fontFamily: 'inherit'
          }}
        />
      </div>

      {loading ? (
        <div className="card" style={{ padding: '30px', textAlign: 'center', color: 'var(--color-gray-500)' }}>
          불러오는 중...
        </div>
      ) : view === 'parents' ? (
        visibleParents.length === 0 ? (
          <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-gray-500)' }}>
            아직 가입한 학부모가 없습니다. 위 초대 링크를 학부모에게 보내주세요.
          </div>
        ) : (
          visibleParents.map((parent) => (
            <div key={parent.userId} className="card" style={{ padding: '14px 16px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {parentLabel(parent)} <span className="badge badge-gray">카카오</span>
                    {/* 관리자가 전체를 볼 때는 연결된 선생님을 모두 보여준다 (학부모 ↔ 선생님 다대다) */}
                    {(parent.teachers || []).length > 0
                      ? parent.teachers.map((teacher) => (
                          <span key={teacher.id} className="badge badge-primary" style={{ marginLeft: '4px' }}>
                            {teacher.name} 선생님
                          </span>
                        ))
                      : filterUserId && parent.teacherName && (
                          <span className="badge badge-primary" style={{ marginLeft: '4px' }}>{parent.teacherName} 선생님</span>
                        )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)' }}>
                    가입 {(parent.createdAt || '').slice(0, 10)}
                    {parent.lastLoginAt && ` · 마지막 로그인 ${parent.lastLoginAt.slice(0, 10)}`}
                  </div>
                </div>
                <span style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-sm" onClick={() => removeParent(parent)}>연결 해제</button>
              </div>

              {parent.children.map((child) => (
                <div key={child.id} style={{
                  display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
                  padding: '9px 0 0', fontSize: '0.875rem'
                }}>
                  <span>👧 <b>{child.childName}</b></span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)' }}>{child.childBirthdate}</span>

                  {child.studentId ? (
                    <>
                      <span className="badge badge-success">
                        연결됨 · {child.studentName}{child.linkedBy && child.linkedBy !== 'auto' ? ' · 선생님 연결' : ''}
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={() => unlinkChild(child.id, child.childName)}>
                        연결 해제
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="badge badge-warning">확인 대기</span>
                      <select
                        aria-label={`${child.childName} 학생 연결`}
                        defaultValue=""
                        onChange={(e) => {
                          const student = students.find((s) => String(s.id) === e.target.value);
                          linkChild(child.id, e.target.value, child.childName, student?.name || '');
                          e.target.value = '';
                        }}
                        style={{ padding: '7px 8px', fontSize: '0.8125rem', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius-sm)' }}
                      >
                        <option value="">학생 연결…</option>
                        {suggestStudents(child, students).length > 0 && (
                          <optgroup label="비슷한 학생">
                            {suggestStudents(child, students).map((s) => (
                              <option key={s.id} value={s.id}>{studentLabel(s)}</option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="전체 학생">
                          {students.map((s) => (
                            <option key={s.id} value={s.id}>{studentLabel(s)}</option>
                          ))}
                        </optgroup>
                      </select>
                      {suggestStudents(child, students).length > 0 && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)' }}>
                          💡 {suggestStudents(child, students).map((s) => s.name).join(', ')} 와(과) 이름 또는 생일이 같아요
                        </span>
                      )}
                    </>
                  )}
                </div>
              ))}

              <div style={{ paddingTop: '9px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  aria-label={`${parentLabel(parent)} 에 학생 연결 추가`}
                  defaultValue=""
                  onChange={(e) => {
                    const student = students.find((s) => String(s.id) === e.target.value);
                    addLink(parent.userId, e.target.value, parentLabel(parent), student?.name || '');
                    e.target.value = '';
                  }}
                  style={{ padding: '7px 8px', fontSize: '0.8125rem', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius-sm)' }}
                >
                  <option value="">+ 이 학부모에 학생 연결 추가…</option>
                  {students
                    .filter((s) => !parent.children.some((c) => c.studentId === s.id))
                    .map((s) => <option key={s.id} value={s.id}>{studentLabel(s)}</option>)}
                </select>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)' }}>
                  학부모가 아이를 안 넣었거나 형제를 추가할 때
                </span>
              </div>
            </div>
          ))
        )
      ) : (
        <>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginBottom: '10px' }}>
            학생 기준으로 봅니다. 한 학생에 학부모 여러 명(엄마·아빠)을 연결할 수 있어요.
          </div>
          {studentRows.map(({ student, links, suggestions }) => (
            <div key={student.id} className="card" style={{
              padding: '12px 16px', marginBottom: '8px', display: 'flex',
              alignItems: 'center', gap: '12px', flexWrap: 'wrap'
            }}>
              <div>
                <div style={{ fontWeight: 700 }}>{student.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)' }}>{student.birthdate}</div>
              </div>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1, alignItems: 'center', minWidth: '200px' }}>
                {links.length === 0 && suggestions.length === 0 && (
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-gray-400)' }}>연결된 학부모 없음</span>
                )}
                {links.map(({ parent, child }) => (
                  <span key={child.id} className="badge badge-success" style={{ padding: '4px 6px 4px 10px', gap: '6px' }}>
                    👤 {parentLabel(parent)}
                    <button
                      onClick={() => unlinkChild(child.id, child.childName)}
                      aria-label={`${parentLabel(parent)} 연결 해제`}
                      style={{
                        border: 'none', background: 'rgba(0,0,0,.06)', color: 'inherit', borderRadius: '50%',
                        width: '18px', height: '18px', fontSize: '0.7rem', cursor: 'pointer', lineHeight: 1
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {suggestions.map(({ parent, child }) => (
                  <span key={`s-${child.id}`} className="badge badge-warning" style={{ padding: '4px 6px 4px 10px', gap: '6px' }}>
                    💡 {parentLabel(parent)}의 "{child.childName}" 확인 대기
                    <button
                      onClick={() => linkChild(child.id, student.id, child.childName, student.name)}
                      style={{
                        border: 'none', background: '#B26A00', color: '#fff', borderRadius: '9px',
                        padding: '1px 7px', fontSize: '0.6875rem', cursor: 'pointer', fontWeight: 700
                      }}
                    >
                      연결
                    </button>
                  </span>
                ))}
              </div>

              <select
                aria-label={`${student.name} 에 학부모 연결`}
                defaultValue=""
                onChange={(e) => {
                  const parent = parents.find((p) => String(p.userId) === e.target.value);
                  addLink(e.target.value, student.id, parentLabel(parent), student.name);
                  e.target.value = '';
                }}
                style={{ padding: '7px 8px', fontSize: '0.8125rem', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius-sm)' }}
              >
                <option value="">+ 학부모 연결…</option>
                {parents
                  .filter((p) => !p.children.some((c) => c.studentId === student.id))
                  .map((p) => <option key={p.userId} value={p.userId}>{parentLabel(p)}</option>)}
              </select>
            </div>
          ))}
        </>
      )}

      {toast && (
        <div role="status" style={{
          position: 'fixed', left: '50%', bottom: '30px', transform: 'translateX(-50%)',
          background: 'rgba(25,31,40,.92)', color: '#fff', padding: '10px 16px',
          borderRadius: 'var(--radius-full)', fontSize: '0.8125rem', fontWeight: 600, zIndex: 400
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

export default ParentList;
