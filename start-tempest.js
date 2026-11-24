/* Judas Tunnel: one-level, local-only DarkRide proof of concept.
 * Load this file with Ctrl+J > From disk. No assets, server or ROM required.
 * The simulation also exports under Node for offline verification.
 */
(function () {
    'use strict';
    var LANES = 16, TOTAL = 24, STEP = 1 / 60;
    // One half, mirrored below: faceted round head and long outward donkey ear.
    var HALF_HEAD = [[0, 0.38], [0.24, 0.32], [0.55, 1.04], [0.92, 1.30],
        [0.84, 0.62], [0.40, 0.04], [0.36, -0.25], [0.21, -0.43], [0, -0.48]];
    var HEAD = HALF_HEAD.slice();
    for (var h = HALF_HEAD.length - 2; h >= 0; h--) {
        HEAD.push([HALF_HEAD[h][0] === 0 ? 0 : -HALF_HEAD[h][0], HALF_HEAD[h][1]]);
    }
    function wrap(n) { return (n % LANES + LANES) % LANES; }
    function makeGame() {
        var g = {phase: 'ready', time: 0, lane: 0, lives: 3, score: 0,
            spawned: 0, resolved: 0, enemies: [], shots: [], zap: true,
            shotWait: 0, moveWait: 0, lastDirection: 0, nextSpawn: 1.2, flash: 0};
        g.start = function () { if (g.phase === 'ready' || g.phase === 'paused') { g.phase = 'playing'; } };
        g.pause = function () { if (g.phase === 'playing') { g.phase = 'paused'; } };
        g.superzap = function () {
            if (g.phase !== 'playing' || !g.zap) { return; }
            g.zap = false; g.flash = 0.35;
            g.score += g.enemies.length * 100; g.resolved += g.enemies.length; g.enemies = [];
        };
        g.tick = function (input) {
            if (g.phase !== 'playing') { return; }
            g.time += STEP; g.flash = Math.max(0, g.flash - STEP);
            g.shotWait -= STEP; g.moveWait -= STEP;
            var direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
            if (direction && (direction !== g.lastDirection || g.moveWait <= 0)) {
                g.lane = wrap(g.lane + direction); g.moveWait = 0.13;
            }
            g.lastDirection = direction;
            if (input.fire && g.shotWait <= 0 && g.shots.length < 16) {
                g.shots.push({lane: g.lane, depth: 1}); g.shotWait = 0.15;
            }
            if (g.spawned < TOTAL && g.time >= g.nextSpawn) {
                var n = g.spawned++;
                g.enemies.push({id: n, lane: wrap(n * 5 + Math.floor(n / 4)), depth: 0,
                    speed: 0.070 + (n % 4) * 0.005, flipper: n % 4 === 3, flipped: false});
                g.nextSpawn += 1.1;
            }
            var i, j;
            for (i = 0; i < g.enemies.length; i++) {
                var e = g.enemies[i];
                e.depth += STEP * e.speed;
                if (e.flipper && !e.flipped && e.depth > 0.52) {
                    e.lane = wrap(e.lane + (e.id % 2 ? 1 : -1)); e.flipped = true;
                }
            }
            for (i = g.shots.length - 1; i >= 0; i--) {
                var s = g.shots[i], previous = s.depth, hit = -1, closest = -1;
                s.depth -= STEP * 1.6;
                for (j = 0; j < g.enemies.length; j++) {
                    e = g.enemies[j];
                    // Swept shot segment; first enemy encountered from the rim wins.
                    if (s.lane === e.lane && e.depth >= s.depth - 0.025 &&
                            e.depth <= previous + 0.025 && e.depth > closest) {
                        hit = j; closest = e.depth;
                    }
                }
                if (hit >= 0) {
                    g.score += g.enemies[hit].flipper ? 150 : 100;
                    g.enemies.splice(hit, 1); g.resolved++; g.shots.splice(i, 1);
                } else if (s.depth < 0) { g.shots.splice(i, 1); }
            }
            for (i = g.enemies.length - 1; i >= 0; i--) {
                if (g.enemies[i].depth >= 1) {
                    g.enemies.splice(i, 1); g.resolved++; g.lives--; g.flash = 0.25;
                    if (g.lives <= 0) { g.lives = 0; g.phase = 'lost'; break; }
                }
            }
            if (g.phase === 'playing' && g.resolved === TOTAL) { g.phase = 'won'; }
        };
        return g;
    }
    var api = {makeGame: makeGame, head: HEAD, lanes: LANES, total: TOTAL, step: STEP};
    if (typeof module !== 'undefined') { module.exports = api; }
    if (typeof Script === 'undefined') { return; }

    var ids = [], halos = {}, root = null, hud = null, ended = false, captured = false;
    var game = makeGame(), keys = {}, accumulator = 0, rendered = 0, lastHud = '';
    var capture = ['z', 'x', 'k', 'i', 'p', 'r', 'ESC'];
    var CYAN = {red: 30, green: 200, blue: 255}, GOLD = {red: 255, green: 205, blue: 65};
    var PINK = {red: 255, green: 70, blue: 145}, PURPLE = {red: 155, green: 105, blue: 255};
    function add(properties) {
        properties.name = 'Judas Tunnel POC / ' + (properties.name || properties.type);
        properties.collisionless = true; properties.ignorePickIntersection = true;
        properties.lifetime = 7200;
        var id = Entities.addEntity(properties, 'local');
        if (!id || String(id) === '{00000000-0000-0000-0000-000000000000}') {
            throw new Error('Could not create local ' + properties.type);
        }
        ids.push(id); return id;
    }
    function v(x, y, z) { return {x: x, y: y, z: z}; }
    function brightCore(color) {
        return {red: Math.round(color.red + (255 - color.red) * 0.45),
            green: Math.round(color.green + (255 - color.green) * 0.45),
            blue: Math.round(color.blue + (255 - color.blue) * 0.45)};
    }
    function line(name, points, color, width, visible) {
        // DarkRide's glow fades as (1 - distanceFromCentre)^10. A narrow
        // glowing stroke alone almost disappears: pair a wide halo with a crisp core.
        var halo = add({type: 'PolyLine', name: name + ' halo', parentID: root,
            localPosition: v(0, 0, 0), localRotation: Quat.IDENTITY,
            linePoints: points, strokeWidths: points.map(function () { return width * 8; }),
            normals: points.map(function () { return v(0, 0, 1); }),
            color: color, glow: true, faceCamera: true, visible: visible !== false});
        var core = add({type: 'PolyLine', name: name, parentID: root,
            localPosition: v(0, 0, 0), localRotation: Quat.IDENTITY,
            linePoints: points, strokeWidths: points.map(function () { return width; }),
            normals: points.map(function () { return v(0, 0, 1); }),
            color: brightCore(color), glow: false, faceCamera: true, visible: visible !== false});
        halos[core] = halo;
        return core;
    }
    function editLine(id, properties) {
        // Both layers share the root and receive identical transforms/geometry.
        Entities.editEntity(halos[id], properties);
        var core = {};
        Object.keys(properties).forEach(function (key) { core[key] = properties[key]; });
        if (core.color) { core.color = brightCore(core.color); }
        Entities.editEntity(id, core);
    }
    function point(lane, depth, radiusExtra) {
        var a = lane * Math.PI * 2 / LANES;
        var r = 0.65 + 1.75 * depth + (radiusExtra || 0);
        return v(Math.sin(a) * r, Math.cos(a) * r, -8.5 * (1 - depth));
    }
    function ring(depth) {
        var out = [];
        for (var i = 0; i <= LANES; i++) { out.push(point(i, depth)); }
        return out;
    }
    function setCaptured(value) {
        if (captured === value) { return; }
        captured = value; keys = {};
        capture.forEach(function (key) {
            Controller[value ? 'captureKeyEvents' : 'releaseKeyEvents']({
                text: key, isShifted: false, isKeypad: false
            });
        });
    }
    function begin() {
        if (game.phase === 'won' || game.phase === 'lost') { restart(); return; }
        game.start(); setCaptured(true);
    }
    function pause() { game.pause(); setCaptured(false); }
    function restart() { game = makeGame(); accumulator = 0; begin(); }
    function press(event) {
        if (event.isControl || event.isAlt || event.isMeta || event.isAutoRepeat) { return; }
        var key = String(event.text || '').toUpperCase();
        if (event.key === 16777220 || event.key === 16777221) { begin(); return; }
        if (!captured) { return; }
        if (key === 'ESC' || key === 'P') { pause(); return; }
        if (key === 'R') { restart(); return; }
        if (key === 'I') { game.superzap(); return; }
        keys[key] = true;
    }
    function release(event) {
        if (!event.isAutoRepeat) { delete keys[String(event.text || '').toUpperCase()]; }
    }
    function click(event) {
        if (!event.isLeftButton || !hud || Overlays.getOverlayAtPoint({x: event.x, y: event.y}) !== hud) { return; }
        if (game.phase === 'playing') { pause(); }
        else if (game.phase === 'lost' || game.phase === 'won') { restart(); }
        else { begin(); }
    }
    var enemyLines = [], shotLines = [], enemyVisible = [], shotVisible = [];
    var player, highlight, textEntity, lastPlayerKey = '', lastLane = -1, lastHudX = -1;
    var enemyShape = [v(0, 0.19, 0), v(0.22, 0, 0), v(0, -0.19, 0),
        v(-0.22, 0, 0), v(0, 0.19, 0), v(0, -0.19, 0)];
    function updateHud() {
        var state = game.phase === 'ready' ? 'CLICK TO START' : game.phase === 'paused' ? 'PAUSED - CLICK TO RESUME' :
            game.phase === 'won' ? 'LEVEL CLEAR! - CLICK TO REPLAY' : game.phase === 'lost' ? 'GAME OVER - CLICK TO RETRY' : 'PLAYING - CLICK TO PAUSE';
        var text = 'JUDAS TUNNEL / LEVEL 01     ' + state + '\n' +
            'SCORE ' + game.score + '     LIVES ' + game.lives + '     WAVE ' + game.resolved + '/' + TOTAL +
            '     ZAP ' + (game.zap ? 'READY' : 'USED') + '\n' +
            'Z / X: move   |   K: fire   |   I: zap   |   P / ESC: release controls\n' +
            'Enter: resume   |   R: restart while playing   |   Stop script: remove game';
        if (text !== lastHud) {
            lastHud = text;
            Overlays.editOverlay(hud, {text: text});
            Entities.editEntity(textEntity, {text: 'JUDAS TUNNEL\n' + state + '\n' + game.score + ' PTS / ' + game.lives + ' LIVES'});
        }
        var hudX = Math.max(10, Math.floor((Window.innerWidth - 720) / 2));
        if (hudX !== lastHudX) { lastHudX = hudX; Overlays.editOverlay(hud, {x: hudX, y: 65}); }
    }
    function render() {
        var a = game.lane * Math.PI * 2 / LANES;
        var playerKey = game.lane + ':' + (game.flash > 0);
        if (playerKey !== lastPlayerKey) {
            lastPlayerKey = playerKey;
            editLine(player, {localPosition: point(game.lane, 1, 0.22),
                localRotation: Quat.angleAxis(-a * 180 / Math.PI, v(0, 0, 1)),
                color: game.flash > 0 ? PINK : GOLD});
        }
        if (lastLane !== game.lane) {
            lastLane = game.lane;
            editLine(highlight, {linePoints: [point(game.lane, 0), point(game.lane, 1)]});
        }
        for (var i = 0; i < enemyLines.length; i++) {
            var e = game.enemies[i];
            if (e) {
                editLine(enemyLines[i], {visible: true, localPosition: point(e.lane, e.depth),
                    localRotation: Quat.angleAxis(game.time * (e.flipper ? 160 : 60), v(0, 0, 1)),
                    color: e.flipper ? PURPLE : PINK});
            } else if (enemyVisible[i]) { editLine(enemyLines[i], {visible: false}); }
            enemyVisible[i] = !!e;
        }
        for (i = 0; i < shotLines.length; i++) {
            var s = game.shots[i];
            if (s) {
                editLine(shotLines[i], {visible: true,
                    linePoints: [point(s.lane, s.depth), point(s.lane, Math.min(1, s.depth + 0.045))]});
            } else if (shotVisible[i]) { editLine(shotLines[i], {visible: false}); }
            shotVisible[i] = !!s;
        }
        updateHud();
    }
    function update(dt) {
        if (ended) { return; }
        // Freeze rather than catching up after a focus switch or debugger stall.
        if ((dt > 0.5 || (typeof Window.hasFocus === 'function' && !Window.hasFocus())) &&
                game.phase === 'playing') { pause(); }
        accumulator += Math.min(dt, 0.1);
        while (accumulator >= STEP) {
            game.tick({left: keys.Z, right: keys.X, fire: keys.K});
            accumulator -= STEP;
        }
        if (game.phase === 'won' || game.phase === 'lost') { setCaptured(false); }
        rendered += dt;
        if (rendered >= 1 / 30) { rendered = 0; render(); }
    }
    function end() {
        if (ended) { return; } ended = true;
        setCaptured(false);
        Script.update.disconnect(update);
        Controller.keyPressEvent.disconnect(press); Controller.keyReleaseEvent.disconnect(release);
        Controller.mousePressEvent.disconnect(click);
        if (hud) { Overlays.deleteOverlay(hud); }
        for (var i = ids.length - 1; i >= 0; i--) { Entities.deleteEntity(ids[i]); }
        ids = [];
    }
    Script.scriptEnding.connect(end);
    try {
        var yaw = Quat.safeEulerAngles(MyAvatar.orientation).y;
        var rotation = Quat.fromPitchYawRollDegrees(0, yaw, 0);
        var origin = Vec3.sum(MyAvatar.position, Vec3.multiply(7, Quat.getForward(rotation)));
        origin.y += 2.8;
        root = add({type: 'Shape', shape: 'Cube', name: 'root', position: origin,
            rotation: rotation, dimensions: v(0.01, 0.01, 0.01), visible: false});
        [0, 0.25, 0.5, 0.75, 1].forEach(function (depth) {
            line('tunnel ring', ring(depth), CYAN, depth === 1 ? 0.025 : 0.012);
        });
        for (var i = 0; i < LANES; i++) {
            // Lanes run between the boundary lines, with a clear shooting rail at the centre.
            line('lane boundary', [point(i + 0.5, 0), point(i + 0.5, 1)], CYAN, 0.012);
        }
        highlight = line('aim rail', [point(0, 0), point(0, 1)], GOLD, 0.018);
        player = line('Judas donkey-ear head', HEAD.map(function (p) { return v(p[0] * 0.25, p[1] * 0.25, 0.04); }), GOLD, 0.025);
        for (i = 0; i < TOTAL; i++) { enemyLines.push(line('enemy', enemyShape, PINK, 0.025, false)); }
        for (i = 0; i < 16; i++) { shotLines.push(line('shot', [point(0, 0), point(0, 0.04)], GOLD, 0.035, false)); }
        textEntity = add({type: 'Text', parentID: root, localPosition: v(0, 3.65, 0),
            localRotation: Quat.IDENTITY, dimensions: v(5.8, 0.65, 0.01),
            text: 'JUDAS TUNNEL', lineHeight: 0.16, textColor: GOLD,
            backgroundAlpha: 0.7, backgroundColor: {red: 5, green: 9, blue: 20},
            alignment: 'center', unlit: true});
        hud = Overlays.addOverlay('text', {x: 10, y: 65, width: 720, height: 114,
            text: '', font: {size: 14}, color: GOLD, alpha: 1,
            backgroundColor: {red: 5, green: 9, blue: 20}, backgroundAlpha: 0.88,
            leftMargin: 12, topMargin: 10, visible: true});
        Controller.keyPressEvent.connect(press); Controller.keyReleaseEvent.connect(release);
        Controller.mousePressEvent.connect(click); Script.update.connect(update);
        render();
        print('Judas Tunnel: local 3D level ready. Click the HUD or press Enter to start. Stop this script to remove it.');
    } catch (error) {
        print('Judas Tunnel could not start: ' + error); end(); Script.stop();
    }
}());
