// 요일 변환 함수
const getDayOfWeek = (dateString) => {
  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const date = new Date(dateString);
  return days[date.getDay()];
};

// 출석 결과 이메일 발송
export const sendAttendanceEmail = async ({ date, className, schedule, students, presentStudentIds }) => {
  // nodemailer를 동적으로 import (설치되지 않았어도 서버가 시작되도록)
  let nodemailer;
  try {
    nodemailer = await import('nodemailer');
  } catch (importError) {
    console.error('nodemailer 모듈을 찾을 수 없습니다:', importError.message);
    return { success: false, error: 'nodemailer 모듈이 설치되지 않았습니다.' };
  }

  // Gmail SMTP 설정 (포트 587 TLS 사용 - 클라우드 환경에서 더 안정적)
  const transporter = nodemailer.default.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // TLS 사용
    auth: {
      user: process.env.EMAIL_USER || 'jay.jaewoong.choi@gmail.com',
      pass: process.env.EMAIL_PASS || 'gkij hwut ulas anxh'
    },
    connectionTimeout: 10000, // 10초
    greetingTimeout: 10000,
    socketTimeout: 10000
  });

  const dayOfWeek = getDayOfWeek(date);

  // 학생 목록 HTML 테이블 생성
  const studentRows = students.map((student, index) => {
    const isPresent = presentStudentIds.includes(student.id);
    const statusText = isPresent ? '출석' : '결석';
    const statusColor = isPresent ? '#10b981' : '#ef4444';
    const bgColor = index % 2 === 0 ? '#f9fafb' : '#ffffff';

    return `
      <tr style="background-color: ${bgColor};">
        <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: center;">${index + 1}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb;">${student.name}</td>
        <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: center; color: ${statusColor}; font-weight: bold;">${statusText}</td>
      </tr>
    `;
  }).join('');

  const presentCount = presentStudentIds.length;
  const totalCount = students.length;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; }
      </style>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f3f4f6;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <!-- 헤더 -->
        <div style="background-color: #6366f1; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">출석 체크 결과</h1>
        </div>

        <!-- 수업 정보 -->
        <div style="padding: 20px; border-bottom: 1px solid #e5e7eb;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #374151; width: 100px;">날짜</td>
              <td style="padding: 8px 0; color: #6b7280;">${date} (${dayOfWeek})</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #374151;">수업명</td>
              <td style="padding: 8px 0; color: #6b7280;">${className}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #374151;">수업 시간</td>
              <td style="padding: 8px 0; color: #6b7280;">${schedule}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #374151;">출석률</td>
              <td style="padding: 8px 0; color: #6b7280;">${presentCount}명 / ${totalCount}명</td>
            </tr>
          </table>
        </div>

        <!-- 학생 목록 테이블 -->
        <div style="padding: 20px;">
          <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #374151;">학생 출석 현황</h2>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb;">
            <thead>
              <tr style="background-color: #6366f1; color: white;">
                <th style="padding: 12px; border: 1px solid #e5e7eb; width: 50px;">번호</th>
                <th style="padding: 12px; border: 1px solid #e5e7eb;">이름</th>
                <th style="padding: 12px; border: 1px solid #e5e7eb; width: 80px;">출석</th>
              </tr>
            </thead>
            <tbody>
              ${studentRows}
            </tbody>
          </table>
        </div>

        <!-- 푸터 -->
        <div style="background-color: #f9fafb; padding: 15px; text-align: center; color: #9ca3af; font-size: 12px;">
          JR 리듬체조에서 자동 발송된 이메일입니다.
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER || 'jay.jaewoong.choi@gmail.com',
    to: 'jay.jaewoong.choi@gmail.com',
    subject: `[출석체크] ${date} ${className} - ${presentCount}/${totalCount}명 출석`,
    html: htmlContent
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('출석 이메일 발송 완료:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('이메일 발송 실패:', error);
    return { success: false, error: error.message };
  }
};

export default { sendAttendanceEmail };
