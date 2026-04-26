# Brim — 작업 기록

## 앱 개요
사진 기반 식단 기록 + 정밀 영양소 검색 앱. 미국 App Store 타겟.

- **번들 ID**: `com.joonselim.brim`
- **Apple Developer**: joonlim92@gmail.com
- **스택**: React Native (Expo SDK 54) + Node.js + MongoDB Atlas
- **백엔드 배포**: Railway (`https://fooddietlog-production.up.railway.app`)
- **레포**: `github.com/joonselim/food_diet_log`

---

## 완료된 작업

### 1. 디자인 시스템 (BRIM)
- `mobile/src/theme.ts` — 컬러 팔레트, 폰트 패밀리, 포맷 유틸 정의
  - 폰트: Manrope (Bold/SemiBold/Medium) + JetBrains Mono (Medium/SemiBold)
  - 액체 색상: 스틸 그레이 `#8E9BA8` (변경 이력: 하늘색 → 회색)
- `mobile/src/components/GlassJar.tsx` — SVG 유리병 컴포넌트
  - `progress`, `liquidColor`, `showWaves`, `animateKey`, `cap` props
  - 애니메이션: RAF ease-out-cubic 1400ms 채우기 + 파도 루프
  - `React.useId()`로 인스턴스별 고유 clipPath/LinearGradient ID
- `mobile/src/components/Icons.tsx` — SVG 아이콘 8종
- 앱 아이콘/스플래시: `mobile/scripts/gen-assets.mjs` 로 SVG→PNG 생성 (`@resvg/resvg-js`)

### 2. 화면 구성

#### OnboardingScreen (`src/screens/OnboardingScreen.tsx`)
- 최초 실행 시에만 표시 (AsyncStorage `user_profile` 없을 때)
- 입력: 성별, 나이, 키, 몸무게, 목표(다이어트/유지/근육증가)
- 완료 시 프로필 저장 후 HomeScreen으로 이동 (`navigation.replace`)

#### HomeScreen (`src/screens/HomeScreen.tsx`)
- 날짜 선택: 캘린더 아이콘 → `DateTimePicker display="inline"` 모달
- 목표 설정: GoalsModal에서 직접 입력 or 체형 기반 자동 계산
  - Mifflin-St Jeor BMR × 1.375 (좌식 활동계수)
  - 다이어트: TDEE×0.8 / 유지: TDEE / 근육: TDEE×1.1
- 칼로리 goal 자동 적용: 로드 시 백엔드 기본값(≤2000)이면 user_profile로 재계산
- 메인 GlassJar: 칼로리 진행도 시각화
- 미니 jar 3개: 단백질/탄수화물/지방 진행도

#### MealRegisterScreen (`src/screens/MealRegisterScreen.tsx`)
- 카메라/갤러리에서 사진 선택
- 사진 압축: `expo-image-manipulator` — 800px 리사이즈 + JPEG 50% 품질 (entry too large 오류 해결)
- Claude Vision API 호출 → 음식 인식 → 결과 추가
- 식품 수동 검색 화면 이동

#### FoodSearchScreen (`src/screens/FoodSearchScreen.tsx`)
- 400ms 디바운스 검색
- 페이지네이션: 20개 단위, "더 보기" 버튼으로 추가 로드
- 그램 입력 모달: 프리셋 칩 [50, 100, 150, 200, 300]g + 직접 입력

### 3. 네비게이션 (`App.tsx`)
- AsyncStorage에서 `user_profile` 확인 → `initialRouteName` 동적 설정
- `Onboarding → Home → MealRegister / FoodSearch` 스택 구조
- `headerShown: false`, SafeAreaProvider 적용

### 4. 음식 데이터베이스

#### 데이터 소스 (`food_data/` 디렉토리)
| 파일 | 설명 |
|------|------|
| `FoodData_Central_foundation_food_json_2025-12-18 2.json` | USDA Foundation Foods (365개) |
| `FoodData_Central_sr_legacy_food_json_2018-04.json` | USDA SR Legacy (7,793개) |
| `openfoodfacts-mongodbdump.gz` | Open Food Facts (브랜드 식품) |

#### 임포트 스크립트 (`backend/scripts/import/`)
| 스크립트 | 설명 | 결과 |
|----------|------|------|
| `foundation.js` | Foundation Foods JSON → MongoDB | 352개 |
| `sr_legacy.js` | SR Legacy JSON → MongoDB | 7,759개 |
| `usda.js` | USDA CSV (브랜드 포함) → MongoDB | 대용량 |
| `aliases.js` | 일반 명칭 alias 추가 | ~8,000개 |

#### Alias 시스템
- Foundation + SR Legacy 문서에만 적용 (브랜드 식품 제외)
- 한/영 alias 100개+ 매핑: `오트밀/oatmeal` → "Oats, whole grain, rolled...", `닭가슴살` → "Chicken, breast..." 등
- `backend/scripts/import/aliases.js` 로 실행

### 5. 검색 (Atlas Search)

#### 인덱스 설정
- Atlas UI에서 `foods_search` 인덱스 생성 (Dynamic Mapping)
- `$text` fallback (로컬 개발용) 포함

#### 검색 스코어 순서 (`backend/src/server.js`)
| 매칭 | 부스트 |
|------|--------|
| alias 구문 일치 | 40× |
| alias 텍스트 일치 | 20× |
| name 구문 일치 | 30× |
| name fuzzy (오타 허용) | 10× |
| brand 텍스트 | 5× |

### 6. 백엔드 API (`backend/src/server.js`)

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /foods/search?q=&limit=&offset=` | 음식 검색 (페이지네이션) |
| `GET /foods/by-upc/:upc` | 바코드 조회 |
| `GET /foods/:id` | 음식 상세 |
| `GET /meals/:date` | 일일 식단 조회 |
| `POST /meals/:date/:slot/entries` | 식단 항목 추가 |
| `DELETE /meals/:date/:slot/entries/:index` | 식단 항목 삭제 |
| `PUT /meals/:date/goals` | 목표 칼로리/영양소 설정 |
| `POST /analyze` | Claude Vision 음식 사진 분석 |

### 7. iOS 빌드

#### 환경
- Expo SDK 54, React Native 0.81.5, New Architecture 활성화
- `npx expo prebuild --platform ios` 로 `ios/` 디렉토리 생성
- CocoaPods 1.16.2

#### 빌드 명령
```bash
# 개발/테스트 (Metro 필요 없는 Release 빌드)
cd mobile
npx expo run:ios --device --configuration Release
```

#### 권한 (Info.plist)
- 카메라: `NSCameraUsageDescription`
- 사진: `NSPhotoLibraryUsageDescription`
- 마이크: 제거됨 (동영상 미사용)
- 위치: 없음 (`expo-camera` 제거로 해결)

#### 제거된 패키지
- `expo-camera`: 코드에서 미사용 + 위치/로컬네트워크 권한 팝업 유발

---

## 알려진 이슈 / 다음 작업

- [ ] **오트밀 검색**: Atlas Search가 aliases 필드를 재인덱싱하는 데 시간이 걸릴 수 있음. 반영 후 "oatmeal" 검색 시 순수 귀리 아이템 우선 표시 예정
- [ ] **No script URL / 로컬 네트워크 팝업**: Release 빌드(`--configuration Release`)로 해결. Debug 빌드는 Metro 연결 필요
- [ ] **App Store 배포**: EAS Build 또는 Xcode Archive로 제출 필요
- [ ] **Open Food Facts 임포트**: `openfoodfacts-mongodbdump.gz` (14GB) 아직 미임포트
- [ ] **오프라인 지원**: 현재 모든 검색이 온라인 필요

---

## 주요 파일 경로

```
food_diet/
├── backend/
│   ├── src/
│   │   ├── server.js       # API 서버
│   │   ├── db.js           # MongoDB 연결
│   │   ├── meals.js        # 식단 로직
│   │   ├── analyze.js      # Claude Vision
│   │   └── clean.js        # 데이터 정제
│   └── scripts/import/
│       ├── foundation.js   # Foundation Foods 임포트
│       ├── sr_legacy.js    # SR Legacy 임포트
│       └── aliases.js      # 별칭 추가
├── mobile/
│   ├── App.tsx             # 루트, 폰트, 네비게이션
│   ├── app.json            # Expo 설정
│   ├── src/
│   │   ├── theme.ts        # 디자인 토큰
│   │   ├── types.ts        # TypeScript 타입
│   │   ├── api.ts          # API 클라이언트
│   │   ├── storage.ts      # AsyncStorage 래퍼
│   │   ├── components/
│   │   │   ├── GlassJar.tsx
│   │   │   └── Icons.tsx
│   │   └── screens/
│   │       ├── OnboardingScreen.tsx
│   │       ├── HomeScreen.tsx
│   │       ├── MealRegisterScreen.tsx
│   │       └── FoodSearchScreen.tsx
│   └── ios/
│       └── mobile/
│           └── AppDelegate.swift   # 번들 URL 설정
└── food_data/              # USDA/OFF 원본 데이터
```
