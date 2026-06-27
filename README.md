# 📸 Social Screenshot Studio

소셜 미디어(X/Twitter, YouTube 커뮤니티, Telegram) 포스트 링크를 입력하여, 다양하고 트렌디한 그라데이션 배경 액자에 담긴 고해상도 디자인 에셋으로 변환해주는 **고정밀 스크린샷 캔버스 도구**입니다.

이 앱은 백엔드의 강력한 Playwright 헤드리스 드라이버를 통해 실제 웹페이지를 렌더링하며, 긴 본문글도 자동으로 '자세히 알아보기(더 보기)' 버튼을 눌러 완전한 렌더링 상태를 포착한 뒤 고품질 이미지 카드로 생성합니다.

---

## ✨ 핵심 기능 (Key Features)

- **🚀 다중 플랫폼 완벽 지원**:
  - **X (Twitter)**: 트윗 본문, 이미지, 상호작용 지표를 포함한 깔끔한 카드 레이아웃.
  - **YouTube**: 유튜브 커뮤니티 게시판의 포스트 본문 및 채널 메타데이터 렌더링.
  - **Telegram**: 텔레그램 공개 채널 메시지의 미디어 및 글 구성요소 렌더링.
- **🔍 "자세히 알아보기 / 더 보기" 자동 확장**:
  - YouTube 커뮤니티 포스트 등에서 글 본문이 길어 생략된 경우, Playwright 크롤러가 자동으로 **'자세히 알아보기'** 또는 **'더 보기'** 버튼을 실시간으로 감지하고 클릭하여 본문 전문이 포함된 완벽한 상태의 카드를 캡처합니다.
- **🎨 캔버스 테마 및 액자 커스텀**:
  - **브라우저 테마**: 라이트(Light) 및 다크(Dark) 모드를 자유롭게 전환하며 캡처 가능.
  - **액자 배경**: 트렌디하고 감각적인 8가지 이상의 색상 그라데이션(Aurora, Sunset, Cosmic Slate 등) 배경 선택.
- **💾 원클릭 내보내기 & 지능형 공유**:
  - **고해상도 이미지 다운로드**: 완성된 디자인 카드를 고해상도 PNG 파일로 즉시 저장.
  - **클립보드 이미지 복사 (Copy Image)**: 브라우저 클립보드에 PNG 바이너리 자체를 복사하여, 카카오톡, Telegram, Slack, Notion 등에 바로 **Ctrl+V(붙여넣기)**로 빠르게 전달 가능.
- **🐦 X (Twitter) 즉시 연동 공유**:
  - 생성 완료 후 X 버튼을 통해 리포스트(Repost)하거나 스크린샷과 소스 링크를 함께 트윗할 수 있는 빠른 트윗 작성 링크 지원.

---

## 🛠️ 기술 스택 (Tech Stack)

### Client (Frontend)
- **Framework**: React 18 with Vite (TypeScript)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Animation**: Framer Motion (`motion/react`)

### Server (Backend)
- **Runtime**: Node.js (Express Server)
- **Scraping & Capture**: Playwright (Chromium Headless)
- **Bundler**: esbuild

---

## 💻 로컬 개발 시작하기 (Getting Started)

### 1. 패키지 설치
```bash
npm install
```

### 2. Playwright 브라우저 설치
```bash
npx playwright install chromium
```

### 3. 개발 서버 실행
Vite 개발 프론트엔드와 Express API 백엔드가 하나의 프로세스로 통합 구동됩니다.
```bash
npm run dev
```
브라우저에서 `http://localhost:3000`으로 접속하여 실행 상태를 확인할 수 있습니다.

---

## 💡 유용한 사용 팁
1. **더 쉬운 공유**: 스크린샷이 생성되면, 파란색 **'클립보드 이미지 복사'** 버튼을 누른 뒤 사용 중인 메신저(카카오톡, 디스코드 등) 채팅창에 바로 **Ctrl + V**를 입력하여 즉시 이미지를 공유해보세요. 파일 다운로드를 거치지 않아 매우 신속합니다.
2. **스크롤바 최소화**: 캔버스 프리뷰 워크스페이스는 한눈에 카드가 쏙 들어오도록 비율을 맞춰 설계되어 있어 불필요한 스크롤 발생 없이 작업할 수 있습니다.
