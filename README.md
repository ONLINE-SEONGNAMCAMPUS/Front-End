# 학술제 방명록 (Wii 스타일 3D 월드)

모바일 웹 기준의 3D 방명록 사이트. 빌드 도구 없이 정적 파일 + three.js(CDN)로 동작합니다.

## 실행

ES Module 과 GLB 로드 때문에 `file://` 로는 열리지 않습니다. 로컬 서버가 필요해요.

```bash
cd Front-End
python3 -m http.server 8123
# 같은 Wi-Fi의 폰에서: http://<내 PC IP>:8123
```

배포는 Netlify / Vercel / GitHub Pages / Firebase Hosting 등 정적 호스팅이면 됩니다 (HTTPS 권장).

## 구조

```
index.html          화면 마크업 (로딩 · 3단계 입력 · HUD · 대시보드)
css/style.css       Wii 메뉴 스타일 UI
js/config.js        ★ 행사 이름/연도, Firebase 설정, 캐릭터·학년 목록
js/store.js         데이터 계층 (로컬 데모 / Firebase Firestore)
js/avatars.js       GLB 로드, 걷기 애니메이션, 썸네일, 캐릭터 선택 미리보기
js/world.js         3D 월드 (섬, 광장, Top 3 시상대 팻말, NPC, 카메라)
js/controls.js      가상 조이스틱 · 점프 · 카메라 드래그 · 키보드(WASD/Space)
js/ui.js            입력 마법사 · 대시보드 · 근처 말풍선
assets/models/      wii_characters_textured 의 *_outfits.glb 6종 (사복/과잠 토글)
```

## 방명록을 모두와 공유하려면 (Firebase)

기본은 **데모 모드**라서 데이터가 각자 기기에만 저장되고, 예시 방명록 8개가 들어 있습니다.
학술제 당일처럼 여러 사람이 같은 월드를 보려면 Firestore 를 연결하세요.

1. Firebase 콘솔에서 프로젝트 생성 → Firestore Database 생성
2. 웹 앱을 추가하고 받은 설정을 `js/config.js` 의 `firebase` 에 붙여넣기
3. Firestore 규칙 예시 (읽기 공개, 글자 수 제한, 하트는 ±1만 허용)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /guestbook/{id} {
      allow read: if true;
      allow create: if request.resource.data.likes == 0
        && request.resource.data.name.size() <= 10
        && request.resource.data.message.size() <= 80;
      allow update: if
        (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likes'])
          && math.abs(request.resource.data.likes - resource.data.likes) == 1)
        || (request.resource.data.likes == resource.data.likes
          && request.resource.data.name.size() <= 10
          && request.resource.data.message.size() <= 80);
      allow delete: if false;
    }
  }
}
```

> 인증이 없어서 "한 사람 한 번"은 기기(localStorage) 기준으로만 막습니다. 행사용으로는 충분하지만 악의적인 중복 하트는 막지 못해요.

## 조작

- 왼쪽 조이스틱: 이동 / 화면 드래그: 카메라 회전 / **A**: 점프
- 캐릭터 근처로 가면 방명록 말풍선이 뜨고 하트를 누를 수 있어요. 캐릭터나 팻말을 직접 터치해도 됩니다.
- 하단 왼쪽 **방명록**: 대시보드(인기순/최신순, "찾아가기"), 오른쪽 **내 정보**: 캐릭터·방명록 수정
- 우상단 트로피: Top 3 광장으로 이동

## 에셋 출처

과잠 시안 이미지는 스타장닷컴 저작물(비영리 사용)이므로 학술제 등 비영리 용도로만 사용하세요 (`wii_characters_textured/README.md` 참고).
