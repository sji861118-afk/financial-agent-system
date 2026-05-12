# Skills Audit — 글로벌 스킬 사용 현황

**작성일**: 2026-04-28
**작성 목적**: 누적된 글로벌 스킬 14개를 본 프로젝트 사용 빈도/중복 관점에서 분류. **글로벌 스킬 디렉토리(`~/.claude/skills/`)는 다른 프로젝트와 공유되므로 본 프로젝트 작업에서 임의로 삭제하지 않는다** — 이 문서는 향후 정리 시 참고용.

---

## 분류

### [PROJECT 직접 활용] — 본 프로젝트 작업 흐름에 자주 등장
| 스킬 | 위치 | 용도 |
|---|---|---|
| `docx-output` | `~/.claude/skills/docx-output/` (1.0KB) | Word 코멘트 삽입 + 요약 생성 |
| `docx-parser` | `~/.claude/skills/docx-parser/` (960B) | DOCX→JSON 구조 추출 (mammoth.js + JSZip) |
| `docx_export` | `~/.claude/skills/docx_export/` (2.1KB) | 검토의견 .docx 생성 |
| `doc_classifier` | `~/.claude/skills/doc_classifier/` (2.1KB) | 문서 유형 분류 + 텍스트 추출 |
| `dedup` | `~/.claude/skills/dedup/` | 딜 중복 감지 |
| `condition-extractor` | `~/.claude/skills/condition-extractor/` | 조건 이미지 → JSON Vision 추출 |

### [중복 의심] — 동일 목적의 두 스킬 공존
- **`docx-output` vs `docx_export`**: 둘 다 Word 문서 출력. **본 프로젝트 코드(`app/src/`)에서 실제 import/호출되는지 확인 필요**.
  - 권장 액션 (별도 세션에서):
    1. `Grep --pattern "docx-output|docx_export" --path app/src/` 실행
    2. 사용처 0이면 둘 다 unused (글로벌 스킬은 다른 프로젝트와 공유, 그래도 unused 확인 후 한쪽 deprecation 마킹)
    3. 한쪽만 사용되면 다른 쪽 deprecate

### [PROJECT 무관] — 다른 프로젝트용
- `news-kakao` — 부동산/기업금융 뉴스 카카오톡 자동화
- `yt-search`, `yt-status`, `yt-sync` — `C:\Users\OK\yt-knowledge\lectures\` 강의 노트 관리

### [GENERIC FRAMEWORK] — 메타 스킬, 본 프로젝트 직접 사용 X
- `autoresearch` — 스킬 자동 최적화 (Karpathy methodology)
- `blueprint` — agentic system design 인터뷰
- `deep-dive` — 요구사항 인터뷰
- `reflect` — 세션 마무리 + 문서화

---

## 누적 문제 진단 (시니어 관점)

1. **누적 속도**: 14개 글로벌 스킬 중 본 프로젝트 직접 활용은 6개 (43%). 나머지 8개는 **다른 컨텍스트에서 SKILL 토큰을 차지**.
2. **중복 패턴**: `docx-output`/`docx_export` — 이름이 비슷하지만 둘 다 살아있음 → 새 멤버가 어떤 걸 쓸지 혼란.
3. **글로벌 vs 프로젝트 스코프**: `~/.claude/skills/`는 모든 프로젝트에서 보임. 이 프로젝트 전용 스킬을 분리하려면 `.claude/skills/` (project-local)로 이동해야 하는데, 현재 본 프로젝트에는 project-local 스킬 0개.

## 권장 후속 작업 (별도 세션)

1. **사용처 grep**: `app/src/`에서 `docx-output`, `docx_export` 호출 흔적 추적.
2. **글로벌→프로젝트 스코프 이동**: 본 프로젝트 전용으로 사용되는 스킬 (예: `dedup`, `condition-extractor`)을 `.claude/skills/`로 옮길지 검토. 다른 프로젝트에서도 재사용한다면 그대로 글로벌 유지.
3. **duplicate cleanup**: `docx-output`/`docx_export` 한쪽 deprecate.
4. **`yt-*` 분리**: 본 프로젝트와 무관하므로 글로벌 유지하되 본 작업 컨텍스트에서 노이즈 인지.

---

## 메모리 디렉토리 상태

`C:\Users\OK\.claude\projects\C--Users-OK-Documents-AI---1-------\memory\`:
- `MEMORY.md` (191B) — 인덱스
- `project_ebitda_da_extraction.md` (3.9KB) — 효성중공업 EBITDA D&A 추출 5단계 root cause 진단

이 메모리 파일은 매 세션 자동 로드되므로 **활성 정보만 유지**. 6개월 이상된 항목은 CHANGELOG로 이동 후 메모리에서 삭제 권장.
