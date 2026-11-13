import { defineMessages } from '../i18n';

/* Zepp 力量训练 9 大肌群与 125 项标准动作的多语言表（与 Rust `decoder/strength.rs` 一一对齐）。
 * 表外编号（`exercise_key == null` 或不在表内）律按 `#编号` 显示，不编造动作名。 */
export const strengthCatalogMessages = defineMessages(
  {
    unknownAction: (code: number) => `#${code}`,
    muscles: {
      chest: '胸部', back: '背部', shoulders: '肩部', biceps: '肱二头肌', triceps: '肱三头肌',
      forearms: '前臂', core: '核心', glutes: '臀部', legs: '腿部',
    },
    exercises: {
      free_exercise: '自由训练', bodyweight_squats: '徒手深蹲', straight_arm_front_squats: '直臂颈前深蹲',
      barbell_squats: '杠铃深蹲', triceps_pushdowns: '绳索下压', bent_over_row: '俯身划船',
      bench_press: '平板卧推', sit_up_holds: '仰卧起坐静力保持', knee_touch_sit_ups: '触膝仰卧起坐',
      dumbbell_flys: '哑铃飞鸟', burpee_jumps: '波比跳', burpees: '波比',
      overhead_tricep_extensions: '颈后臂屈伸', lying_tricep_extensions: '仰卧臂屈伸', lateral_raises: '侧平举',
      jumping_jacks: '开合跳', incline_dumbbell_row: '上斜俯卧哑铃划船', bent_over_dumbbell_row: '俯身哑铃划船',
      bent_over_barbell_row: '俯身杠铃划船', single_arm_dumbbell_row_left: '单臂哑铃划船（左）', single_arm_dumbbell_row_right: '单臂哑铃划船（右）',
      dumbbell_supine_triceps_extensions: '仰卧哑铃臂屈伸', supine_triceps_extensions: '仰卧杠铃臂屈伸', dumbbell_single_arm_triceps_extensions_left: '单臂哑铃臂屈伸（左）',
      seated_bent_over_dumbbell_triceps_extensions: '坐姿俯身哑铃臂屈伸', seated_triceps_press: '坐姿颈后臂屈伸', smith_machine_squats: '史密斯机深蹲',
      dumbbell_bench_press: '哑铃卧推', smith_machine_bench_press: '史密斯机卧推', dumbbell_single_arm_triceps_extensions_right: '单臂哑铃臂屈伸（右）',
      incline_dumbbell_flys: '上斜哑铃飞鸟', decline_dumbbell_flys: '下斜哑铃飞鸟', v_bar_tricep_pushdowns: 'V 把肱三头肌下压',
      rope_triceps_pushdowns: '绳索肱三头肌下压', elastic_band_lateral_raise: '弹力带侧平举', dumbbell_lateral_raise: '哑铃侧平举',
      dumbbell_front_raise: '哑铃前平举', pectoral_muscles: '胸部肌群训练', rectus_abdominis: '腹直肌训练',
      external_oblique: '腹外斜肌训练', upper_back_muscles: '上背肌群训练', lower_back_muscles: '下背肌群训练',
      lateral_back_muscles: '背阔肌训练', shoulder_muscles: '肩部肌群训练', neck_muscles: '颈部肌群训练',
      upper_arm_front_muscles: '上臂前侧肌群训练', upper_arm_back_muscles: '上臂后侧肌群训练', front_forearm_muscles: '前臂屈肌训练',
      back_forearm_muscles: '前臂伸肌训练', hip_muscles: '臀部肌群训练', quadriceps: '股四头肌训练',
      hamstrings: '腘绳肌训练', front_calf_muscles: '小腿前侧肌群训练', back_calf_muscles: '小腿后侧肌群训练',
      lat_pulldowns: '高位下拉', deadlift: '硬拉', push_up: '俯卧撑',
      shoulder_press: '肩上推举', pull_up: '引体向上', biceps_curl: '二头弯举',
      seated_cable_row: '坐姿绳索划船', upright_row: '直立划船', straight_arm_pulldown: '直臂下压',
      russian_twist: '俄罗斯转体', barbell_deadlift: '杠铃硬拉', assisted_push_up: '辅助俯卧撑',
      dumbbell_push_press: '哑铃借力推举', dumbbell_upright_row: '哑铃直立划船', neck_pulldown: '颈后下拉',
      chin_up: '反手引体向上', dumbbell_biceps_curl: '哑铃弯举', t_bar_row: 'T 杆划船',
      kettlebell_deadlift: '壶铃硬拉', kneeling_push_up: '跪姿俯卧撑', rotational_dumbbell_push_press: '旋转哑铃推举',
      incline_barbell_upright_row: '上斜杠铃直立划船', rope_straight_arm_pulldown: '绳索直臂下压', standard_pull_up: '标准引体向上',
      hammer_curl_to_press: '锤式弯举推举', seated_row_machine: '坐姿划船机', chest_flyes: '夹胸飞鸟',
      single_arm_kettlebell_swing_right: '单臂壶铃摇摆（右）', barbell_push_press: '杠铃借力推举', dumbbell_compound_push_press: '哑铃复合推举',
      barbell_biceps_curl: '杠铃弯举', single_arm_kettlebell_swing_left: '单臂壶铃摇摆（左）', v_grip_cable_row: 'V 把坐姿划船',
      dumbbell_front_raise_left: '单臂哑铃前平举（左）', dumbbell_front_raise_right: '单臂哑铃前平举（右）', bent_over_lateral_raise: '俯身侧平举',
      front_raise: '前平举', plank: '平板支撑', barbell_hip_thrust: '杠铃臀推',
      barbell_snatch: '杠铃抓举', standing_calf_raise: '站姿提踵', barbell_shrug: '杠铃耸肩',
      dumbbell_shrug: '哑铃耸肩', farmers_walk_lunge: '农夫行走箭步蹲', v_up: '两头起',
      lateral_slide: '侧向滑步', battle_rope: '战绳', kettlebell_swing: '壶铃摇摆',
      walking_recovery: '走动恢复', incline_dumbbell_bench_press: '上斜哑铃卧推', incline_barbell_bench_press: '上斜杠铃卧推',
      decline_dumbbell_bench_press: '下斜哑铃卧推', decline_barbell_bench_press: '下斜杠铃卧推', pec_deck_fly: '蝴蝶机夹胸',
      reverse_pec_deck_fly: '反向蝴蝶机飞鸟', trx_triceps_press: 'TRX 臂屈伸', trx_reverse_flys: 'TRX 反向飞鸟',
      three_point_chest_push: '三点胸推', incline_cable_flys: '上斜龙门架飞鸟', incline_cable_chest_press: '上斜绳索推胸',
      low_cable_crossover: '低位龙门架夹胸', cable_crossover: '龙门架夹胸', reverse_grip_triceps_pushdown: '反握肱三头肌下压',
      cable_crunch: '绳索卷腹', smith_machine_incline_bench_press: '史密斯机上斜卧推', smith_machine_decline_bench_press: '史密斯机下斜卧推',
      chest_press_machine: '坐姿推胸机', leverage_incline_chest_press: '挂片上斜推胸', leverage_decline_chest_press: '挂片下斜推胸',
      leverage_chest_press: '挂片平板推胸', machine_shoulder_press: '器械肩上推举',
    },
  },
  {
    unknownAction: (code: number) => `#${code}`,
    muscles: {
      chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps',
      forearms: 'Forearms', core: 'Core', glutes: 'Glutes', legs: 'Legs',
    },
    exercises: {
      free_exercise: 'Free exercise', bodyweight_squats: 'Bodyweight squats', straight_arm_front_squats: 'Straight-arm front squats',
      barbell_squats: 'Barbell squats', triceps_pushdowns: 'Triceps pushdowns', bent_over_row: 'Bent-over row',
      bench_press: 'Bench press', sit_up_holds: 'Sit-up holds', knee_touch_sit_ups: 'Knee-touch sit-ups',
      dumbbell_flys: 'Dumbbell flyes', burpee_jumps: 'Burpee jumps', burpees: 'Burpees',
      overhead_tricep_extensions: 'Overhead triceps extensions', lying_tricep_extensions: 'Lying triceps extensions', lateral_raises: 'Lateral raises',
      jumping_jacks: 'Jumping jacks', incline_dumbbell_row: 'Incline dumbbell row', bent_over_dumbbell_row: 'Bent-over dumbbell row',
      bent_over_barbell_row: 'Bent-over barbell row', single_arm_dumbbell_row_left: 'Single-arm dumbbell row (L)', single_arm_dumbbell_row_right: 'Single-arm dumbbell row (R)',
      dumbbell_supine_triceps_extensions: 'Dumbbell lying triceps extensions', supine_triceps_extensions: 'Lying barbell triceps extensions', dumbbell_single_arm_triceps_extensions_left: 'Single-arm dumbbell triceps extension (L)',
      seated_bent_over_dumbbell_triceps_extensions: 'Seated bent-over triceps extensions', seated_triceps_press: 'Seated triceps press', smith_machine_squats: 'Smith machine squats',
      dumbbell_bench_press: 'Dumbbell bench press', smith_machine_bench_press: 'Smith machine bench press', dumbbell_single_arm_triceps_extensions_right: 'Single-arm dumbbell triceps extension (R)',
      incline_dumbbell_flys: 'Incline dumbbell flyes', decline_dumbbell_flys: 'Decline dumbbell flyes', v_bar_tricep_pushdowns: 'V-bar triceps pushdowns',
      rope_triceps_pushdowns: 'Rope triceps pushdowns', elastic_band_lateral_raise: 'Band lateral raises', dumbbell_lateral_raise: 'Dumbbell lateral raises',
      dumbbell_front_raise: 'Dumbbell front raises', pectoral_muscles: 'Pectoral muscles', rectus_abdominis: 'Rectus abdominis',
      external_oblique: 'External obliques', upper_back_muscles: 'Upper back muscles', lower_back_muscles: 'Lower back muscles',
      lateral_back_muscles: 'Latissimus dorsi', shoulder_muscles: 'Shoulder muscles', neck_muscles: 'Neck muscles',
      upper_arm_front_muscles: 'Upper-arm front muscles', upper_arm_back_muscles: 'Upper-arm back muscles', front_forearm_muscles: 'Forearm flexors',
      back_forearm_muscles: 'Forearm extensors', hip_muscles: 'Hip muscles', quadriceps: 'Quadriceps',
      hamstrings: 'Hamstrings', front_calf_muscles: 'Anterior calf muscles', back_calf_muscles: 'Calf muscles',
      lat_pulldowns: 'Lat pulldowns', deadlift: 'Deadlift', push_up: 'Push-ups',
      shoulder_press: 'Shoulder press', pull_up: 'Pull-ups', biceps_curl: 'Biceps curls',
      seated_cable_row: 'Seated cable row', upright_row: 'Upright row', straight_arm_pulldown: 'Straight-arm pulldown',
      russian_twist: 'Russian twists', barbell_deadlift: 'Barbell deadlift', assisted_push_up: 'Assisted push-ups',
      dumbbell_push_press: 'Dumbbell push press', dumbbell_upright_row: 'Dumbbell upright row', neck_pulldown: 'Behind-the-neck pulldown',
      chin_up: 'Chin-ups', dumbbell_biceps_curl: 'Dumbbell biceps curls', t_bar_row: 'T-bar row',
      kettlebell_deadlift: 'Kettlebell deadlift', kneeling_push_up: 'Kneeling push-ups', rotational_dumbbell_push_press: 'Rotational dumbbell press',
      incline_barbell_upright_row: 'Incline barbell upright row', rope_straight_arm_pulldown: 'Rope straight-arm pulldown', standard_pull_up: 'Standard pull-ups',
      hammer_curl_to_press: 'Hammer curl to press', seated_row_machine: 'Seated row machine', chest_flyes: 'Chest flyes',
      single_arm_kettlebell_swing_right: 'Single-arm kettlebell swing (R)', barbell_push_press: 'Barbell push press', dumbbell_compound_push_press: 'Dumbbell compound press',
      barbell_biceps_curl: 'Barbell biceps curls', single_arm_kettlebell_swing_left: 'Single-arm kettlebell swing (L)', v_grip_cable_row: 'V-grip cable row',
      dumbbell_front_raise_left: 'Dumbbell front raise (L)', dumbbell_front_raise_right: 'Dumbbell front raise (R)', bent_over_lateral_raise: 'Bent-over lateral raises',
      front_raise: 'Front raises', plank: 'Plank', barbell_hip_thrust: 'Barbell hip thrust',
      barbell_snatch: 'Barbell snatch', standing_calf_raise: 'Standing calf raises', barbell_shrug: 'Barbell shrugs',
      dumbbell_shrug: 'Dumbbell shrugs', farmers_walk_lunge: 'Farmer’s walk lunges', v_up: 'V-ups',
      lateral_slide: 'Lateral slides', battle_rope: 'Battle ropes', kettlebell_swing: 'Kettlebell swings',
      walking_recovery: 'Walking recovery', incline_dumbbell_bench_press: 'Incline dumbbell bench press', incline_barbell_bench_press: 'Incline barbell bench press',
      decline_dumbbell_bench_press: 'Decline dumbbell bench press', decline_barbell_bench_press: 'Decline barbell bench press', pec_deck_fly: 'Pec deck flyes',
      reverse_pec_deck_fly: 'Reverse pec deck flyes', trx_triceps_press: 'TRX triceps press', trx_reverse_flys: 'TRX reverse flyes',
      three_point_chest_push: 'Three-point chest press', incline_cable_flys: 'Incline cable flyes', incline_cable_chest_press: 'Incline cable chest press',
      low_cable_crossover: 'Low cable crossover', cable_crossover: 'Cable crossover', reverse_grip_triceps_pushdown: 'Reverse-grip triceps pushdown',
      cable_crunch: 'Cable crunches', smith_machine_incline_bench_press: 'Smith machine incline bench press', smith_machine_decline_bench_press: 'Smith machine decline bench press',
      chest_press_machine: 'Chest press machine', leverage_incline_chest_press: 'Leverage incline chest press', leverage_decline_chest_press: 'Leverage decline chest press',
      leverage_chest_press: 'Leverage chest press', machine_shoulder_press: 'Machine shoulder press',
    },
  },
  {
    unknownAction: (code: number) => `#${code}`,
    muscles: {
      chest: 'Pecho', back: 'Espalda', shoulders: 'Hombros', biceps: 'Bíceps', triceps: 'Tríceps',
      forearms: 'Antebrazos', core: 'Core', glutes: 'Glúteos', legs: 'Piernas',
    },
    exercises: {
      free_exercise: 'Ejercicio libre', bodyweight_squats: 'Sentadillas sin peso', straight_arm_front_squats: 'Sentadilla frontal con brazos rectos',
      barbell_squats: 'Sentadillas con barra', triceps_pushdowns: 'Extensión de tríceps en polea', bent_over_row: 'Remo inclinado',
      bench_press: 'Press de banca', sit_up_holds: 'Abdominales isométricos', knee_touch_sit_ups: 'Abdominales tocando rodillas',
      dumbbell_flys: 'Aperturas con mancuernas', burpee_jumps: 'Burpees con salto', burpees: 'Burpees',
      overhead_tricep_extensions: 'Extensión de tríceps tras nuca', lying_tricep_extensions: 'Press francés tumbado', lateral_raises: 'Elevaciones laterales',
      jumping_jacks: 'Saltos de tijera', incline_dumbbell_row: 'Remo con mancuernas en banco inclinado', bent_over_dumbbell_row: 'Remo inclinado con mancuernas',
      bent_over_barbell_row: 'Remo inclinado con barra', single_arm_dumbbell_row_left: 'Remo con mancuerna a una mano (izq.)', single_arm_dumbbell_row_right: 'Remo con mancuerna a una mano (der.)',
      dumbbell_supine_triceps_extensions: 'Press francés con mancuernas', supine_triceps_extensions: 'Press francés con barra', dumbbell_single_arm_triceps_extensions_left: 'Extensión de tríceps con mancuerna (izq.)',
      seated_bent_over_dumbbell_triceps_extensions: 'Patada de tríceps sentado con mancuernas', seated_triceps_press: 'Extensión de tríceps sentado', smith_machine_squats: 'Sentadillas en máquina Smith',
      dumbbell_bench_press: 'Press de banca con mancuernas', smith_machine_bench_press: 'Press de banca en máquina Smith', dumbbell_single_arm_triceps_extensions_right: 'Extensión de tríceps con mancuerna (der.)',
      incline_dumbbell_flys: 'Aperturas inclinadas con mancuernas', decline_dumbbell_flys: 'Aperturas declinadas con mancuernas', v_bar_tricep_pushdowns: 'Extensión de tríceps con barra V',
      rope_triceps_pushdowns: 'Extensión de tríceps con cuerda', elastic_band_lateral_raise: 'Elevaciones laterales con banda', dumbbell_lateral_raise: 'Elevaciones laterales con mancuernas',
      dumbbell_front_raise: 'Elevaciones frontales con mancuernas', pectoral_muscles: 'Músculos pectorales', rectus_abdominis: 'Recto abdominal',
      external_oblique: 'Oblicuos externos', upper_back_muscles: 'Espalda alta', lower_back_muscles: 'Espalda baja',
      lateral_back_muscles: 'Dorsales', shoulder_muscles: 'Músculos del hombro', neck_muscles: 'Músculos del cuello',
      upper_arm_front_muscles: 'Parte frontal del brazo', upper_arm_back_muscles: 'Parte posterior del brazo', front_forearm_muscles: 'Flexores del antebrazo',
      back_forearm_muscles: 'Extensores del antebrazo', hip_muscles: 'Músculos de la cadera', quadriceps: 'Cuádriceps',
      hamstrings: 'Isquiotibiales', front_calf_muscles: 'Tibiales', back_calf_muscles: 'Pantorrillas',
      lat_pulldowns: 'Jalón al pecho', deadlift: 'Peso muerto', push_up: 'Flexiones',
      shoulder_press: 'Press de hombros', pull_up: 'Dominadas', biceps_curl: 'Curl de bíceps',
      seated_cable_row: 'Remo sentado en polea', upright_row: 'Remo al mentón', straight_arm_pulldown: 'Jalón con brazos rectos',
      russian_twist: 'Giros rusos', barbell_deadlift: 'Peso muerto con barra', assisted_push_up: 'Flexiones asistidas',
      dumbbell_push_press: 'Push press con mancuernas', dumbbell_upright_row: 'Remo al mentón con mancuernas', neck_pulldown: 'Jalón tras nuca',
      chin_up: 'Dominadas supinas', dumbbell_biceps_curl: 'Curl de bíceps con mancuernas', t_bar_row: 'Remo en barra T',
      kettlebell_deadlift: 'Peso muerto con pesa rusa', kneeling_push_up: 'Flexiones de rodillas', rotational_dumbbell_push_press: 'Press con rotación con mancuernas',
      incline_barbell_upright_row: 'Remo inclinado al mentón con barra', rope_straight_arm_pulldown: 'Jalón con cuerda y brazos rectos', standard_pull_up: 'Dominadas estándar',
      hammer_curl_to_press: 'Curl martillo con press', seated_row_machine: 'Remo sentado en máquina', chest_flyes: 'Aperturas de pecho',
      single_arm_kettlebell_swing_right: 'Swing con pesa rusa a una mano (der.)', barbell_push_press: 'Push press con barra', dumbbell_compound_push_press: 'Press compuesto con mancuernas',
      barbell_biceps_curl: 'Curl de bíceps con barra', single_arm_kettlebell_swing_left: 'Swing con pesa rusa a una mano (izq.)', v_grip_cable_row: 'Remo en polea con agarre V',
      dumbbell_front_raise_left: 'Elevación frontal con mancuerna (izq.)', dumbbell_front_raise_right: 'Elevación frontal con mancuerna (der.)', bent_over_lateral_raise: 'Pájaros con mancuernas',
      front_raise: 'Elevaciones frontales', plank: 'Plancha', barbell_hip_thrust: 'Hip thrust con barra',
      barbell_snatch: 'Arrancada con barra', standing_calf_raise: 'Elevación de talones de pie', barbell_shrug: 'Encogimientos con barra',
      dumbbell_shrug: 'Encogimientos con mancuernas', farmers_walk_lunge: 'Zancadas con paseo del granjero', v_up: 'Abdominales en V',
      lateral_slide: 'Deslizamiento lateral', battle_rope: 'Cuerdas de batalla', kettlebell_swing: 'Swing con pesa rusa',
      walking_recovery: 'Caminata de recuperación', incline_dumbbell_bench_press: 'Press inclinado con mancuernas', incline_barbell_bench_press: 'Press inclinado con barra',
      decline_dumbbell_bench_press: 'Press declinado con mancuernas', decline_barbell_bench_press: 'Press declinado con barra', pec_deck_fly: 'Aperturas en contractor de pecho',
      reverse_pec_deck_fly: 'Pájaros en contractor inverso', trx_triceps_press: 'Extensión de tríceps en TRX', trx_reverse_flys: 'Aperturas inversas en TRX',
      three_point_chest_push: 'Empuje de pecho en tres apoyos', incline_cable_flys: 'Aperturas inclinadas en polea', incline_cable_chest_press: 'Press de pecho inclinado en polea',
      low_cable_crossover: 'Cruce de poleas bajas', cable_crossover: 'Cruce de poleas', reverse_grip_triceps_pushdown: 'Extensión de tríceps con agarre supino',
      cable_crunch: 'Crunch en polea', smith_machine_incline_bench_press: 'Press inclinado en máquina Smith', smith_machine_decline_bench_press: 'Press declinado en máquina Smith',
      chest_press_machine: 'Press de pecho en máquina', leverage_incline_chest_press: 'Press inclinado convergente', leverage_decline_chest_press: 'Press declinado convergente',
      leverage_chest_press: 'Press de pecho convergente', machine_shoulder_press: 'Press de hombros en máquina',
    },
  },
  'lib/strengthCatalog',
);

export type StrengthCatalogShape = typeof strengthCatalogMessages.zh;

/** 动作名：自己逐条核过的 125 个老动作用自己的译名；其余用 Zepp 目录给的名字
 * （先当前语言那份，再后端带来的英文名）；都没有才显示 `#编号`，不猜。 */
export const resolveStrengthExerciseLabel = (
  exerciseKey: string | null | undefined,
  actionCode: number,
  catalog: StrengthCatalogShape,
  ...zeppNames: Array<string | null | undefined>
): string => {
  if (exerciseKey && Object.prototype.hasOwnProperty.call(catalog.exercises, exerciseKey)) {
    return catalog.exercises[exerciseKey as keyof StrengthCatalogShape['exercises']];
  }
  const zeppName = zeppNames.find((name) => typeof name === 'string' && name.trim() !== '');
  return zeppName ? zeppName.trim() : catalog.unknownAction(actionCode);
};

export const resolveStrengthMuscleLabel = (
  muscleGroup: string | null | undefined,
  catalog: StrengthCatalogShape,
): string | null => {
  if (muscleGroup && Object.prototype.hasOwnProperty.call(catalog.muscles, muscleGroup)) {
    return catalog.muscles[muscleGroup as keyof StrengthCatalogShape['muscles']];
  }
  return null;
};
