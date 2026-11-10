// 사이트 전역 설정. 학술제에 맞게 이 파일만 고치면 됩니다.

export const CONFIG = {
  eventTitle: '학술제 방명록',
  eventYear: '2026',

  // Firebase(Firestore)를 연결하면 모든 방문자가 같은 방명록을 공유합니다.
  // null 이면 "데모 모드"로 동작하며 이 기기(브라우저)에만 저장됩니다.
  // 예) firebase: { apiKey:'...', authDomain:'...', projectId:'...', appId:'...' }
  firebase: null,
  collection: 'guestbook',

  limits: { name: 10, message: 80 },
  maxNpcs: 32, // 월드에 동시에 돌아다니는 다른 사람 캐릭터 수 (모바일 성능용)
};

// GLB 파일명: assets/models/<id>_outfits.glb
export const CHARACTERS = [
  { id: 'male_01_spiky',       gender: 'm', label: '뾰족머리' },
  { id: 'male_02_curly',       gender: 'm', label: '곱슬머리' },
  { id: 'male_03_moustache',   gender: 'm', label: '콧수염' },
  { id: 'female_01_longhair',  gender: 'f', label: '긴 생머리' },
  { id: 'female_02_twintails', gender: 'f', label: '양갈래' },
  { id: 'female_03_bun',       gender: 'f', label: '올림머리' },
];

export const GRADES = [
  { id: '1',     label: '1학년', color: '#2fb4f0' },
  { id: '2',     label: '2학년', color: '#35c27a' },
  { id: '3',     label: '3학년', color: '#ee8d0c' },
  { id: '4',     label: '4학년', color: '#f2587f' },
  { id: 'grad',  label: '졸업생', color: '#8a69e0' },
  { id: 'guest', label: '게스트', color: '#76838f' },
];

export const characterOf = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
export const gradeOf = (id) => GRADES.find((g) => g.id === id) || GRADES[GRADES.length - 1];
