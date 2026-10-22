# 🐾 냥냥 오피스 (nyang-office)

Claude Code가 지금 무슨 일을 하고 있는지 **도트 고양이 사무실**로 보여 주는 로컬 대시보드입니다.

Claude 팀장냥이 자기 책상에서 일을 나눠 주면, 방마다 상주하는 담당 고양이가 📨 편지를 받아 처리하고 답장을 돌려보냅니다. 터미널과 실시간으로 함께 움직여요.

![냥냥 오피스 화면](docs/screenshot.png)

## 등장 고양이

| 방 | 담당 | 맡는 일 (Claude Code 도구) |
|---|---|---|
| 📚 자료실 | 사서냥 | `Read` `Glob` `Grep` `Skill` — 책을 펴고 읽어요 |
| 💻 개발실 | 개발냥 | `Edit` `Write` `MultiEdit` `NotebookEdit` — iMac 화면에 코드가 흘러요 |
| 🗄️ 서버실 | 서버냥 | `Bash` `PowerShell` `Monitor` — 일하는 동안 랙 불빛이 빨라져요 |
| 🌐 정보검색실 | 검색냥 | `WebSearch` `WebFetch` · MCP 도구 — 지구본 모니터가 켜져요 |
| 🗒️ 회의실 | 기획냥 | `TodoWrite` · 계획 — 화이트보드에 실제 할 일 목록이 적혀요 |
| 🧑‍💻 집사 자리 | 집사(나) | `AskUserQuestion` `ExitPlanMode` — 질문 편지가 집사 책상으로 와요 |

- **Claude 팀장냥**: 생각할 땐 턱을 괴고 💭 구름 말풍선, 서브에이전트를 부를 땐 📞 전화
- **서브에이전트**: Explore(초록 모자), Plan(안경 쓴 검은 고양이)이 엘리베이터로 출근해 회의 테이블에 앉아 일을 맡기고, 끝나면 팀장에게 보고한 뒤 "👋 퇴근합니다!"
- **실패하면**: 담당 고양이가 식은땀을 흘리며 빨간 말풍선과 빨간 답장을 보내요
- **한가하면**: 담당은 앞을 보고 앉아 있다가 오래 쉬면 자리에서 졸고, 팀장냥은 [`idle.js`](public/js/idle.js) 규칙대로 쉬어요

## 층별 안내

- 프로젝트(폴더) 하나가 **층**, 그 안의 세션이 **매장**이에요.
- 층 이름은 Claude 데스크톱 앱 사이드바의 **세션 이름**을 따라가요(앱을 안 쓴 프로젝트는 폴더 이름).
- 기본은 가장 최근에 움직인 세션을 자동으로 따라가고, `/clear` 하면 같은 층의 새 세션으로 옮겨 가요.
- 층을 누르면 "▲ 3F" 엘리베이터 표시등이 뜨면서 그 층 사무실로 이동해요.

## 실행

Node.js 18 이상만 있으면 됩니다. 설치할 패키지는 없어요.

```bash
git clone https://github.com/LimQQ/nyang-office.git
cd nyang-office
node server.js
```

브라우저에서 <http://127.0.0.1:4777> 을 열어요. 기록 없이 구경만 하려면 <http://127.0.0.1:4777/?demo>.

## Claude Code 세션이 시작될 때 자동 실행 (선택)

`~/.claude/settings.json`에 SessionStart 훅을 추가하면, Claude Code 세션을 열 때 사무실이 저절로 켜져요.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"/절대/경로/nyang-office/start-office.js\"",
            "async": true,
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

- [`start-office.js`](start-office.js)는 서버가 **꺼져 있을 때만** 백그라운드로 켜고 브라우저를 한 번 열어요. 세션을 여러 개 열어도 탭이 늘어나지 않아요.
- 브라우저 없이 서버만 켜려면 명령 끝에 `--no-open`을 붙여요.
- 무슨 일이 있었는지는 `office.log`(훅), 서버 오류는 `server.log`에 남아요.

## 어떻게 동작하나

1. [`server.js`](server.js)가 `~/.claude/projects/**/*.jsonl`(Claude Code 세션 기록)을 0.25초마다 따라 읽어요. 마지막으로 읽은 바이트 위치만 기억해 새로 붙은 줄만 읽고, 덜 써진 줄은 바이트 그대로 남겨 한글이 깨지지 않게 해요.
2. 도구 호출·결과·생각·서브에이전트 출퇴근을 작은 이벤트로 바꿔 SSE(`/events`)로 브라우저에 보내요.
3. 서브에이전트 기록(`<세션>/subagents/agent-*.jsonl`)은 첫 프롬프트를 비교해 어떤 `Agent` 호출인지 짝지어요.
4. 데스크톱 앱의 세션 파일(`claude-code-sessions/**/local_*.json`)에서 `title`·`cliSessionId`·`cwd`만 읽어 층 이름을 붙여요.
5. 브라우저는 16×16 문자열 지도로 정의한 도트 스프라이트를 캔버스에 그려요. 외부 이미지 파일은 없어요.

**프라이버시**: 토큰을 쓰지 않고, Claude Code 설정을 바꾸지 않으며(자동 실행은 선택), `127.0.0.1`에서만 열리고 기록을 밖으로 보내지 않아요. 외부에서 받는 건 [Galmuri](https://github.com/quiple/galmuri) 픽셀 폰트(CDN)뿐이에요.

## 파일 구조

```
server.js           세션 기록 tail + SSE 서버
start-office.js     자동 실행용 스크립트 (SessionStart 훅)
public/
  index.html        화면 틀
  style.css         층별 안내 · 말풍선 · 업무 일지
  js/main.js        고양이 행동 · 편지 주고받기 · 층 이동
  js/office.js      사무실 지도 · 가구 · 길찾기
  js/sprites.js     16×16 도트 스프라이트와 고양이 생김새
  js/idle.js        팀장냥이 쉴 때 할 일 (직접 꾸미기)
  js/demo.js        데모 각본
```

## 직접 꾸미기

- **쉬는 시간**: [`public/js/idle.js`](public/js/idle.js)의 `chooseIdleActivity(idleSec, ctx)`가 `'desk'` `'groom'` `'wander'` `'nap'` 중 하나를 돌려주면 팀장냥이 그대로 행동해요.
- **수동 테스트**: `/?demo&manual`을 열고 브라우저 콘솔에서
  ```js
  office.handle({ k: 'tool', a: 'main', id: 't1', tool: 'Read', label: '📖 server.js' });
  office.advance(2); // 시간 2초 빨리 감기
  ```
- **환경 변수**: `PORT`(기본 4777), `CLAUDE_PROJECTS`(세션 기록 폴더), `CLAUDE_APP_SESSIONS`(데스크톱 앱 세션 폴더)

## 아이디어 출처

Threads [@cowboy76](https://www.threads.com/@cowboy76/post/DeqgY7wiJYa) 님이 소개한 "Claude Code 사무실"에서 영감을 받아, 방마다 담당 고양이가 편지를 주고받는 도트 고양이 버전으로 새로 만들었어요.
