// Layout check on 13 phones/tablets in landscape: HUD overlaps, off-screen elements, canvas aspect, title fit.
// Usage: (cd docs && python3 -m http.server 8123) then: node tools/device-matrix.js [url] [screenshotDir]
const { chromium, devices } = require('playwright');
const url = process.argv[2] || 'http://localhost:8123/';
const out = process.argv[3] || null;
const list = ['iPhone SE', 'iPhone 15', 'iPhone 15 Pro Max', 'Galaxy S8', 'Galaxy S24', 'Galaxy A55', 'Pixel 7', 'Moto G4',
  'Galaxy Z Fold 7 Cover', 'Galaxy Z Fold 7', 'Galaxy Z Flip 7', 'iPad Mini', 'Galaxy Tab S9'];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  let failed = 0;
  for (const name of list) {
    const d = devices[name];
    const vp = { width: Math.max(d.viewport.width, d.viewport.height), height: Math.min(d.viewport.width, d.viewport.height) };
    const ctx = await b.newContext({ ...d, viewport: vp, screen: vp });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(url);
    await p.waitForSelector('#title:not(.hidden)', { timeout: 120000 });
    // Notched phones report side insets in landscape; fake them since emulation can't.
    if (/iPhone 15|Galaxy S24|Pixel 7|A55|Flip/.test(name)) await p.evaluate(() => { const r = document.documentElement.style; r.setProperty('--sl', '47px'); r.setProperty('--sr', '47px'); r.setProperty('--sb', '21px'); });
    const titleFits = await p.evaluate(() => { const t = document.querySelector('#title'); return t.scrollHeight <= t.clientHeight + 1; });
    if (out) await p.screenshot({ path: `${out}/${name.replace(/ /g, '_')}-title.png` });
    await p.tap('#startbtn'); await p.waitForTimeout(3000);
    const r = await p.evaluate(() => {
      const W = innerWidth, H = innerHeight;
      const sel = ['#hp', '#flask', '#loadout', '#minimap', '#pausebtn', '#depth', '#gold', '#tip', '#b-attack', '#b-jump', '#b-dash', '#b-special', '#b-item2', '#b-flask'];
      const boxes = sel.map((s) => [s, document.querySelector(s)]).filter(([, e]) => e && e.offsetParent !== null && !e.classList.contains('hidden')).map(([s, e]) => [s, e.getBoundingClientRect()]);
      const issues = [];
      for (const [s, q] of boxes) if (q.left < -1 || q.top < -1 || q.right > W + 1 || q.bottom > H + 1) issues.push('offscreen ' + s);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const [a, A] = boxes[i], [c, B] = boxes[j];
        if (Math.min(A.right, B.right) - Math.max(A.left, B.left) > 2 && Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top) > 2) issues.push('overlap ' + a + '/' + c);
      }
      const cv = document.querySelector('#game');
      return { issues, aspectErr: Math.abs(cv.width / cv.height - cv.clientWidth / cv.clientHeight) };
    });
    if (out) await p.screenshot({ path: `${out}/${name.replace(/ /g, '_')}-play.png` });
    const bad = !titleFits || r.aspectErr > 0.01 || r.issues.length || errs.length;
    failed += bad ? 1 : 0;
    console.log((bad ? 'FAIL ' : 'ok   ') + name.padEnd(22), `${vp.width}x${vp.height}`, titleFits ? '' : 'title-overflows', r.aspectErr > 0.01 ? 'stretched' : '', r.issues.join(', '), errs.join('; '));
    await ctx.close();
  }
  await b.close();
  process.exit(failed ? 1 : 0);
})();
