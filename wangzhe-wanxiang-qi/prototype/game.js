// 王者万象棋 · 可玩原型内核
// 设计要点（对应 docs/06 技术方案）：状态集中 + 明确的动作函数，行为可复现。

const SIZE = 9;
const BASE_HP = 50;
const ENERGY_CAP = 10;
const ENERGY_PER_TURN = 2;
const ENERGY_START = 2; // startTurn 时会 +2，首回合实际为 4
const MAX_ROUNDS = 40;

const BUFF_TILE = { r: 4, c: 4 };
const BUFF_ATK = 2;
const GRASS_TILES = [ {r:2,c:2}, {r:2,c:6}, {r:6,c:2}, {r:6,c:6} ];
const BASES = {
  red:  { r: 0, c: 4 },
  blue: { r: 8, c: 4 },
};

let state = null;
let aiTimer = null;

// ---------- 工具函数 ----------
const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const manhattan = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
const chebyshev = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
const sameTile = (a, b) => a.r === b.r && a.c === b.c;
const isBuffTile = (r, c) => r === BUFF_TILE.r && c === BUFF_TILE.c;
const isGrass = (r, c) => GRASS_TILES.some(g => g.r === r && g.c === c);
const onGrass = (u) => isGrass(u.r, u.c);
const onBuff = (u) => isBuffTile(u.r, u.c);
const effectiveAtk = (u) => u.atk + (onBuff(u) ? BUFF_ATK : 0);

function enemyOf(side) { return side === 'blue' ? 'red' : 'blue'; }
function unitAt(r, c) { return state.units.find(u => u.hp > 0 && u.r === r && u.c === c) || null; }
function baseAt(r, c) {
  if (state.bases.red.r === r && state.bases.red.c === c) return state.bases.red;
  if (state.bases.blue.r === r && state.bases.blue.c === c) return state.bases.blue;
  return null;
}
function isBlocked(r, c) { return !!unitAt(r, c) || !!baseAt(r, c); }

// ---------- 初始化 ----------
function newGame() {
  if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
  const units = [];
  let id = 0;
  for (const side of ['blue', 'red']) {
    const row = side === 'blue' ? 7 : 1;
    for (const tpl of HERO_TEMPLATES) {
      units.push({
        id: id++, side, key: tpl.key, name: tpl.name, role: tpl.role, emoji: tpl.emoji,
        maxHp: tpl.hp, hp: tpl.hp, atk: tpl.atk, def: tpl.def, mov: tpl.mov, rng: tpl.rng,
        skill: { ...tpl.skill }, shield: 0,
        r: row, c: START_COLS[tpl.key],
        moved: false, acted: false,
      });
    }
  }
  state = {
    units,
    bases: {
      red:  { side: 'red',  isBase: true, def: 0, maxHp: BASE_HP, hp: BASE_HP, r: BASES.red.r,  c: BASES.red.c },
      blue: { side: 'blue', isBase: true, def: 0, maxHp: BASE_HP, hp: BASE_HP, r: BASES.blue.r, c: BASES.blue.c },
    },
    energy: { blue: ENERGY_START, red: ENERGY_START },
    turnSide: 'blue',
    round: 1,
    sel: null,
    mode: 'normal',
    locked: false,
    over: false,
  };
  hideOverlay();
  log('sys', '⚔️ 新对局开始！蓝方（你）先手，摧毁红方水晶基地取胜。');
  startTurn('blue', true);
}

// ---------- 回合流程 ----------
function startTurn(side, first = false) {
  state.turnSide = side;
  state.sel = null;
  state.mode = 'normal';
  state.energy[side] = Math.min(ENERGY_CAP, state.energy[side] + ENERGY_PER_TURN);
  state.units.filter(u => u.side === side).forEach(u => { u.moved = false; u.acted = false; });
  log('sys', `—— 回合 ${state.round} · ${side === 'blue' ? '蓝方（你）' : '红方（AI）'} 行动（能量 ${state.energy[side]}）——`);
  render();
  if (side === 'red') {
    state.locked = true;
    render();
    aiTimer = setTimeout(aiStep, 550);
  } else {
    state.locked = false;
    setHint('点击你的英雄（蓝方）以选中；绿色可移动、红色可攻击、技能需能量。');
  }
}

function endTurn() {
  if (state.over || state.locked) return;
  if (state.turnSide === 'blue') {
    startTurn('red');
  } else {
    state.round += 1;
    if (state.round > MAX_ROUNDS) return judgeByBase();
    startTurn('blue');
  }
}

function judgeByBase() {
  const b = state.bases.blue.hp, r = state.bases.red.hp;
  if (b > r) endGame('blue', `达到回合上限，蓝方水晶剩余 ${b} > 红方 ${r}`);
  else if (r > b) endGame('red', `达到回合上限，红方水晶剩余 ${r} > 蓝方 ${b}`);
  else endGame(null, `达到回合上限，双方水晶血量相同，平局`);
}

// ---------- 伤害结算 ----------
function applyDamage(target, amount, srcLabel) {
  let dmg = amount;
  if (target.shield && target.shield > 0) {
    const absorbed = Math.min(target.shield, dmg);
    target.shield -= absorbed;
    dmg -= absorbed;
  }
  target.hp -= dmg;
  if (target.isBase) {
    if (target.hp < 0) target.hp = 0;
    log(colorFor(enemyOf(target.side)), `${srcLabel} 命中 ${target.side === 'blue' ? '蓝' : '红'}方水晶 −${amount}（剩余 ${target.hp}）`);
    if (target.hp <= 0) endGame(enemyOf(target.side), `${target.side === 'blue' ? '蓝' : '红'}方水晶基地被摧毁`);
  } else {
    log(colorFor(enemyOf(target.side)), `${srcLabel} 命中 ${target.emoji}${target.name} −${amount}（剩余 ${Math.max(0, target.hp)}）`);
    if (target.hp <= 0) {
      log('sys', `💀 ${target.emoji}${target.name}（${target.side === 'blue' ? '蓝' : '红'}方）阵亡`);
    }
  }
}

function colorFor(side) { return side === 'blue' ? 'blue' : 'red'; }

// ---------- 走子 / 攻击 / 技能 计算 ----------
function reachableTiles(u) {
  const res = [];
  const startKey = `${u.r},${u.c}`;
  const dist = { [startKey]: 0 };
  const q = [[u.r, u.c]];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  while (q.length) {
    const [r, c] = q.shift();
    const d = dist[`${r},${c}`];
    if (d >= u.mov) continue;
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      const key = `${nr},${nc}`;
      if (!inBounds(nr, nc) || key in dist) continue;
      if (isBlocked(nr, nc)) continue; // 不可穿越也不可停留
      dist[key] = d + 1;
      q.push([nr, nc]);
      res.push({ r: nr, c: nc });
    }
  }
  return res;
}

function canTargetAttack(attacker, target) {
  // 草丛隐蔽：远程（距离>1）无法指定草丛中的敌人
  if (!target.isBase && isGrass(target.r, target.c) && chebyshev(attacker, target) > 1) return false;
  return true;
}

function attackTargets(u) {
  const foe = enemyOf(u.side);
  const list = [];
  for (const e of state.units) {
    if (e.hp > 0 && e.side === foe && chebyshev(u, e) <= u.rng && canTargetAttack(u, e)) list.push(e);
  }
  const b = state.bases[foe];
  if (b.hp > 0 && chebyshev(u, b) <= u.rng) list.push(b);
  return list;
}

function skillTargets(u) {
  const s = u.skill, foe = enemyOf(u.side), list = [];
  if (s.type === 'shield') return [{ r: u.r, c: u.c, self: true }];
  if (s.type === 'aoe') {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      if (chebyshev(u, { r, c }) <= s.range) list.push({ r, c });
    }
    return list;
  }
  // nuke / dash / blink : 敌方英雄（nuke 亦可点基地）
  for (const e of state.units) {
    if (e.hp > 0 && e.side === foe && chebyshev(u, e) <= s.range) list.push({ r: e.r, c: e.c, unit: e });
  }
  if (s.type === 'nuke') {
    const b = state.bases[foe];
    if (b.hp > 0 && chebyshev(u, b) <= s.range) list.push({ r: b.r, c: b.c, base: b });
  }
  return list;
}

function emptyAdjacentTo(target, from) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  let best = null, bestD = Infinity;
  for (const [dr, dc] of dirs) {
    const nr = target.r + dr, nc = target.c + dc;
    if (!inBounds(nr, nc) || isBlocked(nr, nc)) continue;
    const d = from ? manhattan({ r: nr, c: nc }, from) : 0;
    if (d < bestD) { bestD = d; best = { r: nr, c: nc }; }
  }
  return best;
}

// ---------- 执行动作 ----------
function doMove(u, tile) {
  u.r = tile.r; u.c = tile.c; u.moved = true;
  log(colorFor(u.side), `${u.emoji}${u.name} 移动至 (${tile.r},${tile.c})${onBuff(u) ? ' ⭐占据野区(ATK+2)' : ''}`);
}

function doBasicAttack(u, target) {
  const dmg = Math.max(1, effectiveAtk(u) - (target.def || 0));
  applyDamage(target, dmg, `${u.emoji}${u.name} 普攻`);
  u.acted = true; u.moved = true;
}

function castSkill(u, tgt) {
  const s = u.skill;
  if (state.energy[u.side] < s.cost) return false;
  state.energy[u.side] -= s.cost;
  const label = `${u.emoji}${u.name}·${s.name}`;
  if (s.type === 'shield') {
    u.shield += s.power;
    log(colorFor(u.side), `${label}：获得 ${s.power} 点护盾（当前护盾 ${u.shield}）`);
  } else if (s.type === 'nuke') {
    const target = tgt.unit || tgt.base;
    applyDamage(target, s.power, label);
  } else if (s.type === 'aoe') {
    const center = { r: tgt.r, c: tgt.c };
    const cells = [center, {r:center.r+1,c:center.c}, {r:center.r-1,c:center.c}, {r:center.r,c:center.c+1}, {r:center.r,c:center.c-1}];
    const foe = enemyOf(u.side);
    let hit = 0;
    log(colorFor(u.side), `${label}：以 (${center.r},${center.c}) 为中心引爆十字灼烧`);
    for (const cell of cells) {
      const e = unitAt(cell.r, cell.c);
      if (e && e.side === foe) { applyDamage(e, s.power, label); hit++; }
      const b = baseAt(cell.r, cell.c);
      if (b && b.side === foe) { applyDamage(b, s.power, label); hit++; }
    }
    if (hit === 0) log('sys', `（灼烧未命中任何目标）`);
  } else if (s.type === 'dash' || s.type === 'blink') {
    const target = tgt.unit;
    const spot = emptyAdjacentTo(target, u);
    if (spot) { u.r = spot.r; u.c = spot.c; }
    log(colorFor(u.side), `${label}：突进${spot ? `至 (${spot.r},${spot.c})` : ''}`);
    applyDamage(target, s.power, label);
  }
  u.acted = true; u.moved = true;
  return true;
}

// ---------- 玩家交互 ----------
function onCellClick(r, c) {
  if (state.over || state.locked || state.turnSide !== 'blue') return;
  const u = unitAt(r, c);

  if (state.mode === 'skill' && state.sel) {
    const targets = skillTargets(state.sel);
    const hit = targets.find(t => t.r === r && t.c === c);
    if (hit) {
      castSkill(state.sel, hit);
      state.sel = null; state.mode = 'normal';
      afterAction();
      return;
    }
    // 点了非法技能格 → 退出技能模式
    state.mode = 'normal'; render(); return;
  }

  // 普通模式
  if (state.sel) {
    const sel = state.sel;
    // 攻击目标
    const atk = attackTargets(sel).find(t => t.r === r && t.c === c);
    if (atk && !sel.acted) { doBasicAttack(sel, atk); state.sel = null; afterAction(); return; }
    // 移动
    if (!sel.moved) {
      const mv = reachableTiles(sel).find(t => t.r === r && t.c === c);
      if (mv) { doMove(sel, mv); render(); return; }
    }
    // 点自己 → 取消；点另一个己方英雄 → 改选
    if (u && u.side === 'blue') { selectUnit(u); return; }
    state.sel = null; render(); return;
  }

  if (u && u.side === 'blue') selectUnit(u);
}

function selectUnit(u) {
  state.sel = u; state.mode = 'normal';
  render();
}

function afterAction() {
  state.mode = 'normal';
  render();
  checkAllActed();
}

function checkAllActed() {
  if (state.over) return;
  const mine = state.units.filter(u => u.side === 'blue' && u.hp > 0);
  if (mine.every(u => u.acted)) setHint('你的英雄都行动完毕，点击「结束回合 ▶」。');
}

// ---------- AI（红方） ----------
function aiStep() {
  if (state.over) return;
  const u = state.units.find(x => x.side === 'red' && x.hp > 0 && !x.acted);
  if (!u) { // 红方行动结束
    state.round += 1;
    if (state.round > MAX_ROUNDS) return judgeByBase();
    startTurn('blue');
    return;
  }
  aiActUnit(u);
  render();
  if (state.over) return;
  aiTimer = setTimeout(aiStep, 550);
}

function aiActUnit(u) {
  // 1) 当前位置能否攻击
  let target = aiPickAttackTarget(u);
  // 2) 否则移动靠近
  if (!target) {
    aiMoveToward(u);
    target = aiPickAttackTarget(u);
  }
  if (target) {
    const s = u.skill;
    const dist = chebyshev(u, target);
    // 远程爆发型技能：能量足够且在射程内则优先（展示红方也会用技能/能量）
    if (s.type === 'nuke' && state.energy.red >= s.cost && dist <= s.range) {
      castSkill(u, target.isBase ? { base: target } : { unit: target });
    } else {
      doBasicAttack(u, target);
    }
  } else {
    u.acted = true; u.moved = true;
  }
}

function aiPickAttackTarget(u) {
  const targets = attackTargets(u);
  if (!targets.length) return null;
  const heroes = targets.filter(t => !t.isBase);
  if (heroes.length) {
    // 能一击击杀者优先，否则打血量最低者
    const killable = heroes.filter(h => Math.max(1, effectiveAtk(u) - h.def) >= h.hp);
    const pool = killable.length ? killable : heroes;
    pool.sort((a, b) => a.hp - b.hp);
    return pool[0];
  }
  return targets[0]; // 只剩基地可打
}

function aiMoveToward(u) {
  const foe = enemyOf(u.side);
  const enemies = state.units.filter(e => e.hp > 0 && e.side === foe).map(e => ({ r: e.r, c: e.c }));
  enemies.push({ r: state.bases[foe].r, c: state.bases[foe].c });
  const tiles = reachableTiles(u);
  if (!tiles.length) { return; }
  const nearestTo = (pos) => Math.min(...enemies.map(e => manhattan(pos, e)));
  let best = null, bestD = nearestTo(u);
  for (const t of tiles) {
    const d = nearestTo(t);
    if (d < bestD) { bestD = d; best = t; }
  }
  if (best) doMove(u, best);
  else u.moved = true;
}

// ---------- 渲染 ----------
function render() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  const sel = state.sel;
  const moveSet = new Set(), atkSet = new Set(), skillSet = new Set();
  if (sel && state.turnSide === 'blue' && !state.locked && !state.over) {
    if (state.mode === 'skill') {
      skillTargets(sel).forEach(t => skillSet.add(`${t.r},${t.c}`));
    } else {
      if (!sel.moved) reachableTiles(sel).forEach(t => moveSet.add(`${t.r},${t.c}`));
      if (!sel.acted) attackTargets(sel).forEach(t => atkSet.add(`${t.r},${t.c}`));
    }
  }

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell' + ((r + c) % 2 ? ' light' : '');
      const key = `${r},${c}`;
      if (isGrass(r, c)) { cell.classList.add('grass'); addTileIcon(cell, '🌿'); }
      if (isBuffTile(r, c)) { cell.classList.add('buff'); addTileIcon(cell, '⭐'); }
      const b = baseAt(r, c);
      if (b) {
        cell.classList.add(b.side === 'blue' ? 'base-blue' : 'base-red');
        addTileIcon(cell, '💎');
      }
      if (moveSet.has(key)) cell.classList.add('movable');
      if (atkSet.has(key)) cell.classList.add('attackable');
      if (skillSet.has(key)) cell.classList.add('skilltarget');
      if (sel && sel.r === r && sel.c === c) cell.classList.add('selected');

      const u = unitAt(r, c);
      if (u) cell.appendChild(renderUnit(u));

      cell.addEventListener('click', () => onCellClick(r, c));
      board.appendChild(cell);
    }
  }
  renderPanel();
}

function addTileIcon(cell, icon) {
  const i = document.createElement('span');
  i.className = 'tile-icon'; i.textContent = icon;
  cell.appendChild(i);
}

function renderUnit(u) {
  const el = document.createElement('div');
  el.className = `unit ${u.side}` + (u.acted ? ' acted' : '') + (onBuff(u) ? ' buffed' : '');
  el.title = `${u.name}（${u.role}） HP ${u.hp}/${u.maxHp} ATK ${effectiveAtk(u)} DEF ${u.def} MOV ${u.mov} RNG ${u.rng}`;
  el.innerHTML = `<div class="emoji">${u.emoji}</div><div class="name">${u.name}</div>`;
  if (u.shield > 0) {
    const s = document.createElement('div'); s.className = 'shield'; s.textContent = `🛡${u.shield}`;
    el.appendChild(s);
  }
  const hp = document.createElement('div'); hp.className = 'hp';
  const i = document.createElement('i'); i.style.width = `${Math.max(0, u.hp) / u.maxHp * 100}%`;
  if (u.hp / u.maxHp < 0.35) i.style.background = '#ff5a5c';
  hp.appendChild(i); el.appendChild(hp);
  return el;
}

function renderPanel() {
  document.getElementById('turnNo').textContent = state.round;
  document.getElementById('sideName').textContent = state.turnSide === 'blue' ? '蓝方（你）' : '红方（AI）';
  document.getElementById('blueEnergy').textContent = state.energy.blue;
  document.getElementById('redEnergy').textContent = state.energy.red;
  setBar('blueBaseHp', 'blueBaseNum', state.bases.blue.hp, state.bases.blue.maxHp);
  setBar('redBaseHp', 'redBaseNum', state.bases.red.hp, state.bases.red.maxHp);

  const sel = state.sel;
  const info = document.getElementById('selInfo');
  if (sel) {
    info.innerHTML =
      `${sel.emoji} <b>${sel.name}</b>（${sel.role}）<br>` +
      `HP ${Math.max(0, sel.hp)}/${sel.maxHp}　护盾 ${sel.shield}<br>` +
      `ATK ${effectiveAtk(sel)}${onBuff(sel) ? '(含野区+2)' : ''}　DEF ${sel.def}<br>` +
      `MOV ${sel.mov}　RNG ${sel.rng}<br>` +
      `技能 <span class="skill-name">${sel.skill.name}</span>（${sel.skill.cost} 能量）<br>` +
      `<span style="color:#9aa4d0">${sel.skill.desc}</span><br>` +
      `状态：${sel.moved ? '已移动 ' : ''}${sel.acted ? '已行动' : (sel.moved ? '' : '可移动/行动')}`;
  } else {
    info.textContent = '未选中';
  }

  const skillBtn = document.getElementById('skillBtn');
  skillBtn.disabled = !(sel && state.turnSide === 'blue' && !state.locked && !sel.acted && state.energy.blue >= sel.skill.cost);
  skillBtn.textContent = sel ? `释放技能：${sel.skill.name}` : '释放技能';
  document.getElementById('cancelBtn').disabled = !sel;
  document.getElementById('endTurnBtn').disabled = state.locked || state.over || state.turnSide !== 'blue';
}

function setBar(barId, numId, hp, max) {
  const el = document.getElementById(barId);
  el.style.width = `${Math.max(0, hp) / max * 100}%`;
  document.getElementById(numId).textContent = `${Math.max(0, hp)}/${max}`;
}

// ---------- 结束 / 覆盖层 ----------
function endGame(winner, reason) {
  state.over = true;
  if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
  const title = winner === 'blue' ? '🎉 蓝方胜利！' : winner === 'red' ? '红方胜利' : '平局';
  log('sys', `=== 对局结束：${title}（${reason}）===`);
  showOverlay(title, reason);
  render();
}

function showOverlay(title, text) {
  document.getElementById('overlayTitle').textContent = title;
  document.getElementById('overlayText').textContent = text;
  document.getElementById('overlay').classList.remove('hidden');
}
function hideOverlay() { document.getElementById('overlay').classList.add('hidden'); }

// ---------- 日志 / 提示 ----------
function log(kind, msg) {
  const box = document.getElementById('log');
  const line = document.createElement('div');
  line.className = kind === 'sys' ? 'sys-t' : kind === 'blue' ? 'blue-t' : 'red-t';
  line.textContent = msg;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}
function setHint(msg) { document.getElementById('hint').textContent = msg; }

// ---------- 事件绑定 ----------
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('endTurnBtn').addEventListener('click', endTurn);
  document.getElementById('restartBtn').addEventListener('click', newGame);
  document.getElementById('overlayBtn').addEventListener('click', newGame);
  document.getElementById('cancelBtn').addEventListener('click', () => { state.sel = null; state.mode = 'normal'; render(); });
  document.getElementById('skillBtn').addEventListener('click', () => {
    if (!state.sel) return;
    const s = state.sel;
    if (s.skill.type === 'shield') { // 自身增益，直接释放
      castSkill(s, { self: true }); state.sel = null; afterAction(); return;
    }
    state.mode = state.mode === 'skill' ? 'normal' : 'skill';
    setHint('技能瞄准中：点击金色高亮目标释放，点击其他处取消。');
    render();
  });
  newGame();
});
