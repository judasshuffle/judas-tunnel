const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('./start-tempest.js');
function ticks(g, n, input = {}) { for (let i = 0; i < n; i++) g.tick(input); }
function test(name, run) { run(); console.log('PASS ' + name); }

test('head is closed, symmetric and has no more than 60 vertices', () => {
    assert.deepEqual(api.head[0], api.head.at(-1));
    assert.ok(api.head.length <= 60);
    for (const [x, y] of api.head) assert.ok(api.head.some(p => Math.abs(p[0] + x) < 1e-9 && p[1] === y));
});
test('ready and paused games freeze; movement wraps and held fire is bounded', () => {
    const g = api.makeGame(); ticks(g, 60, {fire: true}); assert.equal(g.time, 0);
    g.start(); ticks(g, 1, {left: true, fire: true}); assert.equal(g.lane, 15);
    assert.equal(g.shots.length, 1); g.pause(); const before = JSON.stringify(g);
    ticks(g, 120, {fire: true}); assert.equal(JSON.stringify(g), before);
    g.start(); ticks(g, 1, {right: true}); assert.equal(g.lane, 0);
    ticks(g, 1000, {fire: true}); assert.ok(g.shots.length <= 16);
});
test('swept shots hit the nearest enemy in their lane only', () => {
    const g = api.makeGame(); g.start();
    g.enemies = [{lane: 0, depth: .5, speed: 0}, {lane: 0, depth: .51, speed: 0}, {lane: 1, depth: .51, speed: 0}];
    g.shots = [{lane: 0, depth: .55}]; ticks(g, 2);
    assert.equal(g.score, 100); assert.equal(g.resolved, 1);
    assert.equal(g.enemies.length, 2); assert.equal(g.enemies[0].depth, .5);
    assert.equal(g.enemies[1].lane, 1);
});
test('flippers change lane once and Superzap is single-use', () => {
    const g = api.makeGame(); g.start();
    const e = {id: 3, lane: 15, depth: .519, speed: .08, flipper: true, flipped: false};
    g.enemies = [e]; ticks(g, 2); assert.equal(e.lane, 0); ticks(g, 60); assert.equal(e.lane, 0);
    g.superzap(); assert.equal(g.enemies.length, 0); assert.equal(g.resolved, 1); assert.equal(g.zap, false);
    g.enemies.push({lane: 0, depth: 0, speed: 0}); g.superzap(); assert.equal(g.enemies.length, 1);
});
test('missing enemies loses the level; final kill wins and freezes it', () => {
    const lost = api.makeGame(); lost.start(); ticks(lost, 4000);
    assert.equal(lost.phase, 'lost'); assert.equal(lost.lives, 0);
    const won = api.makeGame(); won.start(); won.spawned = api.total; won.resolved = api.total - 1;
    won.enemies = [{lane: 0, depth: .9, speed: 0}]; won.shots = [{lane: 0, depth: .94}]; ticks(won, 2);
    assert.equal(won.phase, 'won'); const time = won.time; ticks(won, 120); assert.equal(won.time, time);
});
test('a complete scheduled wave is winnable using legal movement, fire and one zap', () => {
    const g = api.makeGame(); g.start();
    for (let t = 0; t < 6000 && g.phase === 'playing'; t++) {
        const target = g.enemies.slice().sort((a, b) => b.depth - a.depth)[0];
        const distance = target ? (target.lane - g.lane + api.lanes) % api.lanes : 0;
        if (g.enemies.length >= 7 && g.zap) g.superzap();
        g.tick({right: distance > 0 && distance <= 8, left: distance > 8, fire: true});
    }
    assert.equal(g.phase, 'won'); assert.equal(g.resolved, api.total); assert.ok(g.score > 0);
});

function signal() {
    const handlers = new Set();
    return {connect: f => handlers.add(f), disconnect: f => handlers.delete(f),
        emit: (...args) => [...handlers].forEach(f => f(...args)), handlers};
}
function runtime(failAt = 0) {
    const entities = new Map(), overlays = new Map(), captures = new Set();
    let seq = 0, focused = true, stopped = false;
    const log = [];
    const Script = {scriptEnding: signal(), update: signal(), stop: () => { stopped = true; }};
    const Controller = {keyPressEvent: signal(), keyReleaseEvent: signal(), mousePressEvent: signal(),
        captureKeyEvents: k => captures.add(k.text), releaseKeyEvents: k => captures.delete(k.text)};
    const ctx = {Script, Controller, print: s => log.push(s),
        MyAvatar: {position: {x: 0, y: 0, z: 0}, orientation: {}},
        Window: {innerWidth: 1280, hasFocus: () => focused},
        Quat: {IDENTITY: {}, safeEulerAngles: () => ({y: 0}), fromPitchYawRollDegrees: () => ({}),
            getForward: () => ({x: 0, y: 0, z: -1}), angleAxis: () => ({})},
        Vec3: {sum: (a, b) => ({x: a.x + b.x, y: a.y + b.y, z: a.z + b.z}),
            multiply: (n, a) => ({x: a.x * n, y: a.y * n, z: a.z * n})},
        Entities: {
            addEntity: (p, host) => {
                assert.equal(host, 'local'); assert.equal(p.collisionless, true);
                if (++seq === failAt) return null;
                if (p.type === 'PolyLine') {
                    assert.ok(p.linePoints.length <= 60);
                    assert.equal(p.strokeWidths.length, p.linePoints.length);
                    assert.ok(p.linePoints.every(p => Object.values(p).every(Number.isFinite)));
                }
                entities.set(String(seq), structuredClone(p)); return String(seq);
            },
            editEntity: (id, p) => { assert.ok(entities.has(id)); Object.assign(entities.get(id), structuredClone(p)); },
            deleteEntity: id => entities.delete(id)
        },
        Overlays: {addOverlay: (type, p) => { overlays.set('hud', p); return 'hud'; },
            editOverlay: (id, p) => Object.assign(overlays.get(id), p), deleteOverlay: id => overlays.delete(id),
            getOverlayAtPoint: () => 'hud'}
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('./start-tempest.js'), 'utf8'), ctx);
    return {ctx, entities, overlays, captures, log, get stopped() { return stopped; },
        focus: value => { focused = value; },
        press: (text, key = 0) => Controller.keyPressEvent.emit({text, key}),
        frame: () => Script.update.emit(1 / 30), stop: () => Script.scriptEnding.emit()};
}
test('DarkRide lifecycle creates local geometry, releases input on pause/focus loss, and cleans up', () => {
    const r = runtime(); assert.equal(r.stopped, false); assert.ok(r.entities.size > 50);
    assert.equal(r.captures.size, 0);
    r.press('', 16777220); assert.ok(r.captures.has('k'));
    for (const key of ['a', 'd', 'LEFT', 'RIGHT', 'SPACE']) assert.equal(r.captures.has(key), false);
    const head = [...r.entities.values()].find(e => e.name.endsWith('/ Judas donkey-ear head'));
    const initial = structuredClone(head.localPosition);
    r.press('z'); r.frame(); assert.notDeepEqual(head.localPosition, initial);
    r.ctx.Controller.keyReleaseEvent.emit({text: 'z'});
    r.press('x'); r.frame(); assert.deepEqual(head.localPosition, initial);
    r.ctx.Controller.keyReleaseEvent.emit({text: 'x'});
    r.press('k'); for (let i = 0; i < 90; i++) r.frame();
    assert.ok([...r.entities.values()].some(e => e.name.endsWith('/ shot') && e.visible));
    r.press('ESC'); assert.equal(r.captures.size, 0);
    r.press('', 16777220); r.focus(false); r.frame(); assert.equal(r.captures.size, 0);
    r.stop(); r.stop(); assert.equal(r.entities.size, 0); assert.equal(r.overlays.size, 0);
    assert.equal(r.ctx.Script.update.handlers.size, 0);
    assert.equal(r.ctx.Controller.keyPressEvent.handlers.size, 0);
    assert.equal(r.ctx.Controller.mousePressEvent.handlers.size, 0);
});
test('partial entity creation failure rolls back and stops the script', () => {
    const r = runtime(8); assert.equal(r.stopped, true); assert.equal(r.entities.size, 0);
    assert.equal(r.overlays.size, 0); assert.equal(r.captures.size, 0);
    assert.ok(r.log.some(s => s.includes('could not start')));
});
