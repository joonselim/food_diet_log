# ProteinAgent — 다음 할 일

## 🚨 지금 결정할 것: Atlas 용량 전략

**Atlas 연결 ✅** (`food-diet-agent.kqeq6ht.mongodb.net`, DB `protein_agent`).
하지만 M0 무료티어(512MB)에 USDA 데이터를 다 넣을지가 문제.

### 측정한 실제 용량
| 항목 | 크기 |
|---|---|
| foods 데이터 (compressed) | 229 MB |
| 인덱스 (text + unique + upc) | 188 MB |
| **합계** | **417 MB** |
| Atlas M0 한도 | **512 MB** |
| sample_mflix (Atlas 기본 샘플) | 101 MB |

→ M0에 417 + 101 = 518MB → **1MB 초과**. sample_mflix 지워야 들어감.

### 선택지

**(a) sample_mflix 삭제 → Atlas M0 그대로 사용** ✨ 추천
- 헤드룸 ~95MB (meal_logs 약 100만 entry 가능)
- 무료. 임포트 ~10-30분(인터넷 업로드 속도에 따라)
- 진짜 유저 모이면 그때 업그레이드

**(b) M2 업그레이드 ($9/mo, 2GB)**
- 여유롭게. App Store 출시 후에도 한참 OK
- 신용카드 등록 필요

**(c) 로컬 Docker 유지 (Atlas 안 씀)**
- Dev는 그대로 로컬, 출시 직전에 Atlas로 마이그레이션
- 가장 가볍지만 결국 같은 작업 두 번

→ **결정 필요. (a) 선택 시 다음 명령으로 진행**:
```bash
# 1. sample_mflix 삭제 (Atlas UI 또는 mongosh에서)
# 2. Atlas로 USDA 임포트 (10-30분)
cd backend
npm run import:usda
npm run indexes
npm run ping       # 결과 확인
```

### ⚠️ 보안: 비밀번호 회전 권장
채팅에 평문으로 비번 노출됨. Atlas → Database Access에서 한 번 회전(rotate) 후 `backend/.env`의 `MONGO_URI` 갱신.

---

## ✅ 끝낸 것

- MongoDB 8 (Docker 컨테이너 `protein-mongo`, 포트 27017)
- USDA 임포트 → `protein_agent.foods` 컬렉션 1,870,128건
- 인덱스: text(name×10, brand×5) + unique(source, source_id) + sparse(upc)
- Express 검색 API (포트 4000)
  - `GET /health`
  - `GET /foods/search?q=&limit=&offset=`
  - `GET /foods/:id`
  - `GET /foods/by-upc/:upc`
- 백엔드: 식단 로그 API (`meal_logs` 컬렉션)
  - `GET /meals/:date`
  - `POST /meals/:date/:slot/entries`
  - `DELETE /meals/:date/:slot/entries/:index`
  - `PUT /meals/:date/goals`
- 백엔드: Claude Vision API
  - `POST /analyze` → base64 이미지 → 음식 인식 + 영양소 추정
- 모바일 (Expo + TypeScript)
  - 네비게이션: Home → MealRegister → FoodSearch
  - HomeScreen: 오늘의 섭취량 요약 + 진행바 + 아침/점심/저녁 슬롯
  - MealRegisterScreen: 📷 카메라 / 🖼 앨범 → AI 분석 → 체크박스로 선택 추가
  - FoodSearchScreen: 검색 → 그램 입력 모달 → 추가
  - 스토리지: 백엔드 우선, AsyncStorage 캐시 폴백

## ⚠️ Claude Vision 사용 전 필수 설정

```bash
# 백엔드 실행 시 ANTHROPIC_API_KEY 환경변수 필요
cd backend
ANTHROPIC_API_KEY=sk-ant-... npm start
```

## 📋 남은 작업

1. **앱 아이콘 / splash** — `app.json` 업데이트 + assets
2. **EAS Build** — App Store 배포용 빌드 설정
3. **프로덕션 DB** — MongoDB Atlas M10 (~$57/mo) or EC2 자체호스팅

## 🐛 알려진 버그 / 코드 리뷰 결과

1. **`backend/src/analyze.js`의 모델 ID `claude-opus-4-7`는 존재하지 않음** — 호출 시 404 날 것.
   - PRD대로 Haiku 쓰려면 `claude-haiku-4-5` 같은 유효 ID로 교체 필요
   - 추천: `claude-haiku-4-5` (빠르고 저렴, vision 지원)

2. **`mobile/src/api.ts`의 `BASE = 'http://localhost:4000'`** — iOS 시뮬레이터만 동작.
   - **실제 폰 (Expo Go)** 에선 Mac의 LAN IP 필요 (예: `http://192.168.1.42:4000`)
   - **Android 에뮬레이터**는 `http://10.0.2.2:4000`
   - 환경변수로 분리 권장: `app.json`의 `extra` 필드 또는 `expo-constants` 사용

## 🔮 MVP 마무리 이후

- 사진 저장: AWS S3 (분석한 이미지 기록용)
- 인증/로그인 (멀티 디바이스 동기화 필요 시점에)
- Open Food Facts: 글로벌 확장 시 재검토
- USDA 데이터 dups / UPC 정규화 / brand 정리

## 🛠 자주 쓸 명령

```bash
# MongoDB 컨테이너
docker ps --filter name=protein-mongo
docker start protein-mongo
docker exec -it protein-mongo mongosh protein_agent

# 백엔드 API
cd backend
ANTHROPIC_API_KEY=sk-ant-... npm run dev    # watch 모드 + Vision 활성화
npm start                                   # Vision 없이도 나머지 기능은 동작

# 모바일
cd mobile
npx expo start --ios --localhost

# 데이터 확인
docker exec protein-mongo mongosh protein_agent --quiet --eval 'db.foods.countDocuments()'
docker exec protein-mongo mongosh protein_agent --quiet --eval 'db.meal_logs.find().pretty()'
curl -s "http://localhost:4000/meals/$(date +%F)" | jq
```

## 📁 프로젝트 구조

```
food_diet/
├── food_data/                  # raw USDA + OFF 덤프 (gitignore)
├── backend/
│   ├── src/
│   │   ├── server.js           # Express API (foods + meals + analyze)
│   │   ├── db.js               # MongoDB 클라이언트
│   │   ├── meals.js            # 식단 로그 CRUD
│   │   ├── analyze.js          # Claude Vision 통합
│   │   └── clean.js            # title-case, UPC 정규화
│   ├── scripts/import/
│   │   ├── usda.js
│   │   └── indexes.js
│   └── package.json
├── mobile/
│   ├── App.tsx                 # NavigationContainer + Stack
│   └── src/
│       ├── types.ts
│       ├── api.ts              # fetch wrappers (foods, meals, analyze)
│       ├── storage.ts          # 백엔드 우선 + AsyncStorage 폴백
│       └── screens/
│           ├── HomeScreen.tsx
│           ├── MealRegisterScreen.tsx   ← 카메라/AI 분석 포함
│           └── FoodSearchScreen.tsx
└── NEXT.md
```
