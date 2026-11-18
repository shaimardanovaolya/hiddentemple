(() => {
  'use strict';
  if (typeof Phaser === 'undefined') return;

  const $ = id => document.getElementById(id);
  const storageKey = 'nara-deer:parameters:v1';
  const dialog = $('settings-dialog');
  const bow = $('bow');
  const openingBows = 3;
  const finalWaits = [[550, 700], [1300, 1550], [1850, 2150]];
  const goal = openingBows + finalWaits.length;
  const steps = Array.from({ length: goal }, (_, i) => {
    const step = document.createElement('i');
    if (i === openingBows) step.classList.add('final-start');
    return step;
  });
  $('steps').append(...steps);
  const controls = ['approach', 'window'].map(id => ({ id, input: $(id), output: $(`${id}-value`) }));
  let stored;
  let storageAvailable = true;
  try { stored = JSON.parse(localStorage.getItem(storageKey)); }
  catch { storageAvailable = false; }

  function normalize(values) {
    return Object.fromEntries(controls.map(({ id, input }) => {
      const min = Number(input.min), max = Number(input.max), step = Number(input.step);
      const value = values?.[id];
      const numeric = typeof value === 'number' && Number.isFinite(value) ? value : Number(input.defaultValue);
      return [id, Math.max(min, Math.min(max, min + Math.round((numeric - min) / step) * step))];
    }));
  }

  let settings = normalize(stored);
  let phase = 'idle';
  let elapsed = 0;
  let hits = 0;
  let waitingTime = 0;
  let timing = settings;
  let needsResume = false;
  const target = .61;
  const startRadius = .91;

  function score() {
    $('score').textContent = `${hits} / ${goal}`;
    steps.forEach((step, i) => step.classList.toggle('filled', i < hits));
  }

  function pose(value, celebrate = false) {
    $('deer').dataset.pose = value;
    $('reward').classList.toggle('show', celebrate);
  }

  function message(text = '', result = '') {
    $('feedback').textContent = text;
    $('feedback').dataset.result = result;
  }

  function reset() {
    phase = 'idle';
    needsResume = false;
    elapsed = hits = 0;
    score();
    pose('idle');
    message();
    bow.textContent = 'Начать';
  }

  function nextAttempt() {
    phase = 'waiting';
    elapsed = 0;
    const inFinal = hits >= openingBows;
    const [minWait, maxWait] = inFinal ? finalWaits[hits - openingBows] : [800, 1500];
    waitingTime = minWait + Math.random() * (maxWait - minWait);
    timing = inFinal ? { ...settings, approach: Math.round(settings.approach * .56) } : settings;
    pose('idle');
    bow.textContent = 'Поклониться';
  }

  function resolve(result) {
    elapsed = 0;
    if (result === 'hit') {
      hits += 1;
      score();
      pose('happy', true);
      if (hits === goal) {
        phase = 'won';
        message('Путь открыт!', 'hit');
        bow.textContent = 'Играть ещё';
        return;
      }
      message('Точный поклон!', 'hit');
    } else {
      pose('idle');
      message(result === 'early' ? 'Рановато. Попробуй ещё.' : 'Поздно. Попробуй ещё.');
    }
    phase = 'feedback';
  }

  function activePhase() {
    return phase === 'waiting' || phase === 'approach' || phase === 'feedback';
  }

  function isReady() {
    return phase === 'approach' && Math.abs(elapsed - timing.approach) <= timing.window / 2;
  }

  bow.addEventListener('click', () => {
    if (dialog.open || document.hidden) return;
    if (needsResume) {
      needsResume = false;
      bow.textContent = 'Поклониться';
      return;
    }
    if (phase === 'idle' || phase === 'won') {
      reset();
      nextAttempt();
    } else if (phase === 'waiting' || phase === 'approach') {
      resolve(isReady() ? 'hit' : 'early');
    }
  });
  $('restart').addEventListener('click', () => {
    reset();
    bow.focus({ preventScroll: true });
  });
  document.addEventListener('keydown', event => {
    if (event.repeat && (event.code === 'Space' || event.key === 'Enter')) {
      if (event.target === bow) event.preventDefault();
      return;
    }
    if (event.code === 'Space' && event.target === document.body && !dialog.open) {
      event.preventDefault();
      bow.click();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && activePhase()) {
      needsResume = true;
      bow.textContent = 'Продолжить';
    }
  });

  function updateRound(delta) {
    if (dialog.open || document.hidden || needsResume || !activePhase()) return;
    elapsed += Math.min(delta, 50);
    if (phase === 'waiting' && elapsed >= waitingTime) {
      elapsed -= waitingTime;
      phase = 'approach';
      message();
    } else if (phase === 'approach') {
      if (elapsed >= timing.approach + timing.window / 2) resolve('late');
      else if (elapsed >= timing.approach * .55) pose('bow');
    } else if (phase === 'feedback' && elapsed >= 730) {
      nextAttempt();
    }
  }

  function syncSettings() {
    const format = new Intl.NumberFormat('ru', { maximumFractionDigits: 2 });
    for (const { id, input, output } of controls) {
      input.value = settings[id];
      output.textContent = id === 'approach' ? `${format.format(settings[id] / 1000)} с` : `${settings[id]} мс`;
    }
    $('settings-note').textContent = storageAvailable
      ? 'Настройки сохраняются. Изменения вступают в силу со следующего поклона.'
      : 'Браузер не сохранил настройки. Они действуют, пока открыта страница.';
  }

  function saveSettings(values) {
    settings = normalize(values);
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings));
      storageAvailable = true;
    } catch { storageAvailable = false; }
    syncSettings();
  }

  for (const { id, input } of controls) {
    input.addEventListener('input', () => saveSettings({ ...settings, [id]: Number(input.value) }));
  }
  $('defaults').addEventListener('click', () => saveSettings());
  $('settings').addEventListener('click', () => {
    syncSettings();
    $('settings').focus({ preventScroll: true });
    dialog.showModal();
  });
  for (const id of ['close-settings', 'done']) $(id).addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => $('settings').focus({ preventScroll: true }));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const { left, right, top, bottom } = dialog.getBoundingClientRect();
    if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) dialog.close();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const first = $('close-settings'), last = $('done');
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  class TimingScene extends Phaser.Scene {
    create() {
      this.rings = this.add.graphics();
    }

    update(_, delta) {
      updateRound(delta);
      const { width, height } = this.scale;
      const x = width / 2, y = height / 2, unit = Math.min(x, y);
      const ready = isReady();
      const source = phase === 'approach' ? timing : settings;
      const radiusAt = time => startRadius - (startRadius - target) * time / source.approach;
      const inner = radiusAt(source.approach + source.window / 2);
      const outer = radiusAt(source.approach - source.window / 2);
      const g = this.rings;
      $('dial').classList.toggle('ready', ready);
      g.clear();
      g.lineStyle(1, 0xb8cb9c, .22).strokeCircle(x, y, unit * startRadius);
      g.lineStyle(Math.max(2, (outer - inner) * unit), ready ? 0xb3e08b : 0x6e8e5c);
      g.strokeCircle(x, y, target * unit);
      if (phase === 'approach') {
        g.lineStyle(Math.max(2, unit * .045), ready ? 0xf1ffc6 : 0xf3d28b, 1);
        g.strokeCircle(x, y, radiusAt(elapsed) * unit);
      } else if (phase === 'won') {
        g.fillStyle(0xb4e88c, .16).fillCircle(x, y, unit * target);
        g.lineStyle(3, 0xd7eea8, 1);
        g.lineBetween(x - unit * .23, y, x - unit * .06, y + unit * .16);
        g.lineBetween(x - unit * .06, y + unit * .16, x + unit * .25, y - unit * .2);
      }
    }
  }

  new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', transparent: true, audio: { noAudio: true },
    scale: { mode: Phaser.Scale.RESIZE }, scene: TimingScene
  });
  reset();
})();
