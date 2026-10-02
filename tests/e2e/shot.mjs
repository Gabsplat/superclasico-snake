// Uso: node tests/e2e/shot.mjs <url> <ancho> <alto> <salida.png> [script-js]
import { chromium } from 'playwright-core';
const [url, w, h, out, script] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, hasTouch: true, isMobile: +w < 900 });
const logs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
if (process.env.PREFS) await page.addInitScript((p) => localStorage.setItem('superclasico-snake:v1', p), process.env.PREFS);
await page.goto(url);
await page.waitForTimeout(2500);
if (script) {
  const r = await page.evaluate(`(async () => { ${script} })()`);
  if (r !== undefined) console.log('result:', JSON.stringify(r));
}
await page.screenshot({ path: out });
console.log(logs.slice(0, 15).join('\n') || 'no errors');
await browser.close();
