### 2  — Write the runner (`runner.js`)

```js
import lighthouse from 'lighthouse';
import chromeLauncher from 'chrome-launcher';
import puppeteer from 'puppeteer-core';

export async function auditOnce (url) {
  // 1. Launch Chrome
  const chrome = await chromeLauncher.launch({chromeFlags: ['--headless=new','--no-sandbox']});
  const browser = await puppeteer.connect({browserURL: `http://localhost:${chrome.port}`});
  const page = await browser.newPage();
  await page.setCacheEnabled(false);            // cold-cache :contentReference[oaicite:5]{index=5}
  await page.setCookie({name:'cookie_consent',value:'accepted',domain: new URL(url).hostname});
  await page.goto(url, {waitUntil: 'networkidle0'});

  // (best-effort) click common consent buttons
  const selectors = ['#onetrust-accept-btn-handler','button[aria-label="Accept all"]'];
  for (const sel of selectors) { if (await page.$(sel)) await page.click(sel); }

  // 2. Run Lighthouse through the *same* Chrome instance
  const {lhr} = await lighthouse(url, {
    port: chrome.port,
    disableStorageReset: true,   // keep the cookie! 
    onlyAudits: ['third-party-summary'],
    output: 'json',
  });

  await chrome.kill();

  // 3. Pull GTM row
  const gtm = lhr.audits['third-party-summary'].details.items
      .find(i => (i.entity || '').includes('Google Tag Manager') ||
                 (i.url || '').includes('googletagmanager.com'));
  return {
    blockingTime: gtm.blockingTime,
    totalCpu: gtm.totalCpuTime,
    scriptEval: gtm.scriptEvaluation || gtm.mainThreadTime, // LH10+
    scriptParse: gtm.scriptParse || gtm.mainThreadTime - gtm.scriptEvaluation,
  };
}
```

### 3  — Average over three cold runs

```js
export async function auditURL (url) {
  const runs = [];
  for (let i = 0; i < 3; i++) runs.push(await auditOnce(url));
  const mean = k => runs.reduce((s,r)=>s+r[k],0) / runs.length;
  return {url,
    blockingTime: mean('blockingTime'),
    totalCpu:     mean('totalCpu'),
    scriptEval:   mean('scriptEval'),
    scriptParse:  mean('scriptParse'),
  };
}
```

### 4  — Tiny REST wrapper (`index.js`)

```js
import express from 'express';
import {auditURL} from './runner.js';

const app = express();
app.use(express.json());
app.post('/audit', async (req,res) => {
  const work = await Promise.all(req.body.urls.map(auditURL));
  res.json(work);
});
app.listen(process.env.PORT || 8080);
```
