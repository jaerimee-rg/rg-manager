# JR 리듬체조 (rg-manager)

리듬체조 학원의 수업 출석을 관리하는 웹 애플리케이션입니다. 서비스 이름은 **JR 리듬체조**,
로고는 `client/public/logo-mark.png` 입니다.

## 주요 기능

- **학생 관리**: 학생 정보 등록, 수정, 삭제
- **수업 관리**: 수업 스케줄 및 정보 관리
- **출석 체크**: 날짜별, 수업별 출석 체크 및 조회
- **대시보드**: 전체 통계 및 오늘의 출석 현황

## 기술 스택

### 프론트엔드
- React 18
- React Router
- Vite
- LocalStorage (데이터 저장)

### 백엔드
- Node.js
- Express
- In-memory 데이터 저장

## 프로젝트 구조

```
new-project/
├── client/              # React 프론트엔드
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Students/      # 학생 관리 컴포넌트
│   │   │   ├── Classes/       # 수업 관리 컴포넌트
│   │   │   └── Attendance/    # 출석 체크 컴포넌트
│   │   ├── pages/             # 페이지 컴포넌트
│   │   ├── services/          # API 서비스
│   │   ├── utils/             # 유틸리티 함수
│   │   └── styles/            # 스타일 파일
│   └── package.json
│
└── server/              # Node.js 백엔드
    ├── routes/          # API 라우트
    ├── controllers/     # 컨트롤러
    ├── models/          # 데이터 모델
    └── package.json
```

## 설치 및 실행

### 1. 의존성 설치

#### 클라이언트
```bash
cd client
npm install
```

#### 서버
```bash
cd server
npm install
```

### 2. 실행

#### 개발 모드

터미널 1 - 클라이언트 실행:
```bash
cd client
npm run dev
```

터미널 2 - 서버 실행 (선택사항):
```bash
cd server
npm run dev
```

### 3. 접속

브라우저에서 `http://localhost:3000` 접속

## 사용 방법

1. **학생 등록**: '학생 관리' 메뉴에서 학생 정보 등록
2. **수업 등록**: '수업 관리' 메뉴에서 수업 정보 등록
3. **출석 체크**: '출석 체크' 메뉴에서 날짜와 수업을 선택하고 출석 체크
4. **통계 확인**: 대시보드에서 전체 현황 확인

## 데이터 저장

현재 버전은 브라우저의 LocalStorage를 사용하여 데이터를 저장합니다.
- 데이터는 브라우저에 저장되어 기기별로 관리됩니다
- 브라우저 캐시를 삭제하면 데이터가 사라질 수 있으니 주의하세요

## 향후 개선 사항

- 데이터베이스 연동 (MongoDB, PostgreSQL 등)
- 사용자 인증 시스템
- 출석 통계 및 리포트 기능
- 학부모 알림 기능
- 모바일 앱 버전
- 데이터 백업 및 복원 기능
