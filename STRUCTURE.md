# Yacht Dice - 프로젝트 구조 및 파일별 역할 가이드 (STRUCTURE.md)

본 문서는 ES Modules(네이티브 import/export)와 CSS 모듈 시스템을 적용하여 대대적으로 리팩토링된 **Yacht Dice (야추 다이스)** 프로젝트의 디렉토리 구성과 개별 파일들의 구체적인 책임 및 의존 관계를 기술합니다.

---

## 1. 전체 디렉토리 및 파일 트리 (Directory Tree)

프로젝트의 전체 폴더 및 파일 구조는 다음과 같습니다:

```text
야추다이스/
│
├── index.html                   # 애플리케이션의 유일한 마크업 및 돔 마운트 진입점
├── style.css                    # CSS 메인 오케스트레이터 (서브 CSS 통합 허브)
├── game.js                      # 메인 자바스크립트 엔트리 포인트 및 UI 오케스트레이터
├── network.js                   # PeerJS 기반 실시간 P2P 멀티플레이어 통신 제어 모듈
├── STRUCTURE.md                 # [본 문서] 전체 파일 구조 및 역할 정의서
│
├── css/                         # 스타일시트 컴포넌트 디렉토리
│   ├── variables.css            # 전역 폰트, CSS 변수 및 공통 버튼/패널 유틸리티 스타일
│   ├── lobby.css                # 로비 화면, 모드 선택 카드 및 방 대기실 설정 UI
│   ├── board.css                # 대칭 헤더, 점수판 테이블, 턴 표시기, 사이드바 채팅 레이아웃
│   ├── dice.css                 # 960px 트레이, 3D/2D 주사위, 3D 컵 실린더 렌더링 및 물리 애니메이션
│   └── overlays.css             # 모달 오버레이, 족보 세레머니, 플로팅 이모지 및 미디어 쿼리
│
└── modules/                     # 자바스크립트 논리 서브 모듈 디렉토리
    ├── state.js                 # 전역 공유 반응형 게임 상태 및 카테고리 상수 매핑
    ├── sound.js                 # Web Audio API 기반 효과음 합성 신시사이저 엔진
    ├── scoring.js               # 순수한 주사위 조합 득점 점수 계산 엔진 (순수 함수)
    ├── physics.js               # Matter.js 주사위 물리 및 컵 드래그/관성 제스처 물리 엔진
    └── ai.js                    # 난이도별(Easy/Normal/Hard) AI 의사결정 Heuristic 알고리즘
```

---

## 2. 파일별 역할 및 책임 상세 정의서

### 🟨 HTML & CSS (화면 마크업 및 프리미엄 비주얼 레이어)

| 파일명 | 경로 | 주요 역할 및 책임 |
| :--- | :--- | :--- |
| **index.html** | `index.html` | - 게임의 유일한 DOM 구조 마크업을 제공합니다.<br>- 외부 CDN 라이브러리(PeerJS, Canvas-Confetti, Matter.js)를 로드합니다.<br>- 메인 스타일시트(`style.css`)와 모듈 스크립트(`game.js`, `network.js`)를 로딩합니다. |
| **style.css** | `style.css` | - **CSS 메인 오케스트레이터**입니다.<br>- 5개로 세밀히 분할된 서브 스타일시트(`css/*.css`)를 `@import` 구문으로 가져와 단일 링크로 통합 관리합니다. |
| **variables.css** | `css/variables.css` | - 전역 Outfit/Noto Sans 폰트 공급 및 전역 CSS Variables 색상 테마를 정의합니다.<br>- 웹 브라우저 공통 초기화(Reset) 및 유리모피즘 패널(`.glass-panel`), 네온 버튼(`.neon-btn`) 등 공통 컴포넌트 스타일을 관리합니다. |
| **lobby.css** | `css/lobby.css` | - 로비 화면, 플레이 모드 선택 카드(싱글/로컬/멀티) 및 호스트/클라이언트 세부 방 설정창의 레이아웃과 트랜지션을 담당합니다. |
| **board.css** | `css/board.css` | - 헤더 영역, 실시간 턴 표시 대칭 배너, 남은 롤 횟수 트래커 및 점수판 테이블(`.score-table`), 사이드바 레이아웃 스타일을 제어합니다. |
| **dice.css** | `css/dice.css` | - 960px 트레이 보드, 3D 원통 Z-stacking 적층 컵, 뚜껑 및 베젤, 컵 안쪽 딥블랙 공간, 3D 미니 주사위 큐브, 3D 주사위 큐브 회전면, 2D 폴백 주사위, 컵 흔들기/쏟기 애니메이션을 제어합니다. |
| **overlays.css** | `css/overlays.css` | - 게임 오버 결과창 모달, 최고 족보 달성 시 웅장하게 회전하는 후광 라이트 레이 및 5가지 족보별 커스텀 네온 광채 세레머니, 플로팅 이모지 애니메이션, 모바일 최적화 미디어 쿼리 오버라이딩을 처리합니다. |

---

### 🟩 JavaScript Modules (비즈니스 로직 및 코어 엔진 레이어)

| 파일명 | 경로 | 주요 역할 및 책임 |
| :--- | :--- | :--- |
| **game.js** | `game.js` | - **전체 애플리케이션의 핵심 엔트리(Entry)이자 UI 오케스트레이터**입니다.<br>- 서브 모듈들(`modules/*`)을 `import`하여 유기적으로 엮어줍니다.<br>- 턴 진행 라이프사이클 관리, 점수 기입 비즈니스 흐름, UI 이벤트 바인딩 및 화면 갱신 렌더링을 일괄 제어합니다. |
| **network.js** | `network.js` | - PeerJS 기반 **P2P 실시간 멀티플레이어 통신 모듈**입니다.<br>- 방 개설(Host) 및 입장(Client) 처리를 캡슐화합니다.<br>- 롤링 결과값, 킵 상태 배열, 기입 점수, 채팅, 이모지 등 통신 데이터 동기화 처리를 완벽하게 전담합니다. |
| **state.js** | `modules/state.js` | - 전역 **반응형 게임 상태 및 상수 데이터 공급자**입니다.<br>- 플레이어 현황, 주사위 배열 정보, 롤 카운트 등 전체 모듈이 공통으로 접근하고 신뢰할 수 있는 글로벌 `state` 반응형 데이터 객체와 Yacht 카테고리(`CATEGORIES_LIST`) 상수를 정의합니다. |
| **sound.js** | `modules/sound.js` | - Web Audio API 기반 **신시사이저 효과음 합성 엔진**입니다.<br>- 대역폭을 차단하는 오디오 파일 다운로드 방식 대신, 브라우저 내장 자원만을 활용하여 자갈 흔들기, 플라스틱 충돌음, Retro Chime 및 Yacht 달성 팡파레/박수 갈채 등의 다채로운 효과음 주파수를 동적 생성해 재생합니다. |
| **scoring.js** | `modules/scoring.js` | - Yacht Dice **조합 점수 연산기**입니다.<br>- 주사위 5개의 눈 배열값만을 입력받아 12가지 카테고리의 획득 점수맵을 오차 없이 기계적으로 계산해주는 무결성 **Pure Function(순수 수학 함수)**으로 구성되어 있습니다. |
| **physics.js** | `modules/physics.js` | - **Matter.js 기반 2D/3D 기하학 물리 엔진**입니다.<br>- 3D 주사위 텀블링, 안착 윗면 판정 기하학 연산, 3D 컵 실린더 드래그 관성 물리 및 제스처 셰이킹 감지, 주사위 간 수평 겹침 해소 Solver와 수평 가로 일렬 자동 정렬(`arrangeActiveDiceInLine`) 로직을 처리합니다. |
| **ai.js** | `modules/ai.js` | - 난이도별(쉬움/보통/어려움) **AI 봇 의사결정 Heuristic 시뮬레이터**입니다.<br>- AI 차례가 되었을 때 현재 주사위 눈 현황과 점수맵 데이터를 입력받아, 어떤 주사위를 킵해야 하는지(`getAIKeeps`), 어떤 칸에 점수를 기입해야 하는지(`getAIScoreChoice`)를 순수한 Heuristics 및 기댓값 근사 수학으로 연산하여 메인에 던져줍니다. |

---

## 3. 모듈 간 의존 구조 (Dependency Flow)

모듈 설계는 아래와 같이 상위 모듈이 하위 모듈을 감싸는 **단방향 흐름 규칙**을 엄격히 준수합니다:

1. **상태(`state.js`) 및 기본 유틸(`scoring.js`, `sound.js`)**은 어떠한 상위 모듈도 참조할 수 있는 최하위 종속성입니다.
2. **물리(`physics.js`)**는 드래그 모션을 구현하기 위해 `state`와 `sound`를 결합하여 처리합니다.
3. **AI(`ai.js`)**는 기댓값 판단 연산을 위해 득점 계산기인 `scoring.js`만을 사용하고 UI 렌더러에는 관여하지 않습니다.
4. **메인 오케스트레이터(`game.js`)**는 최상위에서 모든 모듈을 호출하여 UI/이벤트를 묶어주는 컨트롤러(Controller) 역할을 합니다.
5. **네트워크(`network.js`)**는 P2P 동기화를 위해 `game.js`가 노출한 라이프사이클 바인딩 인터페이스를 통해 안전하게 소통합니다.

---

## 💡 개발자용 유지보수 & 기능 추가 가이드 (Maintenance Guide)

새로운 기획 요소를 확장하거나 기획 수치 조정을 희망할 시 아래의 파일들만 열어서 수정하시면 안전하게 반영됩니다:

*   **새로운 족보(예: 원페어, 쓰리페어 등)를 추가하고 싶을 때**:
    1. 🟩 `modules/state.js` -> `CATEGORIES` 객체에 신규 카테고리 추가
    2. 🟩 `modules/scoring.js` -> `calculateScores()`와 `getCategoryLabel()` 함수에 해당 족보 점수 계산식과 라벨 추가
    3. ⬜ `index.html` -> 스코어 테이블 마크업에 새 `tr` 행 양식 추가
*   **효과음 주파수 음역대 및 재생 시간(Ramp)을 튜닝하고 싶을 때**:
    *   🟩 `modules/sound.js` -> `playNoise()`나 `playKeep()` 등의 Web Audio API Oscillator/Gain 주파수/시간값 조정
*   **주사위 마찰력, 안착 탄성, 정지 판단 감도를 조정하고 싶을 때**:
    *   🟩 `modules/physics.js` -> `physicsEngine` 객체 내의 `bounce`(벽면 탄성), `diceBounce`(주사위 상호 탄성), `minVelocity`(안착 임계값) 파라미터 미세 조정
*   **AI 봇의 기댓값 Heuristic 가중치를 다듬어 난이도를 높이고 싶을 때**:
    *   🟩 `modules/ai.js` -> `getHardAIScoreChoice()` 함수 안의 각 족보별 `utility` 변수 가중치 튜닝

---

## 💡 로컬 구동 필수 권고 (CORS 보안 안내)

> [!IMPORTANT]
> **로컬 웹 서버 구동 필수**
> - 네이티브 ES Modules의 브라우저 보안 정책(CORS)에 따라, HTML 파일을 마우스 더블클릭(`file://` 프로토콜)으로 직접 실행하면 모듈 로딩 상의 오류가 발생합니다.
> - 반드시 **VS Code Live Server**, Python 간이 서버, 또는 Node dev server 환경 등을 통해 웹 서버 호스팅 방식으로 `index.html`을 로드해 주세요.
