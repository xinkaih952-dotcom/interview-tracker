// ========== 常量 ==========
const STORAGE_KEY = 'interview-tool-candidates';
const STAGES = ['待约面', '一面', '二面', '终面', 'Offer', '淘汰'];
const SOURCES = ['校园招聘', '校园宣讲会', '内部推荐', '招聘网站', '其他'];

// ========== 数据 ==========
let candidates = loadData();
let editingId = null; // 正在编辑的候选人 id，新增时为 null

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

function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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

function formatRate(rate) {
  return rate === null ? '暂无数据' : Math.round(rate * 100) + '%';
}

// ========== 渲染 ==========
function render() {
  renderStats();
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

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  if (candidates.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'board-empty';
    empty.textContent = '还没有候选人。点击右上角"新增候选人"，或在页面底部"载入示例数据"。';
    board.append(empty);
    return;
  }

  STAGES.forEach((stage, index) => {
    const list = candidates.filter(c => c.stage === stage);

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

      const name = document.createElement('div');
      name.className = 'card-name';
      name.textContent = c.name;

      const meta = document.createElement('div');
      meta.className = 'card-meta';
      meta.textContent = c.position + ' · ' + c.source;

      card.append(name, meta);
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
  getPositionStats().forEach(s => {
    const option = document.createElement('option');
    option.value = s.position;
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

function openDialog(id) {
  editingId = id;
  form.reset();

  if (id === null) {
    document.getElementById('dialog-title').textContent = '新增候选人';
    document.getElementById('btn-delete').hidden = true;
    form.elements.stage.value = STAGES[0];
  } else {
    const c = candidates.find(item => item.id === id);
    document.getElementById('dialog-title').textContent = '编辑候选人';
    document.getElementById('btn-delete').hidden = false;
    form.elements.name.value = c.name;
    form.elements.contact.value = c.contact;
    form.elements.position.value = c.position;
    form.elements.source.value = c.source;
    form.elements.stage.value = c.stage;
    form.elements.note.value = c.note;
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
    candidates.push({ id: createId(), ...data });
  } else {
    const c = candidates.find(item => item.id === editingId);
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

// ========== 示例数据 / 清空 ==========
// 全部为虚构人物，电话号码使用明显的假号码
const SAMPLE_DATA = [
  { name: '张明远', position: '综合管理岗', source: '招聘网站', stage: '待约面', note: '有 2 年办公室综合管理经验' },
  { name: '李思雨', position: '综合管理岗', source: '内部推荐', stage: '二面', note: '一面沟通表达评价良好' },
  { name: '王浩然', position: '综合管理岗', source: '校园招聘', stage: 'Offer', note: '已接受 Offer，下月入职' },
  { name: '陈雨桐', position: '综合管理岗', source: '招聘网站', stage: 'Offer', note: '等待回复' },
  { name: '刘子轩', position: '综合管理岗', source: '校园宣讲会', stage: '淘汰', note: '薪资期望差距较大' },
  { name: '赵欣怡', position: '人力资源专员', source: '内部推荐', stage: '一面', note: '有招聘模块实习经历' },
  { name: '孙嘉豪', position: '人力资源专员', source: '招聘网站', stage: '终面', note: '待人力资源总监面' },
  { name: '周诗涵', position: '人力资源专员', source: '校园宣讲会', stage: 'Offer', note: '' },
  { name: '吴俊杰', position: '人力资源专员', source: '招聘网站', stage: '淘汰', note: '二面未通过' },
  { name: '郑可欣', position: '人力资源专员', source: '校园招聘', stage: '淘汰', note: '一面未通过' },
  { name: '冯宇航', position: '行政文员', source: '招聘网站', stage: '二面', note: '' },
  { name: '何雅婷', position: '行政文员', source: '内部推荐', stage: 'Offer', note: '熟练使用办公软件' },
  { name: '许文博', position: '行政文员', source: '其他', stage: '淘汰', note: '候选人主动放弃' },
  { name: '高梦瑶', position: '财务助理', source: '校园招聘', stage: '待约面', note: '已取得初级会计证书' },
  { name: '林子涵', position: '财务助理', source: '校园宣讲会', stage: '一面', note: '' },
];

document.getElementById('btn-sample').addEventListener('click', () => {
  // 已有数据时才需要确认，空的直接载入
  if (candidates.length > 0 && !confirm('载入示例数据将覆盖现有数据，是否继续？')) return;

  candidates = SAMPLE_DATA.map((item, index) => ({
    id: createId(),
    contact: '138-0000-' + String(index + 1).padStart(4, '0'),
    ...item,
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

// ========== 初始化 ==========
fillSelect(document.getElementById('source-select'), SOURCES);
fillSelect(document.getElementById('stage-select'), STAGES);
render();
