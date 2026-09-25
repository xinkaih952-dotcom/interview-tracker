// ========== 常量 ==========
const STORAGE_KEY = 'interview-tool-candidates';
const TEMPLATE_KEY = 'interview-tool-templates';
const COMPANY_KEY = 'interview-tool-company'; // 面试邀请里上次填写的公司名称
const STAGES = ['待约面', '一面', '二面', '终面', 'Offer', '淘汰'];
const ROUNDS = ['一面', '二面', '终面']; // 可以在流程模板里按岗位勾选的轮次
const SOURCES = ['校园招聘', '校园宣讲会', '内部推荐', '招聘网站', '其他'];
const DAY_MS = 24 * 60 * 60 * 1000;
const WARN_DAYS = 7;   // 超过 7 天：黄色提醒
const ALERT_DAYS = 14; // 超过 14 天：红色提醒
const FINAL_STAGES = ['Offer', '淘汰']; // 已有结论，不做超时提醒

// ========== 数据 ==========
let candidates = loadData();
let editingId = null; // 正在编辑的候选人 id，新增时为 null
let templates = loadTemplates(); // 岗位流程模板，如 { '行政文员': ['一面', '终面'] }

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(candidates));
  } catch (e) {
    alert('保存失败：浏览器可能禁用了本地存储。');
  }
}

function loadTemplates() {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveTemplates() {
  try {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
  } catch (e) {
    alert('保存失败：浏览器可能禁用了本地存储。');
  }
}

// 岗位需要的面试轮次；没设置模板的岗位默认三轮都有
function getRounds(position) {
  return templates[position] || ROUNDS;
}

// 岗位可用的全部阶段，按看板顺序排列
function getStagesFor(position) {
  const rounds = getRounds(position);
  return STAGES.filter(stage => !ROUNDS.includes(stage) || rounds.includes(stage));
}

// ---------- 面试评价 ----------
// 候选人的 evaluations 按轮次保存：{ '一面': { interviewer, score, comment }, ... }

// 可以填写评价的轮次：岗位模板里有、且候选人已经走到的轮次；已有评价的轮次始终显示
function getEvaluableRounds(c) {
  const rounds = getRounds(c.position);
  const reached = FINAL_STAGES.includes(c.stage)
    ? rounds
    : rounds.filter(r => STAGES.indexOf(r) <= STAGES.indexOf(c.stage));
  const evaluated = Object.keys(c.evaluations || {});
  return ROUNDS.filter(r => reached.includes(r) || evaluated.includes(r));
}

// 最近一次评价：按轮次先后判断，终面 > 二面 > 一面
function getLatestEvaluation(c) {
  const evaluations = c.evaluations || {};
  const round = [...ROUNDS].reverse().find(r => evaluations[r]);
  return round ? { round, ...evaluations[round] } : null;
}

function formatStars(score) {
  return '★'.repeat(score) + '☆'.repeat(5 - score);
}

function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 在当前阶段停留的整天数
function getStayDays(c) {
  return Math.floor((Date.now() - c.stageChangedAt) / DAY_MS);
}

// 返回超时等级：'alert'（红）、'warn'（黄）或 ''（无）
function getOverdueLevel(c) {
  if (FINAL_STAGES.includes(c.stage)) return '';
  const days = getStayDays(c);
  if (days > ALERT_DAYS) return 'alert';
  if (days > WARN_DAYS) return 'warn';
  return '';
}

// 统计每个岗位的人数和通过率
// 通过率 = Offer ÷（Offer + 淘汰）；没有任何结论时为 null
function getPositionStats() {
  const positions = [...new Set(candidates.map(c => c.position))];
  return positions.map(position => {
    const list = candidates.filter(c => c.position === position);
    const offer = list.filter(c => c.stage === 'Offer').length;
    const rejected = list.filter(c => c.stage === '淘汰').length;
    const decided = offer + rejected;
    return {
      position,
      total: list.length,
      offer,
      rejected,
      rate: decided === 0 ? null : offer / decided,
    };
  });
}

// 统计条和 CSV 中的两项周期指标
const CYCLE_STATS = [
  { label: '平均招聘周期', stage: 'Offer' },
  { label: '平均淘汰周期', stage: '淘汰' },
];

// 从首次录入到进入指定阶段（Offer / 淘汰）的平均天数；没有人时为 null
// 候选人处于该阶段时，stageChangedAt 就是进入该阶段的时间
// 旧版本录入、没有首次录入时间的候选人不参与统计
function getAverageCycle(stage) {
  const list = candidates.filter(c => c.stage === stage && c.createdAt);
  if (list.length === 0) return null;
  const total = list.reduce((sum, c) => sum + (c.stageChangedAt - c.createdAt), 0);
  return { days: total / list.length / DAY_MS, count: list.length };
}

function formatCycle(cycle) {
  return cycle === null ? '暂无数据' : cycle.days.toFixed(1) + ' 天';
}

function formatRate(rate) {
  return rate === null ? '暂无数据' : Math.round(rate * 100) + '%';
}

// ========== 渲染 ==========
function render() {
  renderStats();
  renderPositionFilter(); // 要在看板之前：选中的岗位不存在时会先重置为"全部"
  renderBoard();
  renderPositionOptions();
}

function makeStat(label, value, detail) {
  const box = document.createElement('div');
  box.className = 'stat';

  const labelEl = document.createElement('span');
  labelEl.className = 'label';
  labelEl.textContent = label;

  const valueEl = document.createElement('strong');
  valueEl.className = 'value';
  valueEl.textContent = value;

  box.append(labelEl, valueEl);

  if (detail) {
    const detailEl = document.createElement('span');
    detailEl.className = 'detail';
    detailEl.textContent = detail;
    box.append(detailEl);
  }
  return box;
}

function renderStats() {
  const stageBox = document.getElementById('stage-stats');
  stageBox.innerHTML = '';
  STAGES.forEach(stage => {
    const count = candidates.filter(c => c.stage === stage).length;
    stageBox.append(makeStat(stage, count));
  });

  const cycleBox = document.getElementById('cycle-stats');
  cycleBox.innerHTML = '';
  CYCLE_STATS.forEach(({ label, stage }) => {
    const cycle = getAverageCycle(stage);
    const box = makeStat(label, formatCycle(cycle), cycle ? `（${cycle.count} 人）` : '');
    if (!cycle) box.classList.add('muted');
    cycleBox.append(box);
  });

  const rateBox = document.getElementById('rate-stats');
  rateBox.innerHTML = '';
  const stats = getPositionStats();
  if (stats.length === 0) {
    const empty = makeStat('岗位通过率', '暂无数据');
    empty.classList.add('muted');
    rateBox.append(empty);
    return;
  }
  stats.forEach(s => {
    const detail = s.rate === null ? '' : `（${s.offer}/${s.offer + s.rejected}）`;
    const box = makeStat(s.position, formatRate(s.rate), detail);
    if (s.rate === null) box.classList.add('muted');
    rateBox.append(box);
  });
}

// ---------- 搜索 ----------
// 只影响看板显示哪些卡片，统计条仍基于全部候选人
let searchKeyword = '';

function matchesSearch(c) {
  if (!searchKeyword) return true;
  return [c.name, c.position, c.source, c.note]
    .some(value => (value || '').toLowerCase().includes(searchKeyword));
}

const searchInput = document.getElementById('search-input');
searchInput.addEventListener('input', event => {
  // 中文输入法拼写过程中先不筛选，选好字后再筛选
  if (event.isComposing) return;
  searchKeyword = searchInput.value.trim().toLowerCase();
  renderBoard();
});
searchInput.addEventListener('compositionend', () => {
  searchKeyword = searchInput.value.trim().toLowerCase();
  renderBoard();
});

// ---------- 岗位筛选 ----------
// 和搜索一样只影响看板，可与搜索同时生效
let positionFilter = ''; // 空字符串表示"全部"

function matchesPosition(c) {
  return !positionFilter || c.position === positionFilter;
}

// 岗位按钮从现有候选人的岗位自动生成
function renderPositionFilter() {
  const box = document.getElementById('position-filter');
  box.innerHTML = '';

  const positions = [...new Set(candidates.map(c => c.position))];
  // 选中的岗位已经没有候选人了（删除、清空、恢复备份等），回到"全部"
  if (positionFilter && !positions.includes(positionFilter)) positionFilter = '';
  box.hidden = positions.length === 0;

  const options = [
    { value: '', label: '全部', count: candidates.length },
    ...positions.map(p => ({ value: p, label: p, count: candidates.filter(c => c.position === p).length })),
  ];
  options.forEach(({ value, label, count }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    const active = value === positionFilter;
    if (active) btn.classList.add('active');
    btn.setAttribute('aria-pressed', String(active));

    const countEl = document.createElement('span');
    countEl.className = 'chip-count';
    countEl.textContent = count;
    btn.append(label, countEl);

    btn.addEventListener('click', () => {
      positionFilter = value;
      renderPositionFilter();
      renderBoard();
    });
    box.append(btn);
  });
}

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  // 空状态引导：没有候选人时显示，有数据后重新渲染自然消失
  if (candidates.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'board-empty';

    const text = document.createElement('p');
    text.className = 'board-empty-text';
    text.textContent = '当前没有候选人数据';

    const actions = document.createElement('div');
    actions.className = 'board-empty-actions';

    const sampleBtn = document.createElement('button');
    sampleBtn.type = 'button';
    sampleBtn.className = 'btn';
    sampleBtn.textContent = '载入示例数据';
    // 复用底部按钮的逻辑（当前没有数据，不会弹出覆盖确认）
    sampleBtn.addEventListener('click', () => document.getElementById('btn-sample').click());

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn primary';
    addBtn.textContent = '新增候选人';
    addBtn.addEventListener('click', () => openDialog(null));

    actions.append(sampleBtn, addBtn);
    empty.append(text, actions);
    board.append(empty);
    return;
  }

  const visible = candidates.filter(c => matchesPosition(c) && matchesSearch(c));
  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'board-empty';
    const text = document.createElement('p');
    text.className = 'board-empty-text';
    text.textContent = '没有找到匹配的候选人';
    empty.append(text);
    board.append(empty);
    return;
  }

  STAGES.forEach((stage, index) => {
    const list = visible.filter(c => c.stage === stage);

    const column = document.createElement('div');
    column.className = 'column stage-' + index;

    const header = document.createElement('div');
    header.className = 'column-header';
    const title = document.createElement('span');
    title.textContent = stage;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = list.length;
    header.append(title, count);
    column.append(header);

    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'column-empty';
      empty.textContent = '暂无';
      column.append(empty);
    }

    list.forEach(c => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card';
      const level = getOverdueLevel(c);
      if (level) card.classList.add('overdue-' + level);

      const name = document.createElement('div');
      name.className = 'card-name';
      name.textContent = c.name;

      const meta = document.createElement('div');
      meta.className = 'card-meta';
      meta.textContent = c.position + ' · ' + c.source;

      card.append(name, meta);

      const latest = getLatestEvaluation(c);
      if (latest) {
        const score = document.createElement('div');
        score.className = 'card-score';
        score.textContent = latest.round + '评分 ' + formatStars(latest.score);
        score.title = `${latest.round}：${latest.score} 分（${latest.interviewer}）`;
        card.append(score);
      }

      // Offer 和淘汰已有结论，停留天数没有意义，不显示
      if (!FINAL_STAGES.includes(c.stage)) {
        const days = document.createElement('div');
        days.className = 'card-days';
        days.textContent = '已停留 ' + getStayDays(c) + ' 天';
        card.append(days);
      }
      card.addEventListener('click', () => openDialog(c.id));
      column.append(card);
    });

    board.append(column);
  });
}

// 岗位输入框的下拉提示，减少手误打出不同的岗位名
function renderPositionOptions() {
  const datalist = document.getElementById('position-list');
  datalist.innerHTML = '';
  const positions = new Set([...Object.keys(templates), ...candidates.map(c => c.position)]);
  positions.forEach(position => {
    const option = document.createElement('option');
    option.value = position;
    datalist.append(option);
  });
}

function fillSelect(select, options) {
  options.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
}

// ========== 弹窗：新增 / 编辑 / 删除 ==========
const dialog = document.getElementById('dialog');
const form = document.getElementById('form');

// 根据岗位输入框的内容，刷新"当前阶段"的可选项和流程提示
function renderStageOptions() {
  const position = form.elements.position.value.trim();
  let stages = getStagesFor(position);

  // 编辑时，如果候选人所在的轮次已被模板移除，仍保留这一项，避免阶段被悄悄改掉
  const c = candidates.find(item => item.id === editingId);
  if (c && c.position === position && !stages.includes(c.stage)) {
    stages = STAGES.filter(stage => stages.includes(stage) || stage === c.stage);
  }

  const select = document.getElementById('stage-select');
  const previous = select.value;
  select.innerHTML = '';
  fillSelect(select, stages);
  select.value = stages.includes(previous) ? previous : STAGES[0];

  document.getElementById('flow-hint').textContent =
    '面试流程：' + ['待约面', ...getRounds(position)].join(' → ') + ' → Offer / 淘汰';
}

form.elements.position.addEventListener('input', renderStageOptions);

function openDialog(id) {
  editingId = id;
  form.reset();

  if (id === null) {
    document.getElementById('dialog-title').textContent = '新增候选人';
    document.getElementById('btn-delete').hidden = true;
    renderStageOptions();
    form.elements.stage.value = STAGES[0];
    document.getElementById('eval-section').hidden = true;
    document.getElementById('btn-invite').hidden = true;
  } else {
    const c = candidates.find(item => item.id === id);
    document.getElementById('dialog-title').textContent = '编辑候选人';
    document.getElementById('btn-delete').hidden = false;
    form.elements.name.value = c.name;
    form.elements.contact.value = c.contact;
    form.elements.position.value = c.position;
    form.elements.source.value = c.source;
    renderStageOptions();
    form.elements.stage.value = c.stage;
    form.elements.note.value = c.note;
    document.getElementById('eval-section').hidden = false;
    renderEvalList(c);

    // Offer 和淘汰已有结论，不需要再发面试邀请
    const inviteBtn = document.getElementById('btn-invite');
    inviteBtn.hidden = false;
    inviteBtn.disabled = FINAL_STAGES.includes(c.stage);
    inviteBtn.title = inviteBtn.disabled ? '该候选人已有结论，无需发送面试邀请' : '';
  }
  dialog.showModal();
}

form.addEventListener('submit', event => {
  event.preventDefault();

  const data = {
    name: form.elements.name.value.trim(),
    contact: form.elements.contact.value.trim(),
    position: form.elements.position.value.trim(),
    source: form.elements.source.value,
    stage: form.elements.stage.value,
    note: form.elements.note.value.trim(),
  };
  if (!data.name || !data.position) {
    alert('姓名和应聘岗位不能为空。');
    return;
  }

  if (editingId === null) {
    const now = Date.now();
    // createdAt：首次录入时间，之后不再改变；stageChangedAt：进入当前阶段的时间
    candidates.push({ id: createId(), ...data, createdAt: now, stageChangedAt: now, evaluations: {} });
  } else {
    const c = candidates.find(item => item.id === editingId);
    // 只有阶段真的变了才重新计时，改其他字段不影响
    if (c.stage !== data.stage) c.stageChangedAt = Date.now();
    Object.assign(c, data);
  }
  saveData();
  render();
  dialog.close();
});

document.getElementById('btn-delete').addEventListener('click', () => {
  const c = candidates.find(item => item.id === editingId);
  if (!confirm(`确定删除「${c.name}」吗？`)) return;
  candidates = candidates.filter(item => item.id !== editingId);
  saveData();
  render();
  dialog.close();
});

document.getElementById('btn-cancel').addEventListener('click', () => dialog.close());
document.getElementById('btn-add').addEventListener('click', () => openDialog(null));

// ========== 面试评价 ==========
const evalDialog = document.getElementById('eval-dialog');
const evalForm = document.getElementById('eval-form');
let evalRound = null; // 正在填写评价的轮次

// 在候选人弹窗里显示各轮评价
function renderEvalList(c) {
  const list = document.getElementById('eval-list');
  list.innerHTML = '';

  const rounds = getEvaluableRounds(c);
  if (rounds.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'form-hint';
    empty.textContent = '候选人进入面试轮次后，可在这里填写评价。';
    list.append(empty);
    return;
  }

  rounds.forEach(round => {
    const evaluation = (c.evaluations || {})[round];
    const item = document.createElement('div');
    item.className = 'eval-item';

    const header = document.createElement('div');
    header.className = 'eval-header';
    const title = document.createElement('strong');
    title.textContent = round;
    header.append(title);

    if (evaluation) {
      const score = document.createElement('span');
      score.className = 'eval-stars';
      score.textContent = formatStars(evaluation.score) + ' ' + evaluation.score + ' 分';
      const interviewer = document.createElement('span');
      interviewer.className = 'eval-interviewer';
      interviewer.textContent = '面试官：' + evaluation.interviewer;
      header.append(score, interviewer);
    }

    const actions = document.createElement('span');
    actions.className = 'eval-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-link';
    editBtn.textContent = evaluation ? '修改' : '填写评价';
    editBtn.addEventListener('click', () => openEvalDialog(round));
    actions.append(editBtn);

    if (evaluation) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-link danger';
      delBtn.textContent = '删除';
      delBtn.addEventListener('click', () => deleteEvaluation(round));
      actions.append(delBtn);
    }
    header.append(actions);
    item.append(header);

    if (evaluation && evaluation.comment) {
      const comment = document.createElement('p');
      comment.className = 'eval-comment';
      comment.textContent = evaluation.comment;
      item.append(comment);
    }
    list.append(item);
  });
}

function openEvalDialog(round) {
  const c = candidates.find(item => item.id === editingId);
  const evaluation = (c.evaluations || {})[round];
  evalRound = round;
  evalForm.reset();
  document.getElementById('eval-title').textContent = `${c.name} · ${round}评价`;
  if (evaluation) {
    evalForm.elements.interviewer.value = evaluation.interviewer;
    evalForm.elements.score.value = String(evaluation.score);
    evalForm.elements.comment.value = evaluation.comment;
  }
  evalDialog.showModal();
}

function deleteEvaluation(round) {
  const c = candidates.find(item => item.id === editingId);
  if (!confirm(`确定删除「${c.name}」的${round}评价吗？`)) return;
  delete c.evaluations[round];
  saveData();
  render();
  renderEvalList(c);
}

evalForm.addEventListener('submit', event => {
  event.preventDefault();

  const interviewer = evalForm.elements.interviewer.value.trim();
  const score = Number(evalForm.elements.score.value);
  if (!interviewer || !score) {
    alert('面试官和评分不能为空。');
    return;
  }

  const c = candidates.find(item => item.id === editingId);
  if (!c.evaluations) c.evaluations = {};
  c.evaluations[evalRound] = {
    interviewer,
    score,
    comment: evalForm.elements.comment.value.trim(),
  };
  saveData();
  render();
  renderEvalList(c);
  evalDialog.close();
});

document.getElementById('btn-eval-cancel').addEventListener('click', () => evalDialog.close());

// ========== 面试邀请文案 ==========
const inviteDialog = document.getElementById('invite-dialog');
const inviteForm = document.getElementById('invite-form');

// 默认邀请的轮次：正处于某一轮就是这一轮，待约面则是岗位的第一轮
function getDefaultInviteRound(c) {
  const rounds = getRounds(c.position);
  return rounds.includes(c.stage) ? c.stage : rounds[0];
}

function loadCompany() {
  try {
    return localStorage.getItem(COMPANY_KEY) || '';
  } catch (e) {
    return '';
  }
}

function saveCompany(company) {
  try {
    localStorage.setItem(COMPANY_KEY, company);
  } catch (e) {
    // 记不住公司名不影响生成文案，忽略即可
  }
}

// 时间、地点、面试官留空时，保留【请填写…】空位；公司名称留空时用"我司"
function buildInviteText(c, round, time, location, interviewer, company) {
  const blank = label => `【请填写${label}】`;
  // 岗位名本身以"岗"结尾（如综合管理岗）时，不再重复加"岗位"
  const positionText = c.position.endsWith('岗') ? c.position : c.position + '岗位';
  const isFirstRound = round === getRounds(c.position)[0];
  const opening = isFirstRound
    ? `感谢您对${company || '我司'}${positionText}的关注。经过简历初步筛选，我们诚挚地邀请您参加${round}。`
    : `恭喜您通过上一轮面试！我们诚挚地邀请您参加${positionText}的${round}。`;

  return [
    `尊敬的${c.name}：`,
    '',
    `您好！${opening}具体安排如下：`,
    '',
    `应聘岗位：${c.position}`,
    `面试轮次：${round}`,
    `面试时间：${time || blank('面试时间')}`,
    `面试地点：${location || blank('面试地点')}`,
    `面试官：${interviewer || blank('面试官')}`,
    '',
    '请您提前 10 分钟到达，并携带个人简历及相关证书材料。如为线上面试，请提前调试好设备和网络。',
    '如时间上有冲突，请及时回复告知，我们将为您另行安排。',
    '',
    '期待与您见面！',
    '',
    company ? `${company} 人力资源部` : '人力资源部',
  ].join('\n');
}

function renderInviteText() {
  const c = candidates.find(item => item.id === editingId);
  inviteForm.elements.text.value = buildInviteText(
    c,
    inviteForm.elements.round.value,
    inviteForm.elements.time.value.trim(),
    inviteForm.elements.location.value.trim(),
    inviteForm.elements.interviewer.value.trim(),
    inviteForm.elements.company.value.trim()
  );
}

function openInviteDialog() {
  const c = candidates.find(item => item.id === editingId);
  inviteForm.reset();
  inviteForm.elements.company.value = loadCompany();
  document.getElementById('invite-title').textContent = `面试邀请 · ${c.name}`;

  const roundSelect = document.getElementById('invite-round');
  roundSelect.innerHTML = '';
  fillSelect(roundSelect, getRounds(c.position));
  roundSelect.value = getDefaultInviteRound(c);

  renderInviteText();
  document.getElementById('btn-copy').textContent = '复制';
  inviteDialog.showModal();
}

async function copyInviteText() {
  const textarea = document.getElementById('invite-text');
  const btn = document.getElementById('btn-copy');
  try {
    await navigator.clipboard.writeText(textarea.value);
  } catch (e) {
    // 部分浏览器环境（如直接双击打开的本地文件）不支持新接口，改用传统的复制方式
    textarea.select();
    if (!document.execCommand('copy')) {
      alert('复制失败，请手动选中文案后复制。');
      return;
    }
  }
  btn.textContent = '已复制 ✓';
  setTimeout(() => (btn.textContent = '复制'), 2000);
}

document.getElementById('btn-invite').addEventListener('click', openInviteDialog);
document.getElementById('btn-copy').addEventListener('click', copyInviteText);
document.getElementById('btn-invite-close').addEventListener('click', () => inviteDialog.close());
// 修改公司、轮次、时间、地点、面试官时重新生成文案（直接改文案框不会触发）
['company', 'round', 'time', 'location', 'interviewer'].forEach(name => {
  inviteForm.elements[name].addEventListener('input', renderInviteText);
});
// 公司名称每次修改都记住，下次打开自动填好
inviteForm.elements.company.addEventListener('input', () => {
  saveCompany(inviteForm.elements.company.value.trim());
});
// 在输入框里按回车不提交表单
inviteForm.addEventListener('submit', event => event.preventDefault());

// ========== 岗位流程模板 ==========
const templateDialog = document.getElementById('template-dialog');
let templateDraft = {}; // 弹窗里编辑中的模板，点"保存"才生效

function openTemplateDialog() {
  templateDraft = {};
  const positions = new Set([...Object.keys(templates), ...candidates.map(c => c.position)]);
  positions.forEach(position => {
    templateDraft[position] = [...getRounds(position)];
  });
  document.getElementById('new-position').value = '';
  renderTemplateRows();
  templateDialog.showModal();
}

function renderTemplateRows() {
  const tbody = document.getElementById('template-rows');
  tbody.innerHTML = '';

  const positions = Object.keys(templateDraft);
  if (positions.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = ROUNDS.length + 2;
    td.className = 'template-empty';
    td.textContent = '还没有岗位，请在下方添加。';
    tr.append(td);
    tbody.append(tr);
    return;
  }

  positions.forEach(position => {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = position;
    tr.append(nameTd);

    ROUNDS.forEach(round => {
      const td = document.createElement('td');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = templateDraft[position].includes(round);
      box.setAttribute('aria-label', position + ' ' + round);
      box.addEventListener('change', () => {
        const selected = new Set(templateDraft[position]);
        if (box.checked) selected.add(round);
        else selected.delete(round);
        // 按一面、二面、终面的固定顺序保存
        templateDraft[position] = ROUNDS.filter(r => selected.has(r));
      });
      td.append(box);
      tr.append(td);
    });

    const actionTd = document.createElement('td');
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn-link danger';
    del.textContent = '删除';
    if (candidates.some(c => c.position === position)) {
      del.disabled = true;
      del.title = '该岗位还有候选人，不能删除';
    }
    del.addEventListener('click', () => {
      delete templateDraft[position];
      renderTemplateRows();
    });
    actionTd.append(del);
    tr.append(actionTd);

    tbody.append(tr);
  });
}

function addTemplatePosition() {
  const input = document.getElementById('new-position');
  const position = input.value.trim();
  if (!position) return;
  if (templateDraft[position]) {
    alert(`「${position}」已经存在。`);
    return;
  }
  templateDraft[position] = [...ROUNDS];
  input.value = '';
  renderTemplateRows();
}

document.getElementById('btn-templates').addEventListener('click', openTemplateDialog);
document.getElementById('btn-add-position').addEventListener('click', addTemplatePosition);
document.getElementById('new-position').addEventListener('keydown', event => {
  // 在输入框里按回车是添加岗位，而不是保存整个模板
  if (event.key === 'Enter') {
    event.preventDefault();
    addTemplatePosition();
  }
});
document.getElementById('btn-template-cancel').addEventListener('click', () => templateDialog.close());

document.getElementById('template-form').addEventListener('submit', event => {
  event.preventDefault();

  const empty = Object.keys(templateDraft).find(position => templateDraft[position].length === 0);
  if (empty) {
    alert(`「${empty}」至少要保留一轮面试。`);
    return;
  }

  templates = templateDraft;
  saveTemplates();
  render();
  templateDialog.close();

  // 已在被移除轮次里的候选人不自动挪动，提醒 HR 手动处理
  const stranded = candidates.filter(c => ROUNDS.includes(c.stage) && !getRounds(c.position).includes(c.stage));
  if (stranded.length > 0) {
    alert(`已保存。注意：${stranded.map(c => c.name).join('、')} 所在的轮次已从模板中移除，暂时保留在原阶段，请手动调整。`);
  }
});

// ========== 导出 CSV ==========
function toCsvCell(value) {
  let text = String(value ?? '');
  // 以 = + - @ 开头的内容会被 Excel 当作公式执行，前面加单引号避免
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  if (/[",\r\n]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
  return text;
}

function exportCsv() {
  if (candidates.length === 0) {
    alert('暂无数据可导出。');
    return;
  }

  const rows = [];
  rows.push(['候选人明细']);
  rows.push(['姓名', '联系方式', '应聘岗位', '来源渠道', '当前阶段', '备注']);
  STAGES.forEach(stage => {
    candidates
      .filter(c => c.stage === stage)
      .forEach(c => rows.push([c.name, c.contact, c.position, c.source, c.stage, c.note]));
  });

  rows.push([]);
  rows.push(['面试评价明细']);
  rows.push(['姓名', '应聘岗位', '轮次', '面试官', '评分', '评语']);
  let evaluationCount = 0;
  STAGES.forEach(stage => {
    candidates
      .filter(c => c.stage === stage)
      .forEach(c => {
        ROUNDS.forEach(round => {
          const e = (c.evaluations || {})[round];
          if (!e) return;
          rows.push([c.name, c.position, round, e.interviewer, e.score, e.comment]);
          evaluationCount++;
        });
      });
  });
  if (evaluationCount === 0) rows.push(['暂无评价']);

  rows.push([]);
  rows.push(['各阶段人数']);
  rows.push(['阶段', '人数']);
  STAGES.forEach(stage => {
    rows.push([stage, candidates.filter(c => c.stage === stage).length]);
  });

  rows.push([]);
  rows.push(['各岗位通过率（Offer ÷（Offer + 淘汰））']);
  rows.push(['岗位', '总人数', 'Offer', '淘汰', '通过率']);
  getPositionStats().forEach(s => {
    rows.push([s.position, s.total, s.offer, s.rejected, formatRate(s.rate)]);
  });

  rows.push([]);
  rows.push(['招聘周期（从首次录入到进入 Offer / 淘汰的平均天数）']);
  rows.push(['指标', '平均天数', '统计人数']);
  CYCLE_STATS.forEach(({ label, stage }) => {
    const cycle = getAverageCycle(stage);
    rows.push([label, cycle ? cycle.days.toFixed(1) : '暂无数据', cycle ? cycle.count : 0]);
  });

  const csv = rows.map(row => row.map(toCsvCell).join(',')).join('\r\n');
  // 开头的 ﻿ 是 BOM，让 Excel 按 UTF-8 打开，中文不乱码
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `面试汇总_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.getElementById('btn-export').addEventListener('click', exportCsv);

// ========== 导入 CSV ==========
const IMPORT_MAX_SIZE = 5 * 1024 * 1024;
const IMPORT_MAX_REASONS = 10; // 结果提示里最多列出的跳过原因条数

// 表头名称 → 字段；同一字段允许几种常见写法
const IMPORT_COLUMNS = {
  name: ['姓名'],
  contact: ['联系方式', '电话', '手机'],
  position: ['应聘岗位', '岗位'],
  source: ['来源渠道', '来源'],
  stage: ['当前阶段', '阶段'],
  note: ['备注'],
  createdDate: ['首次录入日期', '录入日期'],
  stageDate: ['进入当前阶段日期', '进入阶段日期'],
};
const IMPORT_REQUIRED = { name: '姓名', position: '应聘岗位', stage: '当前阶段' };

// 本工具导出的 CSV 里，候选人明细后面的其他部分，读到这里就停止
const EXPORT_SECTION_TITLES = ['面试评价明细', '各阶段人数', '各岗位通过率', '招聘周期'];

// 把 CSV 文本拆成二维数组，支持引号包裹、字段内的逗号、换行和 "" 转义
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// 去掉首尾空格，以及导出时为防止公式执行而加的单引号
function cleanCell(value) {
  const text = (value ?? '').trim();
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

// 解析 2026-09-01、2026/9/1、2026.9.1、2026年9月1日，返回当天 0 点的时间戳；格式错误或日期不存在时返回 null
function parseDate(text) {
  const m = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (!m) return null;
  const [year, month, day] = m.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  // 排除 2026-02-30 这类会被自动顺延的日期
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date.getTime();
}

// Excel 在中文 Windows 上另存的 CSV 通常是 GBK 编码，UTF-8 解码失败时改用 GBK
async function readCsvText(file) {
  const buffer = await file.arrayBuffer();
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (e) {
    text = new TextDecoder('gbk').decode(buffer);
  }
  return text.replace(/^﻿/, '');
}

// 校验并转换 CSV；返回 { imported, skipped }，文件整体不可用时抛出带中文说明的错误
function importCandidates(text) {
  const rows = parseCsv(text).map(row => row.map(cleanCell));

  // 表头可能不在第一行（本工具导出的文件第一行是"候选人明细"）
  const headerIndex = rows.findIndex(row => row.some(cell => IMPORT_COLUMNS.name.includes(cell)));
  if (headerIndex === -1) {
    throw new Error('没有找到表头。第一行应包含"姓名、应聘岗位、当前阶段"等列名。');
  }
  const header = rows[headerIndex];
  const columnIndex = {};
  Object.entries(IMPORT_COLUMNS).forEach(([key, names]) => {
    const index = header.findIndex(cell => names.includes(cell));
    if (index !== -1) columnIndex[key] = index;
  });
  const missing = Object.keys(IMPORT_REQUIRED).filter(key => columnIndex[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`表头缺少必需的列：${missing.map(key => IMPORT_REQUIRED[key]).join('、')}。`);
  }

  const now = Date.now();
  const imported = [];
  const skipped = [];
  // 已有候选人和本次文件里的候选人都参与去重
  const seen = new Set(candidates.map(c => [c.name, c.contact, c.position].join('|')));

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const lineNo = i + 1; // 与 Excel 中的行号一致
    if (row.every(cell => cell === '')) continue;
    if (row.filter(cell => cell !== '').length === 1 && EXPORT_SECTION_TITLES.some(t => row.find(cell => cell).startsWith(t))) break;

    const get = key => (columnIndex[key] === undefined ? '' : (row[columnIndex[key]] ?? ''));
    const skip = reason => skipped.push(`第 ${lineNo} 行${reason}`);

    const name = get('name');
    const position = get('position');
    const stage = get('stage');
    if (!name) { skip('缺少姓名'); continue; }
    if (!position) { skip('缺少应聘岗位'); continue; }
    if (!stage) { skip('缺少当前阶段'); continue; }
    if (!STAGES.includes(stage)) { skip(`阶段名称无效（${stage}）`); continue; }
    if (!getStagesFor(position).includes(stage)) { skip(`阶段"${stage}"不在${position}的面试流程中`); continue; }

    const createdText = get('createdDate');
    const stageText = get('stageDate');
    const createdDate = createdText ? parseDate(createdText) : null;
    const stageDate = stageText ? parseDate(stageText) : null;
    if (createdText && createdDate === null) { skip(`首次录入日期格式错误（${createdText}）`); continue; }
    if (stageText && stageDate === null) { skip(`进入当前阶段日期格式错误（${stageText}）`); continue; }
    if ((createdDate ?? 0) > now || (stageDate ?? 0) > now) { skip('日期晚于今天'); continue; }

    // 没填日期时按导入时间计算，和手动新增候选人一致
    const stageChangedAt = stageDate ?? now;
    const createdAt = createdDate ?? stageChangedAt;
    if (createdAt > stageChangedAt) { skip('进入当前阶段日期早于首次录入日期'); continue; }

    const contact = get('contact');
    const key = [name, contact, position].join('|');
    if (seen.has(key)) { skip(`与已有候选人重复（${name}）`); continue; }
    seen.add(key);

    const source = get('source');
    imported.push({
      id: createId(),
      name,
      contact,
      position,
      source: SOURCES.includes(source) ? source : '其他',
      stage,
      note: get('note'),
      createdAt,
      stageChangedAt,
      evaluations: {},
    });
  }
  return { imported, skipped };
}

const importInput = document.getElementById('import-input');

document.getElementById('btn-import').addEventListener('click', () => importInput.click());

importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  // 清空选择，下次选同一个文件也能触发
  importInput.value = '';
  if (!file) return;

  if (file.size > IMPORT_MAX_SIZE) {
    alert('导入失败：文件过大（超过 5MB）。');
    return;
  }

  let result;
  try {
    result = importCandidates(await readCsvText(file));
  } catch (e) {
    alert('导入失败：' + e.message + '\n\n当前数据没有任何改动。');
    return;
  }

  const { imported, skipped } = result;
  if (imported.length > 0) {
    candidates.push(...imported);
    saveData();
    render();
  }

  let message = imported.length > 0 ? `成功导入 ${imported.length} 条` : '没有导入任何数据';
  if (skipped.length > 0) {
    const shown = skipped.slice(0, IMPORT_MAX_REASONS).join('、');
    const more = skipped.length > IMPORT_MAX_REASONS ? ` 等，共 ${skipped.length} 条` : '';
    message += `，跳过 ${skipped.length} 条（${shown}${more}）`;
  } else if (imported.length === 0) {
    message += '：文件中没有候选人数据行';
  }
  alert(message + '。');
});

// ========== 示例数据 / 清空 ==========
// 全部为虚构人物，电话号码使用明显的假号码
// days：载入时已在当前阶段停留的天数，用来演示超时提醒
// createdDays：载入时距首次录入的天数，必须 ≥ days；两者之差就是走到当前阶段用了多少天
// 待约面的人刚录入就在这个阶段，所以两者相等
// 平均招聘周期 = (28 + 21 + 21 + 14) ÷ 4 = 21.0 天；平均淘汰周期 = (30 + 14 + 5 + 9) ÷ 4 = 14.5 天
const SAMPLE_DATA = [
  { name: '张明远', position: '综合管理岗', source: '招聘网站', stage: '待约面', note: '有 2 年办公室综合管理经验', days: 2, createdDays: 2 },
  { name: '李思雨', position: '综合管理岗', source: '内部推荐', stage: '二面', note: '一面沟通表达评价良好', days: 5, createdDays: 18 },
  { name: '王浩然', position: '综合管理岗', source: '校园招聘', stage: 'Offer', note: '已接受 Offer，下月入职', days: 20, createdDays: 48 }, // 招聘周期 28 天
  { name: '陈雨桐', position: '综合管理岗', source: '招聘网站', stage: 'Offer', note: '等待回复', days: 3, createdDays: 24 }, // 招聘周期 21 天
  { name: '刘子轩', position: '综合管理岗', source: '校园宣讲会', stage: '淘汰', note: '薪资期望差距较大', days: 25, createdDays: 55 }, // 终面后淘汰，30 天
  { name: '赵欣怡', position: '人力资源专员', source: '内部推荐', stage: '二面', note: '有招聘模块实习经历', days: 1, createdDays: 12 },
  { name: '孙嘉豪', position: '人力资源专员', source: '招聘网站', stage: '终面', note: '待人力资源总监面', days: 18, createdDays: 35 },
  { name: '周诗涵', position: '人力资源专员', source: '校园宣讲会', stage: 'Offer', note: '', days: 9, createdDays: 30 }, // 招聘周期 21 天
  { name: '吴俊杰', position: '人力资源专员', source: '招聘网站', stage: '淘汰', note: '二面未通过', days: 12, createdDays: 26 }, // 二面淘汰，14 天
  { name: '郑可欣', position: '人力资源专员', source: '校园招聘', stage: '淘汰', note: '一面未通过', days: 6, createdDays: 11 }, // 一面淘汰，5 天
  { name: '冯宇航', position: '行政文员', source: '招聘网站', stage: '一面', note: '', days: 10, createdDays: 14 },
  { name: '何雅婷', position: '行政文员', source: '内部推荐', stage: 'Offer', note: '熟练使用办公软件', days: 4, createdDays: 18 }, // 只有两轮，招聘周期 14 天
  { name: '许文博', position: '行政文员', source: '其他', stage: '淘汰', note: '候选人主动放弃', days: 15, createdDays: 24 }, // 一面后放弃，9 天
  { name: '高梦瑶', position: '财务助理', source: '校园招聘', stage: '待约面', note: '已取得初级会计证书', days: 9, createdDays: 9 },
  { name: '林子涵', position: '财务助理', source: '校园宣讲会', stage: '一面', note: '', days: 16, createdDays: 20 },
];

// 示例面试评价，按候选人姓名对应；二面及之后的候选人都有已完成轮次的评价
const SAMPLE_EVALUATIONS = {
  '李思雨': {
    '一面': { interviewer: '王经理', score: 4, comment: '沟通表达清晰，思路有条理' },
  },
  '赵欣怡': {
    '一面': { interviewer: '刘主管', score: 4, comment: '熟悉招聘流程，实习经历与岗位匹配' },
  },
  '孙嘉豪': {
    '一面': { interviewer: '刘主管', score: 4, comment: '基础扎实，对劳动法规有一定了解' },
    '二面': { interviewer: '陈经理', score: 5, comment: '案例分析出色，推荐进入终面' },
  },
  '王浩然': {
    '一面': { interviewer: '王经理', score: 4, comment: '态度积极，学习能力强' },
    '二面': { interviewer: '李主管', score: 4, comment: '组织协调案例回答完整' },
    '终面': { interviewer: '张总监', score: 5, comment: '综合素质突出，建议录用' },
  },
  '陈雨桐': {
    '一面': { interviewer: '王经理', score: 5, comment: '有相关工作经验，表达流畅' },
    '二面': { interviewer: '李主管', score: 4, comment: '文字材料能力较好' },
    '终面': { interviewer: '张总监', score: 4, comment: '符合岗位要求，同意录用' },
  },
  '刘子轩': {
    '一面': { interviewer: '王经理', score: 4, comment: '能力与岗位匹配' },
    '二面': { interviewer: '李主管', score: 4, comment: '专业能力达标' },
    '终面': { interviewer: '张总监', score: 3, comment: '能力可以，但薪资期望超出预算较多' },
  },
  '周诗涵': {
    '一面': { interviewer: '刘主管', score: 4, comment: '亲和力强，沟通顺畅' },
    '二面': { interviewer: '陈经理', score: 4, comment: '对员工关系模块有自己的理解' },
    '终面': { interviewer: '赵总监', score: 4, comment: '同意录用' },
  },
  '吴俊杰': {
    '一面': { interviewer: '刘主管', score: 3, comment: '基础一般，可进入二面进一步考察' },
    '二面': { interviewer: '陈经理', score: 2, comment: '案例分析缺乏思路，不建议录用' },
  },
  '郑可欣': {
    '一面': { interviewer: '刘主管', score: 2, comment: '对岗位职责了解不足' },
  },
  '何雅婷': {
    '一面': { interviewer: '孙主管', score: 4, comment: '办公软件操作熟练' },
    '终面': { interviewer: '张总监', score: 5, comment: '细致认真，建议录用' },
  },
  '许文博': {
    '一面': { interviewer: '孙主管', score: 4, comment: '表现良好，后因个人原因放弃' },
  },
};

const SAMPLE_TEMPLATES = {
  '综合管理岗': ['一面', '二面', '终面'],
  '人力资源专员': ['一面', '二面', '终面'],
  '行政文员': ['一面', '终面'],
  '财务助理': ['一面', '终面'],
};

document.getElementById('btn-sample').addEventListener('click', () => {
  // 已有数据时才需要确认，空的直接载入
  if (candidates.length > 0 && !confirm('载入示例数据将覆盖现有数据和流程模板，是否继续？')) return;

  templates = JSON.parse(JSON.stringify(SAMPLE_TEMPLATES));
  saveTemplates();

  const now = Date.now();
  candidates = SAMPLE_DATA.map(({ days, createdDays, ...item }, index) => ({
    id: createId(),
    contact: '138-0000-' + String(index + 1).padStart(4, '0'),
    ...item,
    createdAt: now - createdDays * DAY_MS,
    stageChangedAt: now - days * DAY_MS,
    // 复制一份，避免之后修改评价时改动到示例数据本身
    evaluations: JSON.parse(JSON.stringify(SAMPLE_EVALUATIONS[item.name] || {})),
  }));
  saveData();
  render();
});

document.getElementById('btn-clear').addEventListener('click', () => {
  if (candidates.length === 0) {
    alert('当前没有数据。');
    return;
  }
  if (!confirm('确定清空全部数据吗？此操作无法撤销。')) return;
  candidates = [];
  saveData();
  render();
});

// ========== 备份与恢复 ==========
const BACKUP_APP = 'interview-tracker'; // 备份文件标识，用来识别是不是本工具导出的文件
const BACKUP_VERSION = 1;
const BACKUP_MAX_SIZE = 5 * 1024 * 1024; // 5MB，正常备份远小于这个大小

// 面试评价保存在每个候选人的 evaluations 里，随候选人一起备份
document.getElementById('btn-backup').addEventListener('click', () => {
  if (candidates.length === 0 && Object.keys(templates).length === 0) {
    alert('当前没有数据可备份。');
    return;
  }

  const backup = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    candidates,
    templates,
    company: loadCompany(),
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `面试数据备份_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

const isTime = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const toText = value => (typeof value === 'string' ? value : '');

// 检查并整理备份内容；格式不对时抛出带中文说明的错误，由调用方提示给用户
// 只保留认识的字段，缺少的可选字段补上默认值
function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('文件内容不是有效的 JSON 格式。');
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.candidates)) {
    throw new Error('文件中没有找到候选人数据，可能不是本工具导出的备份文件。');
  }
  if (data.app !== undefined && data.app !== BACKUP_APP) {
    throw new Error('这不是本工具导出的备份文件。');
  }

  // 岗位流程模板
  const rawTemplates = data.templates ?? {};
  if (typeof rawTemplates !== 'object' || Array.isArray(rawTemplates)) {
    throw new Error('流程模板数据格式不正确。');
  }
  const cleanTemplates = {};
  Object.entries(rawTemplates).forEach(([position, rounds]) => {
    if (!Array.isArray(rounds) || rounds.length === 0 || !rounds.every(r => ROUNDS.includes(r))) {
      throw new Error(`岗位「${position}」的流程模板格式不正确。`);
    }
    cleanTemplates[position] = ROUNDS.filter(r => rounds.includes(r));
  });

  // 候选人（含面试评价）
  const ids = new Set();
  const now = Date.now();
  const cleanCandidates = data.candidates.map((c, index) => {
    const label = `第 ${index + 1} 位候选人`;
    if (!c || typeof c !== 'object') throw new Error(`${label}的数据格式不正确。`);
    if (typeof c.name !== 'string' || !c.name.trim()) throw new Error(`${label}缺少姓名。`);
    if (typeof c.position !== 'string' || !c.position.trim()) throw new Error(`「${c.name}」缺少应聘岗位。`);
    if (!STAGES.includes(c.stage)) throw new Error(`「${c.name}」的阶段"${c.stage}"无法识别。`);

    const evaluations = {};
    if (c.evaluations != null) {
      if (typeof c.evaluations !== 'object' || Array.isArray(c.evaluations)) {
        throw new Error(`「${c.name}」的面试评价格式不正确。`);
      }
      Object.entries(c.evaluations).forEach(([round, e]) => {
        const valid = ROUNDS.includes(round) && e && typeof e.interviewer === 'string'
          && Number.isInteger(e.score) && e.score >= 1 && e.score <= 5;
        if (!valid) throw new Error(`「${c.name}」的${round}评价格式不正确。`);
        evaluations[round] = { interviewer: e.interviewer, score: e.score, comment: toText(e.comment) };
      });
    }

    // id 缺失或重复时重新生成，避免点击卡片时找错人
    let id = typeof c.id === 'string' && c.id ? c.id : createId();
    if (ids.has(id)) id = createId();
    ids.add(id);

    const clean = {
      id,
      name: c.name.trim(),
      contact: toText(c.contact),
      position: c.position.trim(),
      source: toText(c.source) || '其他',
      stage: c.stage,
      note: toText(c.note),
      stageChangedAt: isTime(c.stageChangedAt) ? c.stageChangedAt : now,
      evaluations,
    };
    // 旧版本数据没有首次录入时间，保持缺失（不参与周期统计）
    if (isTime(c.createdAt)) clean.createdAt = c.createdAt;
    return clean;
  });

  return {
    candidates: cleanCandidates,
    templates: cleanTemplates,
    company: typeof data.company === 'string' ? data.company : null,
    exportedAt: data.exportedAt,
  };
}

const restoreInput = document.getElementById('restore-input');

document.getElementById('btn-restore').addEventListener('click', () => restoreInput.click());

restoreInput.addEventListener('change', async () => {
  const file = restoreInput.files[0];
  // 清空选择，下次选同一个文件也能触发
  restoreInput.value = '';
  if (!file) return;

  if (file.size > BACKUP_MAX_SIZE) {
    alert('恢复失败：文件过大，不是有效的备份文件。');
    return;
  }

  let backup;
  try {
    backup = parseBackup(await file.text());
  } catch (e) {
    alert('恢复失败：' + e.message + '\n\n当前数据没有任何改动。');
    return;
  }

  const time = new Date(backup.exportedAt);
  const timeText = isNaN(time) ? '未知' : time.toLocaleString('zh-CN');
  const message = `将用备份文件覆盖当前全部数据：\n\n`
    + `备份时间：${timeText}\n`
    + `候选人：${backup.candidates.length} 位\n`
    + `流程模板：${Object.keys(backup.templates).length} 个岗位\n\n`
    + `当前数据将被替换且无法找回，是否继续？`;
  if (!confirm(message)) return;

  candidates = backup.candidates;
  templates = backup.templates;
  saveData();
  saveTemplates();
  if (backup.company !== null) saveCompany(backup.company);
  render();
  alert(`恢复成功，共 ${candidates.length} 位候选人。`);
});

// ========== 初始化 ==========
// 旧版本保存的数据没有进入阶段的时间，从现在开始计时
if (candidates.some(c => !c.stageChangedAt)) {
  candidates.forEach(c => {
    if (!c.stageChangedAt) c.stageChangedAt = Date.now();
  });
  saveData();
}
fillSelect(document.getElementById('source-select'), SOURCES);
render();
