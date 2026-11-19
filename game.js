(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cost = 3;
  const defaultLimit = 13;
  const maxLimit = 16;
  const progressKey = 'drone-scanner:progress:v5';
  const settingsKey = 'drone-scanner:parameters:v1';

  const items = [
    { name: 'Свиток', image: 'scroll', size: 3 },
    { name: 'Печать', image: 'seal', size: 4 },
    { name: 'Чип', image: 'chip', size: 2 },
    { name: 'Батарейка', image: 'battery', size: 3 }
  ];
  const minLimit = items.reduce((sum, item) => sum + item.size, 0);
  const screen = $('screen');
  const modal = $('modal');
  let modalOpener;
  let scene;
  let storageAvailable = true;

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      storageAvailable = true;
    } catch { storageAvailable = false; }
  }

  function pick(values) {
    return values[Math.floor(Math.random() * values.length)];
  }

  const cells = Array.from({ length: 16 }, (_, i) => i);
  const sealShapes = cells.filter(i => i < 12 && i % 4 < 3).map(i => [i, i + 1, i + 4, i + 5]);
  const scrollShapes = cells.flatMap(i => [
    ...(i % 4 < 2 ? [[i, i + 1, i + 2]] : []),
    ...(i < 8 ? [[i, i + 4, i + 8]] : [])
  ]);
  const pairShapes = cells.flatMap(i => [
    ...(i % 4 < 3 ? [[i, i + 1]] : []),
    ...(i < 12 ? [[i, i + 4]] : [])
  ]);
  const cornerShapes = sealShapes.flatMap(square => square.map(missing => square.filter(cell => cell !== missing)));
  const itemPlacements = [scrollShapes, sealShapes, pairShapes, cornerShapes];
  const disjoint = (a, b) => a.every(cell => !b.includes(cell));

  // Each choice is uniform among the legal options at its level.
  const layouts = sealShapes.map(seal => {
    const scrolls = scrollShapes.filter(scroll => disjoint(scroll, seal)).map(scroll => {
      const pairs = pairShapes.filter(pair => disjoint(pair, seal) && disjoint(pair, scroll));
      const corners = cornerShapes.filter(corner => disjoint(corner, seal) && disjoint(corner, scroll));
      const chips = pairs.map(chip => ({
        chip, batteries: corners.filter(battery => disjoint(battery, chip))
      })).filter(option => option.batteries.length > 0);
      return { scroll, chips };
    }).filter(option => option.chips.length > 0);
    return { seal, scrolls };
  }).filter(option => option.scrolls.length > 0);

  function buildBoard(scroll, seal, chip, battery) {
    const board = cells.map(() => -1);
    [scroll, seal, chip, battery].forEach((positions, item) => {
      positions.forEach(cell => { board[cell] = item; });
    });
    return board;
  }

  function makeBoard() {
    const { seal, scrolls } = pick(layouts);
    const { scroll, chips } = pick(scrolls);
    const { chip, batteries } = pick(chips);
    return buildBoard(scroll, seal, chip, pick(batteries));
  }

  function footprints(board) {
    return items.map((_, item) => {
      const positions = board.flatMap((value, i) => value === item ? [i] : []);
      const xs = positions.map(i => i % 4);
      const left = Math.min(...xs);
      const top = Math.floor(positions[0] / 4);
      const columns = Math.max(...xs) - left + 1;
      const occupied = positions.map(i => (Math.floor(i / 4) - top) * columns + i % 4 - left);
      return { columns, occupied };
    });
  }

  function hintCell(board, isOpen) {
    return board.findIndex((item, i) => item >= 0 && !isOpen(i));
  }

  function simulate() {
    const visibleShapes = new Map();
    let layoutCount = 0;
    for (const { seal, scrolls } of layouts) {
      for (const { scroll, chips } of scrolls) {
        for (const { chip, batteries } of chips) {
          const weight = 1 / (layouts.length * scrolls.length * chips.length * batteries.length);
          for (const battery of batteries) {
            const board = buildBoard(scroll, seal, chip, battery);
            const key = footprints(board).map(({ columns, occupied }) => [columns, ...occupied].join()).join('|');
            if (!visibleShapes.has(key)) visibleShapes.set(key, []);
            visibleShapes.get(key).push({ board, weight });
            layoutCount += 1;
          }
        }
      }
    }

    const wins = Array(cells.length + 1).fill(0);

    // Every branch contains only layouts consistent with the player's observations.
    function play(candidates, opened, hits, misses, usedHint) {
      const isOpen = cell => (opened & (1 << cell)) !== 0;
      if (hits === minLimit) {
        wins[hits + misses] += candidates.reduce((sum, entry) => sum + entry.weight, 0);
        return;
      }
      if (misses === 2 && !usedHint) {
        const hints = cells.map(() => []);
        for (const candidate of candidates) {
          const cell = hintCell(candidate.board, isOpen);
          hints[cell].push(candidate);
        }
        hints.forEach((group, cell) => {
          if (group.length) reveal(group, cell, opened, hits, misses, true);
        });
        return;
      }
      let bestCell = -1;
      let bestWeight = -1;
      for (const cell of cells) {
        if (isOpen(cell)) continue;
        let weight = 0;
        for (const candidate of candidates) {
          if (candidate.board[cell] >= 0) weight += candidate.weight;
        }
        if (weight > bestWeight + 1e-12) {
          bestCell = cell;
          bestWeight = weight;
        }
      }
      reveal(candidates, bestCell, opened, hits, misses, usedHint);
    }

    function reveal(candidates, cell, opened, hits, misses, usedHint) {
      const results = Array.from({ length: items.length + 1 }, () => []);
      for (const candidate of candidates) results[candidate.board[cell] + 1].push(candidate);
      const nextOpened = opened | (1 << cell);
      results.forEach((group, result) => {
        if (!group.length) return;
        const hit = result !== 0;
        play(group, nextOpened, hits + Number(hit), misses + Number(!hit), usedHint);
      });
    }

    for (const candidates of visibleShapes.values()) play(candidates, 0, 0, 0, false);
    return { layoutCount, wins };
  }

  function fresh() {
    return { board: makeBoard(), opened: [], hint: null, limit: nextLimit, rulesVersion: 4 };
  }

  function indices(values, limit) {
    return Array.isArray(values) && new Set(values).size === values.length &&
      values.every(i => Number.isInteger(i) && i >= 0 && i < limit);
  }

  function fragments(state) {
    return items.map((_, item) => state.opened.filter(i => state.board[i] === item).length);
  }

  function complete(state) {
    return fragments(state).every((count, i) => count === items[i].size);
  }

  function remaining(state) {
    return state.limit - state.opened.length;
  }

  function valid(state) {
    if (!state || !Array.isArray(state.board) || state.board.length !== 16 ||
        !state.board.every(i => Number.isInteger(i) && i >= -1 && i < items.length) ||
        !items.every((item, i) => state.board.filter(v => v === i).length === item.size) ||
        !indices(state.opened, 16) || !Number.isInteger(state.limit) ||
        state.limit < minLimit || state.limit > maxLimit || remaining(state) < 0) return false;
    return itemPlacements.every((placements, item) => placements.some(shape => shape.every(i => state.board[i] === item))) &&
      (state.hint === null || (indices([state.hint], 16) && state.board[state.hint] >= 0));
  }

  function saveProgress() { save(progressKey, state); }

  const defaultPulse = 180;
  function normalizePulse(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return defaultPulse;
    return Math.max(0, Math.min(400, Math.round(value / 20) * 20));
  }
  function normalizeLimit(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return defaultLimit;
    return Math.max(minLimit, Math.min(maxLimit, Math.round(value)));
  }

  const settings = read(settingsKey);
  let pulse = normalizePulse(settings?.pulse);
  let nextLimit = settings?.balance === 4 ? normalizeLimit(settings.limit) : defaultLimit;
  if (settings?.balance !== 4) save(settingsKey, { pulse, limit: nextLimit, balance: 4 });
  const saved = read(progressKey);
  let state = valid(saved) ? saved : fresh();
  if (state.rulesVersion !== 4) {
    if ([12, 14].includes(state.limit) && nextLimit === defaultLimit && state.opened.length <= defaultLimit) {
      state.limit = defaultLimit;
    }
    state.rulesVersion = 4;
    saveProgress();
  } else if (state !== saved) saveProgress();
  function button(label, action, primary = false) {
    return `<button type="button" data-action="${action}"${primary ? ' class="primary"' : ''}>${label}</button>`;
  }

  function itemShape({ columns, occupied }) {
    const rows = Math.floor(occupied.at(-1) / columns) + 1;
    const description = Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, col) => occupied.includes(row * columns + col) ? 'клетка' : 'пусто').join(', '));
    const squares = Array.from({ length: rows * columns }, (_, i) =>
      `<span aria-hidden="true"${occupied.includes(i) ? '' : ' class="shape-gap"'}></span>`).join('');
    return `<span class="item-shape" role="img" aria-label="${description.join('; ')}" style="--columns: ${columns}">${squares}</span>`;
  }

  function itemRotation(item, shape) {
    if (item === 3) {
      const missing = [0, 1, 2, 3].find(i => !shape.occupied.includes(i));
      return [270, 0, 180, 90][missing];
    }
    return item !== 1 && shape.columns === 1 ? 90 : 0;
  }

  function fieldArtwork(shapes) {
    return items.map((item, i) => {
      const positions = state.board.flatMap((value, cell) => value === i ? [cell] : []);
      const left = Math.min(...positions.map(cell => cell % 4));
      const top = Math.floor(positions[0] / 4);
      const columns = shapes[i].columns;
      const rows = Math.floor(shapes[i].occupied.at(-1) / columns) + 1;
      const angle = itemRotation(i, shapes[i]);
      const image = angle % 180 === 90 && i !== 3 ? `${item.image}-vertical` : item.image;
      const rotation = i === 3 ? angle : 0;
      const inset = i === 3 ? ' translate(-4%, 4%) scale(.86)' : '';
      return `<span class="artifact" style="left:${left * 25}%;top:${top * 25}%;width:${columns * 25}%;height:${rows * 25}%;clip-path:inset(0)"><img alt="" src="assets/scanner/${image}.png" style="transform:rotate(${rotation}deg)${inset}" draggable="false"></span>`;
    }).join('');
  }

  function artworkMask() {
    const visible = state.opened.filter(cell => state.board[cell] >= 0);
    const images = visible.map(() => 'linear-gradient(#000, #000)').join(',') || 'linear-gradient(transparent, transparent)';
    const positions = visible.map(cell => `${cell % 4 * 100 / 3}% ${Math.floor(cell / 4) * 100 / 3}%`).join(',') || '0 0';
    return `mask-image:${images};mask-position:${positions}`;
  }

  function field() {
    const counts = fragments(state);
    const shapes = footprints(state.board);
    const found = counts.filter((count, i) => count === items[i].size).length;
    const misses = state.opened.filter(i => state.board[i] === -1).length;
    const won = found === items.length;
    const exhausted = remaining(state) === 0;
    let controls = '<span>Один импульс · 3 заряда</span>';
    if (won) {
      controls = '<strong class="victory" role="status">Все 4 предмета найдены!</strong>';
    } else if (exhausted) {
      controls = '<strong class="defeat" role="status">Попытки закончились</strong>' + button('Начать заново', 'restart', true);
    } else if (misses >= 2 && state.hint === null) {
      controls += button('Подсказка', 'hint');
    } else if (state.hint !== null && !state.opened.includes(state.hint)) {
      controls = '<span>Отмеченная плитка · 3 заряда</span>';
    }

    return `<div class="scanner">
      <aside class="collection"><div class="collection-head"><h1 tabindex="-1">Находки</h1><strong aria-label="Найдено ${found} из 4">${found}/4</strong></div>
      <ul>${items.map((item, i) => {
        const isFound = counts[i] === item.size;
        const angle = itemRotation(i, shapes[i]);
        const image = angle % 180 === 90 && i !== 3 ? `${item.image}-vertical` : item.image;
        return `<li class="item-${i}${isFound ? ' found' : ''}">
          <span class="item-icon" aria-hidden="true"><img src="assets/scanner/${image}.png" alt="" draggable="false" style="transform:rotate(${i === 3 ? angle : 0}deg)"></span>
          <span class="item-name">${item.name}${itemShape(shapes[i])}</span>
          <span class="item-status"><span class="sr-only">${isFound ? 'Найден' : 'В поиске'}</span><span aria-hidden="true">${isFound ? '✓' : '–'}</span></span></li>`;
      }).join('')}</ul></aside>
      <div class="search"><div class="board-frame"><div class="board" aria-label="Поле 4 на 4"><div class="art-layer" aria-hidden="true" style="${artworkMask()}">${fieldArtwork(shapes)}</div>${state.board.map((item, i) => {
        const opened = state.opened.includes(i);
        const hint = !opened && state.hint === i;
        const title = `Ряд ${Math.floor(i / 4) + 1}, столбец ${i % 4 + 1}`;
        const detail = opened ? (item < 0 ? ', пусто' : `, ${items[item].name}`) : (hint ? ', подсказка' : '');
        return `<button type="button" class="tile ${opened ? (item < 0 ? 'empty' : `item-${item} fragment`) : 'covered'}${hint ? ' hint' : ''}" data-action="scan-${i}" aria-label="${title}${detail}"${opened || won || exhausted ? ' disabled' : ''}>${hint ? '✧' : ''}</button>`;
      }).join('')}</div></div></div>
      <div class="field-controls">${controls}</div>
    </div>`;
  }

  function render(focus = false) {
    const attempts = remaining(state);
    $('charge').textContent = String(attempts * cost).padStart(2, '0');
    $('charge-limit').textContent = ` / ${state.limit * cost}`;
    $('shots').textContent = String(attempts).padStart(2, '0');
    $('shot-limit').textContent = ` / ${state.limit}`;
    screen.innerHTML = field();
    if (focus) screen.querySelector('h1')?.focus({ preventScroll: true });
  }

  function scan(index) {
    if (state.opened.includes(index) || complete(state) || remaining(state) === 0) return;
    state.opened.push(index);
    saveProgress();
    const item = state.board[index];
    const name = item < 0 ? 'Пустая плитка' : items[item].name;
    const won = complete(state);
    $('announcement').textContent = `${name}. Осталось попыток: ${remaining(state)}.`;
    render(won);
    const tile = screen.querySelector(`[data-action="scan-${index}"]`);
    if (pulse > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      tile.animate([{ filter: 'brightness(1.9)' }, { filter: 'brightness(1)' }], { duration: pulse });
    }
    if (won) return;
    if (remaining(state) === 0) {
      screen.querySelector('[data-action="restart"]').focus({ preventScroll: true });
      return;
    }
    const available = [...screen.querySelectorAll('.tile:not(:disabled)')];
    const next = available.find(candidate => Number(candidate.dataset.action.slice(5)) > index) ?? available[0];
    next?.focus({ preventScroll: true });
  }

  function openModal(title, body) {
    modalOpener = document.activeElement;
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = body;
    modal.showModal();
    scene?.scene.pause();
  }

  screen.addEventListener('click', event => {
    const trigger = event.target.closest('button[data-action]');
    if (!trigger || modal.open) return;
    const [action, suffix] = trigger.dataset.action.split('-');
    const index = Number(suffix);
    if (action === 'scan') scan(index);
    if (action === 'restart') restart();
    if (action === 'hint') {
      state.hint = hintCell(state.board, i => state.opened.includes(i));
      saveProgress();
      render();
      screen.querySelector('.tile.hint')?.focus({ preventScroll: true });
    }
  });

  function applySettings(pulseValue, limitValue) {
    pulse = normalizePulse(pulseValue);
    nextLimit = normalizeLimit(limitValue);
    save(settingsKey, { pulse, limit: nextLimit, balance: 4 });
    $('pulse').value = pulse;
    $('pulse-value').textContent = `${pulse} мс`;
    $('limit').value = nextLimit;
    $('limit-value').textContent = nextLimit;
    $('settings-note').textContent = storageAvailable ? 'Параметры сохранены в браузере.' : 'Браузер запретил сохранение. Параметры действуют до закрытия страницы.';
  }

  $('settings').addEventListener('click', () => {
    openModal('Настройки', `<label for="limit">Попытки в следующем раунде <output id="limit-value">${nextLimit}</output></label>
      <input id="limit" type="range" min="${minLimit}" max="${maxLimit}" step="1" value="${nextLimit}">
      <label for="pulse">Длительность импульса <output id="pulse-value">${pulse} мс</output></label>
      <input id="pulse" type="range" min="0" max="400" step="20" value="${pulse}">
      <div class="actions">${button('Сбросить параметры', 'defaults')}${button('Готово', 'close', true)}</div>
      <p id="settings-note" role="status">${storageAvailable ? 'Параметры сохраняются в браузере.' : 'Сохранение в браузере недоступно.'}</p>
      <div class="simulation"><button type="button" id="simulate" aria-controls="simulation-results">Проверить винрейт</button>
        <div id="simulation-results" hidden></div>
      </div>`);
    $('pulse').addEventListener('input', event => applySettings(Number(event.target.value), nextLimit));
    $('limit').addEventListener('input', event => applySettings(pulse, Number(event.target.value)));
    $('simulate').addEventListener('click', showSimulation);
  });

  let simulation;
  function showSimulation() {
    simulation ??= simulate();
    const { layoutCount, wins } = simulation;
    const goal = 0.85;
    const format = new Intl.NumberFormat('ru', { style: 'percent', maximumFractionDigits: 1 });
    let cumulative = 0;
    let firstAtGoal;
    const rows = [`<tr><th scope="row">1–${minLimit - 1}</th><td>0%</td></tr>`];
    for (let limit = minLimit; limit <= maxLimit; limit += 1) {
      cumulative += wins[limit];
      const meetsGoal = firstAtGoal === undefined && cumulative >= goal;
      if (meetsGoal) firstAtGoal = limit;
      rows.push(`<tr${meetsGoal ? ' class="simulation-goal"' : ''}><th scope="row">${limit}</th><td>${format.format(cumulative)}</td></tr>`);
    }
    const result = $('simulation-results');
    result.innerHTML = `<h3 tabindex="-1">Цель 85%: от ${firstAtGoal} попыток</h3>
      <p>Перебор всех раскладок (${layoutCount}). Модель выбирает клетку с наибольшим шансом попасть и использует подсказку после двух промахов.</p>
      <table aria-label="Винрейт по числу попыток"><thead><tr><th scope="col">Попытки</th><th scope="col">Винрейт</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
    result.hidden = false;
    result.querySelector('h3').focus();
  }

  $('reset').addEventListener('click', () => openModal('Начать заново?', `<p>Откроется новое поле. Попыток: ${nextLimit}.</p>` +
    `<div class="actions">${button('Отмена', 'close')}${button('Начать заново', 'restart', true)}</div>`));

  $('close').addEventListener('click', () => modal.close());
  modal.addEventListener('click', event => {
    if (event.target === modal) {
      const bounds = modal.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) modal.close();
    }
    const action = event.target.closest('button')?.dataset.action;
    if (action === 'close') modal.close();
    if (action === 'defaults') applySettings(defaultPulse, defaultLimit);
    if (action === 'restart') {
      modal.close();
      restart();
    }
  });
  function restart() {
    state = fresh();
    saveProgress();
    render(true);
  }
  modal.addEventListener('close', () => {
    scene?.scene.resume();
    modalOpener?.focus({ preventScroll: true });
  });

  class TempleScene extends Phaser.Scene {
    create() {
      scene = this;
      if (modal.open) this.scene.pause();
    }
  }

  if (typeof Phaser !== 'undefined') {
    new Phaser.Game({
      type: Phaser.AUTO, parent: 'game', transparent: true,
      scale: { mode: Phaser.Scale.RESIZE }, scene: TempleScene
    });
  }
  render();
})();
