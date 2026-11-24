# Judas Tunnel

A one-level 3D vector arcade proof of concept for DarkRide, featuring a
symmetrical donkey-eared head craft and glowing wireframe geometry.

Download `start-tempest.js` and load it through **DarkRide > Ctrl+J > From disk**.
Load one copy only. Desktop keyboard controls. Only this one JavaScript file is
needed to play; no installation, ROMs or external assets are required.

A real 3D wireframe tunnel appears seven metres ahead, aligned with your avatar's
horizontal facing direction. The front rim is 4.8 metres wide, the tunnel is
8.5 metres deep, and its centre is 2.8 metres above your avatar's position.
Stand somewhere with room to look at it; it remains fixed so you can walk around
and inspect it. Your avatar and camera are not moved. Everything is local to your
viewer; domain rez permission and a server are not needed.

Click the gold HUD or press Enter to start. The gold craft is a mirrored,
faceted round head with long donkey ears, drawn from the supplied sketch as one
simple outline. Its ears point outwards from the rim. The highlighted rail shows
your firing lane. Every vector has a bright solid centre and a wider coloured
glow halo for contrast against the world. Both layers move and clean up together.

- **Z / X:** move around the 16 lanes. Avatar movement keys are not used.
- **K:** fire; hold for repeated shots.
- **I:** one Superzap, clearing enemies currently in the tunnel.
- **P / Escape or HUD click:** pause and release captured keys.
- **Enter or HUD click:** resume, or replay after winning/losing.
- **R while playing:** restart the level.
- **Stop start-tempest.js in Running Scripts:** remove all its entities and HUD,
  disconnect its handlers and release its keys.

There are 24 enemies and three lives. Pink enemies climb straight; purple enemies
change lane once halfway up. Each enemy reaching the rim costs one life. Resolve
all 24 with lives remaining to clear the level. This is a simplified original
implementation inspired by Tempest, not an emulation or exact port of Atari code.
There is one level, no sound, no external assets, and no shared spectator state.

The game pauses when the viewer loses focus or a long frame stalls. Its entities
also have a two-hour lifetime in case a script stops without its cleanup handler.

Offline verification: run `node test.cjs` from the directory containing the files.
The tests exercise the simulation and a mocked DarkRide API; they cannot prove
visual appearance, keyboard routing or performance in the actual viewer.
