// 王者万象棋 · 英雄数据表
// 数值与 docs/03-英雄与技能系统.md、docs/05-数值经济与平衡.md 一一对应。
// 集中管理便于平衡调参（这是原型确定性内核设计的一部分）。

const HERO_TEMPLATES = [
  {
    key: 'dunshan',
    name: '盾山',
    role: '坦克',
    emoji: '🛡️',
    hp: 30, atk: 4, def: 3, mov: 2, rng: 1,
    skill: {
      name: '铜墙铁壁',
      type: 'shield',   // 自身获得护盾
      cost: 4,
      range: 0,
      power: 8,
      desc: '自身获得 8 点护盾，抵挡后续伤害。',
    },
  },
  {
    key: 'kai',
    name: '铠',
    role: '战士',
    emoji: '⚔️',
    hp: 24, atk: 6, def: 2, mov: 2, rng: 1,
    skill: {
      name: '破空斩',
      type: 'dash',     // 突进到目标旁并造成伤害
      cost: 4,
      range: 3,
      power: 8,
      desc: '突进至目标敌人身旁，造成 8 点伤害。',
    },
  },
  {
    key: 'ake',
    name: '阿轲',
    role: '刺客',
    emoji: '🗡️',
    hp: 16, atk: 8, def: 1, mov: 3, rng: 1,
    skill: {
      name: '瞬影',
      type: 'blink',    // 闪现到目标旁并造成高伤
      cost: 5,
      range: 4,
      power: 10,
      desc: '闪现到目标敌人身旁，造成 10 点爆发伤害。',
    },
  },
  {
    key: 'daji',
    name: '妲己',
    role: '法师',
    emoji: '🔮',
    hp: 15, atk: 5, def: 1, mov: 2, rng: 3,
    skill: {
      name: '灵魂灼烧',
      type: 'aoe',      // 以目标格为中心的十字范围伤害
      cost: 5,
      range: 3,
      power: 6,
      desc: '以目标格为中心，对十字范围内所有敌人造成 6 点伤害。',
    },
  },
  {
    key: 'houyi',
    name: '后羿',
    role: '射手',
    emoji: '🏹',
    hp: 17, atk: 7, def: 1, mov: 2, rng: 3,
    skill: {
      name: '落日余晖',
      type: 'nuke',     // 远程单体爆发
      cost: 4,
      range: 3,
      power: 9,
      desc: '对射程内单个敌人造成 9 点远程伤害。',
    },
  },
];

// 每方英雄的起始列（行由阵营决定：蓝方 row 7，红方 row 1）
const START_COLS = {
  dunshan: 4, // 坦克居中打前排
  kai: 3,
  ake: 1,
  daji: 5,
  houyi: 7,
};
