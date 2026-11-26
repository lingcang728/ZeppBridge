import type { P4Copy } from '../p4Copy';

const pack: P4Copy = {
  chapters: [
    { id: 'motion', name: '디자인', title: '첫눈에 반합니다.', lead: '유리로 만든 내비게이션, 페이지로 자연스럽게 펼쳐지는 카드, 그리고 카드처럼 넘겨 보는 하루하루.', points: [
      { id: 'glass', title: '유리', text: '내비게이션을 누른 채 천천히 끌었다가 살짝 탭해 전환하세요. 가장자리가 빛을 굴절시키며 손끝을 따라옵니다.', scene: 'glass' },
      { id: 'morph', title: '변형', text: '카드가 페이지로 펼쳐지고, 돌아오면 제자리로 접힙니다. 한 곳에 시선이 모이면 나머지는 뒤로 물러납니다.', scene: 'morph' },
      { id: 'poker', title: '카드 테이블', text: '하루 카드를 넘겨 보고, 한 달과 한 주를 부채처럼 펼쳐 보세요. 마음에 드는 날은 수집함에 담아 둡니다.', scene: 'poker' },
      { id: 'theme', title: '낮과 밤', text: '어두운 테마와 밝은 테마. 한 번 탭하면 밤이 됩니다.', scene: 'theme' },
    ] },
    { id: 'connection', name: '연결', title: '클라우드에 있던 기록이 책상으로 돌아옵니다.', lead: 'Zepp 계정을 연결하면 기록이 이 컴퓨터로 동기화됩니다. 주기를 고르고 자동 동기화에 맡기세요.', points: [
      { id: 'account', title: '공식 로그인', text: '시스템 브라우저에서 Zepp에 로그인합니다. Google, Apple, Xiaomi, Facebook 로그인을 쓰는 계정도 됩니다. 인증 상태는 언제든 확인할 수 있습니다.', scene: 'account' },
      { id: 'sync', title: '자동 동기화', text: '끔, 15분, 30분, 60분. 자는 동안에도 알아서 동기화합니다.', scene: 'sync' },
      { id: 'devices', title: '내 시계를 알아봅니다', text: '모델은 자동으로 인식합니다. 잘못 인식했다면 직접 올바른 모델을 지정하세요.', scene: 'devices' },
      { id: 'local', title: '이 컴퓨터에 남습니다', text: 'Zepp에서 동기화한 건강 기록은 이 컴퓨터에 저장되며 우리 서버를 거치지 않습니다. AI로 무엇을 보낼지는 직접 정합니다.', scene: 'local' },
    ] },
    { id: 'records', name: '이해', title: '수십 가지 지표를 한눈에.', lead: '모든 추세를 한 페이지에서 보니 몸 상태가 바로 보입니다. 지표를 열면 전체 기록을 이어서 볼 수 있습니다.', points: [
      { id: 'overview', title: '내 순서대로', text: '수면을 먼저 볼지 훈련을 먼저 볼지, 홈 화면이 관심사에 맞춰집니다. 넘겨 보고 세부 정보를 여세요.', scene: 'overview' },
      { id: 'normal', title: '나의 평소 범위', text: '각 지표 아래 선은 다른 사람과 비교한 값이 아니라 내 평소 범위입니다. “?”를 눌러 어디서 나온 값인지 확인하세요.', scene: 'normal' },
      { id: 'workouts', title: '달린 길에는 모두 메아리가 있습니다', text: '비슷한 거리의 지난 운동과 비교하고 심박수, 페이스, 경로를 확인하세요.', scene: 'workouts' },
      { id: 'gaps', title: '지어내는 값은 없습니다', text: '측정하지 않았다면 비워 둡니다. 0도, 이전 값도, 추정값도 넣지 않습니다.', scene: 'gaps' },
    ] },
    { id: 'journal', name: '보관', title: '모든 운동은 의미가 있습니다.', lead: '나이테, 기록장, 운동 후의 느낌, 작성자가 보내는 편지까지 이 컴퓨터에 보관합니다.', points: [
      { id: 'rings', title: '나이테', text: '1년에 한 겹. 더 많이 훈련한 주는 더 넓게 자랍니다.', scene: 'rings' },
      { id: 'journal', title: '기록장', text: '개인 최고 기록, 대회 카운트다운, 메달 벽. 신발은 정해 둔 거리를 채우면 알려 줍니다.', scene: 'journal' },
      { id: 'feel', title: '운동 후', text: '이번 세션을 평가하고, 아픈 곳을 표시하고, 어떤 신발을 신었는지 적어 두세요.', scene: 'feel' },
      { id: 'import', title: '가져오기와 정리', text: 'GPX, FIT, Strava 내보내기를 가져올 수 있습니다. 여러 개를 골라 종류를 한꺼번에 바꾸거나 숨기세요.', scene: 'import' },
      { id: 'letters', title: '편지함', text: '버전이 나올 때마다 작성자의 편지가 도착합니다. 답장을 쓰면 작성자가 읽고 답합니다. 매주 내 데이터에 대한 편지도 옵니다.', scene: 'letters' },
    ] },
    { id: 'ai', name: 'AI로 보내기', title: '이미 쓰고 있는 구독을 그대로 활용하세요.', lead: '날짜를 고르면 기록이 하나의 파일이 됩니다. 늘 쓰는 AI에 건네고 대화를 이어 간 뒤, 초안을 다시 가져오세요.', points: [
      { id: 'providers', title: '여덟 가지 모델', text: 'ChatGPT, Claude, Gemini, Kimi, DeepSeek, Doubao, Grok, Qwen. 이미 쓰는 계정과 한도를 그대로 씁니다.', scene: 'ai' },
      { id: 'prompt', title: '무엇을 물을지 직접 정하세요', text: '미리 준비된 질문을 고치거나 처음부터 새로 쓰세요.', scene: 'prompt' },
      { id: 'events', title: '맥락이 중요합니다', text: '감기, 여행, 바쁜 한 주를 적어 두면 AI가 컨디션 변화를 조금 더 잘 이해합니다.', scene: 'events' },
      { id: 'autopaste', title: '완전 자동 · Windows', text: '켜면 앱이 대신 붙여 넣고 전송하며, 단계마다 페이지 상태를 먼저 확인합니다. 기본값은 꺼짐입니다.', scene: 'autopaste' },
    ] },
    { id: 'ai-plan', name: '훈련 계획', title: '컴퓨터에서 마무리하고, 시계를 차고 훈련하세요.', lead: 'AI에 몸 상태를 알려 주면 한 주 계획을 짜 줍니다. 다시 붙여 넣고 맞을 때까지 고친 뒤 시계로 보내세요.', points: [
      { id: 'receive', title: '다시 붙여 넣기', text: '대화에서 초안으로. 답변을 복사해 오면 한 주 계획이 됩니다.', scene: 'receive' },
      { id: 'edit', title: '내 계획', text: '끌어서 두 날을 바꾸고, 아무 날이나 열어 각 단계의 시간과 강도를 조정하세요. 길게 누르면 시계로 보냅니다.', scene: 'plan-edit' },
      { id: 'templates', title: '템플릿과 가져오기', text: '템플릿으로 저장해 다음에 다시 쓰세요. .zwo와 .fit 운동 파일도 가져올 수 있습니다.', scene: 'templates' },
      { id: 'easy', title: '오늘은 힘들다면', text: '인터벌이 잡혀 있는데 준비도가 평소보다 낮다면 한 번의 탭으로 가벼운 훈련으로 바꿉니다. 보내기 전에 직접 확인합니다.', scene: 'easy' },
    ] },
  ],
  records: {
    sleep: { title: '수면', text: '하룻밤의 수면 단계부터 최근 7일의 변화까지. 열어서 아래로 내려 보세요.' },
    workouts: { title: '운동', text: '이번 세션 전체를 보고, 지난 운동과 무엇이 다른지 확인하세요.' },
  },
  settings: {
    title: '설정',
    lead: '큰 카드는 한 장씩 넘겨 보고, 작은 카드는 카드 지갑처럼 모입니다. 계정, 동기화, 화면, 데이터를 탭 한 번으로 조정합니다.',
    summaryTitle: '자세한 설정은 설정 화면에 있습니다.',
    summaryLead: '자주 쓰는 설정 열다섯 가지를 카드 한 벌에 모았습니다.',
    items: [
      { id: 'sync', title: '자동 동기화', text: '끔, 15분, 30분, 60분 중에 고르세요.', icon: 'auto-sync' },
      { id: 'retention', title: '10년치를 이 컴퓨터에', text: '최대 10년의 기록을 이 컴퓨터로 가져와 계속 보관합니다. 클라우드 보관 기간이 지나도 사라지지 않습니다.', icon: 'database' },
      { id: 'data', title: '데이터 범위', text: '무엇을 동기화할 수 있고 무엇은 안 되는지 한눈에 보여 줍니다.', icon: 'overview' },
      { id: 'mcp', title: 'MCP', text: 'Claude Code, Codex 같은 로컬 도구가 직접 조회할 수 있습니다. 계획 전송은 별도 허가가 필요합니다.', icon: 'structured-data' },
      { id: 'formats', title: '네 가지 형식', text: 'JSON · CSV · GPX, 운동 페이지에서는 FIT도.', icon: 'document' },
      { id: 'units', title: '단위', text: '킬로미터 또는 마일. 거리와 페이스가 함께 바뀝니다.', icon: 'settings' },
      { id: 'time', title: '시간 형식', text: '지역 설정을 따르거나 12시간, 24시간 중에 고르세요.', icon: 'auto-sync' },
      { id: 'date', title: '날짜 형식', text: '연, 월, 일을 익숙한 순서대로 표시합니다.', icon: 'document' },
      { id: 'scale', title: '화면 배율', text: '창 전체를 크게 또는 작게 조정합니다.', icon: 'overview' },
      { id: 'backup', title: '스냅샷과 복원', text: '데이터베이스 스냅샷을 만들고 필요할 때 복원하세요.', icon: 'database' },
      { id: 'api', title: '로컬 API', text: '127.0.0.1에만 바인딩. 읽기 전용이며 토큰이 필요합니다.', icon: 'structured-data' },
      { id: 'privacy', title: '개인정보와 보안', text: '자격 증명은 운영체제가 보호합니다. 토큰은 로그에 남지 않습니다.', icon: 'browser-login' },
      { id: 'filename', title: '파일 이름', text: 'AI에 건넬 파일의 이름은 직접 정합니다.', icon: 'document' },
      { id: 'folder', title: '언제든 들고 나가기', text: '데이터는 이 컴퓨터의 폴더에 있고, 여기에 적은 평가, 계획, AI 작업은 JSON 파일 하나로 내보낼 수 있습니다.', icon: 'database' },
      { id: 'language', title: '열네 가지 언어', text: '중국어 간체와 번체, 영어, Español 등. 언제든 바꿀 수 있습니다.', icon: 'profile' },
    ],
  },
  nav: [
    { label: 'ZeppBridge 알아보기', links: [{ id: 'motion', label: '디자인' }, { id: 'connection', label: '연결' }, { id: 'records', label: '이해' }, { id: 'journal', label: '보관' }] },
    { label: '기록에서 행동으로', links: [{ id: 'ai', label: 'AI로 보내기' }, { id: 'ai-plan', label: '훈련 계획' }, { id: 'record-sleep', label: '수면과 운동' }] },
    { label: '내 방식대로', links: [{ id: 'connect', label: '설정' }, { id: 'set-mcp', label: 'MCP' }, { id: 'set-api', label: '로컬 API' }] },
  ],
  demoPrompt: '다음 주 수요일은 시간이 없어. 인터벌 한 번만 남기고 나머지는 가볍게 달리기로 잡아 줘.',
};

export default pack;
