import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';
import { moveItem } from '../utils/reorder';
import { useAuth } from '../context/AuthContext';
import DateRangePicker from '../components/common/DateRangePicker';
import { useIsMobile } from '../hooks/useMediaQuery';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalClasses: 0
  });
  const [classes, setClasses] = useState([]);
  const [attendanceByClass, setAttendanceByClass] = useState([]);
  const [monthlyDistinctStudents, setMonthlyDistinctStudents] = useState([]);
  const [classDistinctStudents, setClassDistinctStudents] = useState([]);
  const [weeklyAttendanceData, setWeeklyAttendanceData] = useState([]);
  const [weeklyDistinctStudents, setWeeklyDistinctStudents] = useState([]);
  const [monthlyAttendanceData, setMonthlyAttendanceData] = useState([]);
  const [studentsByAge, setStudentsByAge] = useState([]);
  const isMobile = useIsMobile();
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('all');
  const [allAttendance, setAllAttendance] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [attendanceModal, setAttendanceModal] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);

  const getDefaultDateRange = () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);
    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    };
  };

  const defaultRange = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (user?.role === 'admin') {
      loadUsers();
    }
    loadData();
  }, []);

  useEffect(() => {
    loadData();
  }, [selectedUserId]);

  useEffect(() => {
    if (classes.length > 0) {
      loadData();
    }
  }, [startDate, endDate]);

  const calculateAge = (birthdate) => {
    if (!birthdate) return null;
    const today = new Date();
    const birth = new Date(birthdate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const loadUsers = async () => {
    try {
      const response = await fetchWithAuth("/api/auth/users");
      const data = await response.json();
      setUsers(data.filter(u => u.role !== 'admin'));
    } catch (error) {
      console.error("사용자 목록 로드 실패:", error);
    }
  };

  const loadData = async () => {
    try {
      const studentsUrl = user?.role === 'admin' && selectedUserId !== 'all'
        ? `/api/students?filterUserId=${selectedUserId}`
        : '/api/students';
      const classesUrl = user?.role === 'admin' && selectedUserId !== 'all'
        ? `/api/classes?filterUserId=${selectedUserId}`
        : '/api/classes';
      const attendanceUrl = user?.role === 'admin' && selectedUserId !== 'all'
        ? `/api/attendance?filterUserId=${selectedUserId}`
        : '/api/attendance';

      const [studentsRes, classesRes, attendanceRes] = await Promise.all([
        fetchWithAuth(studentsUrl),
        fetchWithAuth(classesUrl),
        fetchWithAuth(attendanceUrl)
      ]);

      const students = await studentsRes.json();
      const classesData = await classesRes.json();
      const attendance = await attendanceRes.json();

      setAllStudents(students);
      setAllAttendance(attendance);

      setStats({
        totalStudents: students.length,
        totalClasses: classesData.length
      });

      setClasses(classesData);

      // 나이별 학생 수 계산
      const ageCount = {};
      students.forEach(student => {
        const age = calculateAge(student.birthdate);
        if (age !== null) {
          ageCount[age] = (ageCount[age] || 0) + 1;
        }
      });
      const ageData = Object.entries(ageCount)
        .map(([age, count]) => ({ age: `${age}세`, 학생수: count, ageNum: parseInt(age) }))
        .sort((a, b) => a.ageNum - b.ageNum);
      setStudentsByAge(ageData);

      const dateRange = [];
      const start = new Date(startDate);
      const end = new Date(endDate);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dateRange.push(d.toISOString().split('T')[0]);
      }

      const classAttendance = classesData.map(classItem => {
        const dailyAttendance = dateRange.map(date => {
          const count = attendance.filter(a =>
            a.classId === classItem.id && a.date === date
          ).length;
          return { date, count };
        });

        const enrolledStudents = students.filter(s =>
          s.classIds && s.classIds.includes(classItem.id)
        ).length;

        return {
          class: classItem,
          enrolledStudents,
          dailyAttendance
        };
      });

      setAttendanceByClass(classAttendance);

      // 월별 고유 학생 수 계산 (최근 6개월)
      const monthlyStudents = [];
      for (let i = 5; i >= 0; i--) {
        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() - i);
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth();

        // 해당 월의 시작일과 마지막일
        const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month + 1, 0).getDate();
        const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // 해당 월의 출석 기록에서 고유 학생 수 계산
        const monthAttendance = attendance.filter(a => a.date >= monthStart && a.date <= monthEnd);
        const distinctStudents = new Set(monthAttendance.map(a => a.studentId));

        monthlyStudents.push({
          month: `${month + 1}월`,
          학생수: distinctStudents.size
        });
      }
      setMonthlyDistinctStudents(monthlyStudents);

      // 수업별 고유 학생 수 계산 (지난달)
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      const lastMonthYear = lastMonth.getFullYear();
      const lastMonthMonth = lastMonth.getMonth();
      const lastMonthStart = `${lastMonthYear}-${String(lastMonthMonth + 1).padStart(2, '0')}-01`;
      const lastMonthLastDay = new Date(lastMonthYear, lastMonthMonth + 1, 0).getDate();
      const lastMonthEnd = `${lastMonthYear}-${String(lastMonthMonth + 1).padStart(2, '0')}-${String(lastMonthLastDay).padStart(2, '0')}`;

      const classStudents = classesData.map(classItem => {
        const classAttendance = attendance.filter(a =>
          a.classId === classItem.id &&
          a.date >= lastMonthStart &&
          a.date <= lastMonthEnd
        );
        const distinctStudents = new Set(classAttendance.map(a => a.studentId));
        return {
          name: classItem.name,
          학생수: distinctStudents.size
        };
      }).sort((a, b) => b.학생수 - a.학생수);
      setClassDistinctStudents(classStudents);

      // 주별 출석 수 그래프 데이터 (최근 8주)
      const weeklyChartData = [];
      const weeklyStudentsData = [];
      for (let i = 7; i >= 0; i--) {
        const weekEnd = new Date();
        weekEnd.setDate(weekEnd.getDate() - (i * 7));
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 6);

        let weekCount = 0;
        const weekStudentIds = new Set();
        for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          const dayAttendance = attendance.filter(a => a.date === dateStr);
          weekCount += dayAttendance.length;
          dayAttendance.forEach(a => weekStudentIds.add(a.studentId));
        }

        const weekLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
        weeklyChartData.push({
          week: weekLabel,
          출석수: weekCount
        });
        weeklyStudentsData.push({
          week: weekLabel,
          학생수: weekStudentIds.size
        });
      }
      setWeeklyAttendanceData(weeklyChartData);
      setWeeklyDistinctStudents(weeklyStudentsData);

      // 월별 출석 수 그래프 데이터 (최근 6개월)
      const monthlyChartData = [];
      for (let i = 5; i >= 0; i--) {
        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() - i);
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth();

        const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month + 1, 0).getDate();
        const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const monthCount = attendance.filter(a => a.date >= monthStart && a.date <= monthEnd).length;

        monthlyChartData.push({
          month: `${month + 1}월`,
          출석수: monthCount
        });
      }
      setMonthlyAttendanceData(monthlyChartData);
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekday = weekdays[date.getDay()];
    return `${month}/${day}(${weekday})`;
  };

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setAttendanceByClass(moveItem(attendanceByClass, draggedIndex, index));
    setDraggedIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex !== null) {
      try {
        const classIds = attendanceByClass.map(item => item.class.id);
        await fetchWithAuth('/api/classes/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classIds })
        });
      } catch (error) {
        console.error('순서 업데이트 실패:', error);
        alert('순서 업데이트에 실패했습니다.');
        await loadData();
      }
    }
    setDraggedIndex(null);
  };

  const handleAttendanceClick = (classItem, date) => {
    const matchingRecords = allAttendance.filter(
      a => a.classId === classItem.id && a.date === date
    );
    const attendedStudentIds = matchingRecords.map(a => a.studentId);
    const attendedStudents = allStudents
      .filter(s => attendedStudentIds.includes(s.id))
      .map(s => ({ id: s.id, name: s.name, birthdate: s.birthdate }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    setAttendanceModal({
      className: classItem.name,
      classSchedule: classItem.schedule,
      date,
      students: attendedStudents
    });
  };

  return (
    <div className="animate-fadeIn">
      {/* Page Header */}
      <div className="page-header">
        <h2 className="page-title">대시보드</h2>
      </div>

      {/* Admin User Filter */}
      {user?.role === 'admin' && (
        <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-md)',
            flexWrap: 'wrap'
          }}>
            <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>
              사용자 선택
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              style={{ flex: 1, minWidth: '200px', maxWidth: isMobile ? '100%' : '300px' }}
            >
              <option value="all">전체 사용자</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Attendance by Class */}
      <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="card-header" style={{ flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center' }}>
          <h3 className="card-title">수업별 출석 현황</h3>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onDateChange={(newStartDate, newEndDate) => {
              setStartDate(newStartDate);
              setEndDate(newEndDate);
            }}
            isMobile={isMobile}
            label={isMobile ? "기간 선택" : "기간"}
          />
        </div>

        {classes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📚</div>
            <div className="empty-state-title">등록된 수업이 없습니다</div>
            <div className="empty-state-description">수업을 등록하면 출석 현황을 확인할 수 있습니다.</div>
          </div>
        ) : (
          <>
            <div className="table-container" style={{ marginTop: 'var(--spacing-lg)' }}>
              <table style={{ minWidth: '600px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th style={{ minWidth: '120px' }}>수업명</th>
                    <th style={{ minWidth: '80px', textAlign: 'center' }}>등록</th>
                    {attendanceByClass.length > 0 && attendanceByClass[0].dailyAttendance.map((day, idx) => (
                      <th key={idx} style={{ minWidth: '70px', textAlign: 'center' }}>
                        {formatDate(day.date)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attendanceByClass.map((item, classIdx) => (
                    <tr
                      key={item.class.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, classIdx)}
                      onDragOver={(e) => handleDragOver(e, classIdx)}
                      onDragEnd={handleDragEnd}
                      style={{
                        opacity: draggedIndex === classIdx ? 0.5 : 1,
                        backgroundColor: draggedIndex === classIdx ? 'var(--color-primary-bg)' : 'transparent'
                      }}
                    >
                      <td>
                        <span style={{ cursor: 'grab', color: 'var(--color-gray-400)', fontSize: '1rem' }}>⋮⋮</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--color-gray-900)' }}>{item.class.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)' }}>
                          {item.class.schedule}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-gray">{item.enrolledStudents}명</span>
                      </td>
                      {item.dailyAttendance.map((day, dayIdx) => (
                        <td key={dayIdx} style={{ textAlign: 'center' }}>
                          <span
                            onClick={day.count > 0 ? () => handleAttendanceClick(item.class, day.date) : undefined}
                            title={day.count > 0 ? '클릭하여 출석 학생 보기' : undefined}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '4px 8px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: day.count > 0 ? 'var(--color-primary-bg)' : 'var(--color-gray-100)',
                              color: day.count > 0 ? 'var(--color-primary)' : 'var(--color-gray-400)',
                              fontWeight: 600,
                              fontSize: '0.8125rem',
                              minWidth: '36px',
                              cursor: day.count > 0 ? 'pointer' : 'default',
                              transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={day.count > 0 ? (e) => { e.currentTarget.style.opacity = '0.7'; } : undefined}
                            onMouseLeave={day.count > 0 ? (e) => { e.currentTarget.style.opacity = '1'; } : undefined}
                          >
                            {day.count > 0 ? `${day.count}` : '-'}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 'var(--spacing-md)', fontSize: '0.8125rem', color: 'var(--color-gray-500)' }}>
              ⋮⋮ 핸들을 드래그하여 수업 순서를 변경할 수 있습니다.
            </div>
          </>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="stat-card">
          <div className="stat-label">전체 학생</div>
          <div className="stat-value primary">{stats.totalStudents}명</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">전체 수업</div>
          <div className="stat-value success">{stats.totalClasses}개</div>
        </div>
      </div>

      {/* Weekly & Monthly Attendance Charts */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          marginBottom: 'var(--spacing-lg)'
        }}
      >
        {/* Weekly Attendance Chart */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--spacing-lg)' }}>
            주별 출석 수
          </h3>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-gray-500)', marginBottom: 'var(--spacing-lg)' }}>
            최근 8주간 주별 총 출석 횟수
          </div>
          {weeklyAttendanceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyAttendanceData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 10, fill: 'var(--color-gray-600)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-gray-200)' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--color-gray-600)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-gray-200)' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--color-gray-200)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-md)'
                  }}
                  labelStyle={{ color: 'var(--color-gray-700)', fontWeight: 600 }}
                  formatter={(value) => [`${value}회`, '출석']}
                />
                <Bar
                  dataKey="출석수"
                  fill="var(--color-primary)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={35}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding: 'var(--spacing-xl)' }}>
              <div className="empty-state-description">데이터를 불러오는 중...</div>
            </div>
          )}
        </div>

        {/* Monthly Attendance Chart */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--spacing-lg)' }}>
            월별 출석 수
          </h3>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-gray-500)', marginBottom: 'var(--spacing-lg)' }}>
            최근 6개월간 월별 총 출석 횟수
          </div>
          {monthlyAttendanceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyAttendanceData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: 'var(--color-gray-600)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-gray-200)' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--color-gray-600)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-gray-200)' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--color-gray-200)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-md)'
                  }}
                  labelStyle={{ color: 'var(--color-gray-700)', fontWeight: 600 }}
                  formatter={(value) => [`${value}회`, '출석']}
                />
                <Bar
                  dataKey="출석수"
                  fill="var(--color-success)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={50}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding: 'var(--spacing-xl)' }}>
              <div className="empty-state-description">데이터를 불러오는 중...</div>
            </div>
          )}
        </div>
      </div>

      {/* Weekly & Monthly Distinct Students Charts */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          marginBottom: 'var(--spacing-lg)'
        }}
      >
        {/* Weekly Distinct Students Chart */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--spacing-lg)' }}>
            주별 참여 학생 수
          </h3>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-gray-500)', marginBottom: 'var(--spacing-lg)' }}>
            매주 1회 이상 출석한 고유 학생 수 (최근 8주)
          </div>
          {weeklyDistinctStudents.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyDistinctStudents} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 10, fill: 'var(--color-gray-600)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-gray-200)' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--color-gray-600)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-gray-200)' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--color-gray-200)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-md)'
                  }}
                  labelStyle={{ color: 'var(--color-gray-700)', fontWeight: 600 }}
                  formatter={(value) => [`${value}명`, '참여 학생']}
                />
                <Bar
                  dataKey="학생수"
                  fill="var(--color-primary)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={35}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding: 'var(--spacing-xl)' }}>
              <div className="empty-state-description">데이터를 불러오는 중...</div>
            </div>
          )}
        </div>

        {/* Monthly Distinct Students Chart */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--spacing-lg)' }}>
            월별 참여 학생 수
          </h3>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-gray-500)', marginBottom: 'var(--spacing-lg)' }}>
            매월 1회 이상 출석한 고유 학생 수 (최근 6개월)
          </div>
          {monthlyDistinctStudents.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyDistinctStudents} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: 'var(--color-gray-600)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-gray-200)' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--color-gray-600)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-gray-200)' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--color-gray-200)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-md)'
                  }}
                  labelStyle={{ color: 'var(--color-gray-700)', fontWeight: 600 }}
                  formatter={(value) => [`${value}명`, '참여 학생']}
                />
                <Bar
                  dataKey="학생수"
                  fill="var(--color-success)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={50}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding: 'var(--spacing-xl)' }}>
              <div className="empty-state-description">데이터를 불러오는 중...</div>
            </div>
          )}
        </div>
      </div>

      {/* Class Distinct Students & Students by Age Charts */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          marginBottom: 'var(--spacing-lg)'
        }}
      >
        {/* Class Distinct Students Chart */}
        {classDistinctStudents.length > 0 && (
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 'var(--spacing-lg)' }}>
              수업별 참여 학생 수
            </h3>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-gray-500)', marginBottom: 'var(--spacing-lg)' }}>
              각 수업에 1회 이상 출석한 고유 학생 수 (지난달)
            </div>
            <ResponsiveContainer width="100%" height={Math.max(200, classDistinctStudents.length * 40)}>
              <BarChart
                data={classDistinctStudents}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: 'var(--color-gray-600)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-gray-200)' }}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12, fill: 'var(--color-gray-700)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-gray-200)' }}
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--color-gray-200)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-md)'
                  }}
                  labelStyle={{ color: 'var(--color-gray-700)', fontWeight: 600 }}
                  formatter={(value) => [`${value}명`, '참여 학생']}
                />
                <Bar
                  dataKey="학생수"
                  fill="var(--color-success)"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={30}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Students by Age Chart */}
        {studentsByAge.length > 0 && (
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 'var(--spacing-lg)' }}>
              나이별 학생 수
            </h3>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-gray-500)', marginBottom: 'var(--spacing-lg)' }}>
              등록된 학생의 나이 분포
            </div>
            <ResponsiveContainer width="100%" height={Math.max(200, studentsByAge.length * 40)}>
              <BarChart
                data={studentsByAge}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: 'var(--color-gray-600)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-gray-200)' }}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="age"
                  tick={{ fontSize: 12, fill: 'var(--color-gray-700)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-gray-200)' }}
                  width={50}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--color-gray-200)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-md)'
                  }}
                  labelStyle={{ color: 'var(--color-gray-700)', fontWeight: 600 }}
                  formatter={(value) => [`${value}명`, '학생 수']}
                />
                <Bar
                  dataKey="학생수"
                  fill="var(--color-primary)"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={30}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Attendance Students Modal */}
      {attendanceModal && (
        <div
          onClick={() => setAttendanceModal(null)}
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
            padding: 'var(--spacing-md)'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
              maxWidth: '400px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto'
            }}
          >
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 'var(--spacing-lg)',
              borderBottom: '1px solid var(--color-gray-200)'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-gray-900)' }}>
                  {attendanceModal.className}
                </h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                  {formatDate(attendanceModal.date)} · {attendanceModal.students.length}명 출석
                </div>
              </div>
              <button
                onClick={() => setAttendanceModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: 'var(--color-gray-400)',
                  padding: '4px',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Body - Student List */}
            <div style={{ padding: 'var(--spacing-md)' }}>
              {attendanceModal.students.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--spacing-lg)', color: 'var(--color-gray-500)' }}>
                  출석한 학생이 없습니다.
                </div>
              ) : (
                attendanceModal.students.map((student, idx) => (
                  <div
                    key={student.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: 'var(--spacing-sm) var(--spacing-md)',
                      backgroundColor: idx % 2 === 0 ? 'var(--bg-primary)' : 'var(--color-gray-50)',
                      borderRadius: 'var(--radius-sm)'
                    }}
                  >
                    <span style={{ fontWeight: 500, color: 'var(--color-gray-900)' }}>
                      {student.name}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-gray-500)' }}>
                      {calculateAge(student.birthdate) !== null ? `${calculateAge(student.birthdate)}세` : '-'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Dashboard;
