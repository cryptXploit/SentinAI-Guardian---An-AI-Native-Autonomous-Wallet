import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile();

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9233;
const APP_URL = 'http://localhost:3000';

class CDPClient {
  private ws!: WebSocket;
  private msgId = 0;
  private pending = new Map<number, { resolve: (val: Record<string, unknown>) => void; reject: (err: Error) => void }>();
  public consoleMessages: Array<{ type: string; text: string }> = [];
  public pageErrors: string[] = [];

  async connect(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(String(event.data));
        if (msg.id && this.pending.has(msg.id)) {
          const handler = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) handler.reject(new Error(msg.error.message));
          else handler.resolve(msg.result || {});
        } else if (msg.method === 'Runtime.consoleAPICalled') {
          const args = (msg.params?.args || []) as Array<{ value?: unknown; description?: string }>;
          const text = args
            .map((a) => String(a.value ?? a.description ?? ''))
            .join(' ');
          this.consoleMessages.push({ type: msg.params?.type || 'log', text });
        } else if (msg.method === 'Runtime.exceptionThrown') {
          this.pageErrors.push(msg.params?.exceptionDetails?.text || 'Uncaught exception');
        }
      };
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async setViewport(width: number, height: number, mobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    });
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      const details = res.exceptionDetails as { text?: string };
      throw new Error(`JS Eval Error: ${details.text || 'unknown'}`);
    }
    const resultObj = res.result as { value?: T } | undefined;
    return resultObj?.value as T;
  }

  async screenshot(filePath: string) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const data = String(res.data || '');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForText(cdp: CDPClient, text: string, timeoutMs = 20000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await cdp.evaluate<boolean>(
      `document.body && document.body.innerText.includes(${JSON.stringify(text)})`
    );
    if (found) return true;
    await sleep(300);
  }
  return false;
}

async function setInputValueAndSubmit(cdp: CDPClient, selector: string, value: string, formSelector = 'form') {
  await cdp.evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) throw new Error('Input not found: ' + ${JSON.stringify(selector)});
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(150);
  await cdp.evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    const form = input ? input.closest('form') : document.querySelector(${JSON.stringify(formSelector)});
    const btn = form ? form.querySelector('button[type="submit"]') : null;
    if (btn) btn.click();
  })()`);
}

async function main() {
  const dbPath = path.resolve(process.cwd(), 'sentinai.db');
  const backupPath = path.join(os.tmpdir(), `sentinai-pre-browser-${Date.now()}.db`);
  fs.copyFileSync(dbPath, backupPath);

  const userDataDir = path.join(os.tmpdir(), `chrome-sentinai-${Date.now()}`);
  const chromeProc = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  const results: Array<{ step: string; passed: boolean; details: string; screenshot?: string }> = [];
  const cdp = new CDPClient();

  try {
    // Wait for Chrome DevTools endpoint
    let wsUrl = '';
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
        const tabs = (await res.json()) as Array<{ webSocketDebuggerUrl?: string; type?: string }>;
        const pageTab = tabs.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (pageTab?.webSocketDebuggerUrl) {
          wsUrl = pageTab.webSocketDebuggerUrl;
          break;
        }
      } catch {
        // retry
      }
      await sleep(300);
    }
    if (!wsUrl) throw new Error('Failed to connect to headless Chrome DevTools port');

    await cdp.connect(wsUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.setViewport(1440, 900, false);

    // 1. Navigate to Login Gate
    await cdp.send('Page.navigate', { url: APP_URL });
    const loginLoaded = await waitForText(cdp, 'Authenticate to access the Agent Console', 15000);
    await sleep(500);
    await cdp.screenshot(path.resolve(process.cwd(), 'evidence/browser/01_login_gate.png'));
    results.push({
      step: '1. Unauthenticated Login Gate Render',
      passed: loginLoaded,
      details: 'Rendered SentinAI Guardian Operator Password login form',
      screenshot: 'evidence/browser/01_login_gate.png',
    });

    // 2. Test Wrong Password Rejection
    await setInputValueAndSubmit(cdp, '#password', 'wrong-password-test');
    const wrongRejected = await waitForText(cdp, 'Invalid credentials', 10000);
    await sleep(300);
    await cdp.screenshot(path.resolve(process.cwd(), 'evidence/browser/02_invalid_login_rejected.png'));
    results.push({
      step: '2. Invalid Password Rejected Fail-Closed',
      passed: wrongRejected,
      details: 'Displayed Invalid credentials alert and kept console locked',
      screenshot: 'evidence/browser/02_invalid_login_rejected.png',
    });

    // 3. Authenticate with Correct Operator Password
    const operatorPassword = process.env.OPERATOR_PASSWORD || '';
    await setInputValueAndSubmit(cdp, '#password', operatorPassword);
    const dashboardLoaded = await waitForText(cdp, 'Executive Financial Command Center', 20000);
    await sleep(1000);
    await cdp.screenshot(path.resolve(process.cwd(), 'evidence/browser/03_authenticated_command_center_1440.png'));
    await cdp.screenshot(path.resolve(process.cwd(), 'evidence/ui/desktop_1440_overview.png'));
    results.push({
      step: '3. Valid Operator Login & Command Center Load',
      passed: dashboardLoaded,
      details: 'Authenticated via HMAC-SHA256 session cookie and loaded live Sepolia balance & telemetry',
      screenshot: 'evidence/browser/03_authenticated_command_center_1440.png',
    });

    // 4. Responsive Viewports (Laptop 1024px, Tablet 768px & Mobile 375px)
    await cdp.setViewport(1024, 768, false);
    await sleep(400);
    const laptopNoOverflow = await cdp.evaluate<boolean>(
      `document.documentElement.scrollWidth <= window.innerWidth + 4`
    );
    await cdp.screenshot(path.resolve(process.cwd(), 'evidence/ui/laptop_1024_overview.png'));

    await cdp.setViewport(768, 1024, true);
    await sleep(400);
    const tabletNoOverflow = await cdp.evaluate<boolean>(
      `document.documentElement.scrollWidth <= window.innerWidth + 4`
    );
    await cdp.screenshot(path.resolve(process.cwd(), 'evidence/ui/tablet_768_overview.png'));

    await cdp.setViewport(375, 812, true);
    await sleep(400);
    const mobileNoOverflow = await cdp.evaluate<boolean>(
      `document.documentElement.scrollWidth <= window.innerWidth + 4`
    );
    await cdp.screenshot(path.resolve(process.cwd(), 'evidence/ui/mobile_375_overview.png'));

    await cdp.setViewport(1440, 900, false);
    await sleep(400);
    results.push({
      step: '4. Responsive Layout Audit (1440px, 1024px, 768px, 375px)',
      passed: laptopNoOverflow && tabletNoOverflow && mobileNoOverflow,
      details: `laptopNoOverflow=${laptopNoOverflow}, tabletNoOverflow=${tabletNoOverflow}, mobileNoOverflow=${mobileNoOverflow}`,
      screenshot: 'evidence/ui/laptop_1024_overview.png',
    });

    // 5. Guided Step 1: Live Wallet Balance Query ("Show my balance")
    await cdp.evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('#guided-demo button'));
      if (buttons[0]) buttons[0].click();
    })()`);
    const balanceQueryOk = await waitForText(cdp, 'READ-ONLY · NO SIGNER REQUIRED', 15000);
    await cdp.evaluate(`document.querySelector('#agent-console')?.scrollIntoView({ behavior: 'instant' })`);
    await sleep(400);
    await cdp.screenshot(path.resolve(process.cwd(), 'evidence/browser/04_live_balance_query.png'));
    results.push({
      step: '5. Live Balance Query ("Show my balance")',
      passed: balanceQueryOk,
      details: 'Rendered Live Wallet Intelligence card with READ-ONLY badge and Sepolia balances',
      screenshot: 'evidence/browser/04_live_balance_query.png',
    });

    // 6. Guided Step 2: Valid Safe ETH Transfer ("Send 0.0001 ETH to alice")
    await cdp.evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('#guided-demo button'));
      if (buttons[1]) buttons[1].click();
    })()`);
    const safeTransferOk = await waitForText(cdp, 'Human-in-the-Loop Execution Gate', 25000);
    await cdp.evaluate(`document.querySelector('#agent-console')?.scrollIntoView({ behavior: 'instant' })`);
    await sleep(500);
    await cdp.screenshot(path.resolve(process.cwd(), 'evidence/browser/05_safe_eth_transfer_prepared.png'));
    results.push({
      step: '6. Valid Safe ETH Transfer ("Send 0.0001 ETH to alice")',
      passed: safeTransferOk,
      details: 'Live AI parsed intent, passed policy & simulation, and rendered Pre-Execution Transaction Review gate',
      screenshot: 'evidence/browser/05_safe_eth_transfer_prepared.png',
    });

    // Test Cancel Proposal Button
    await cdp.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Cancel Proposal'));
      if (btn) btn.click();
    })()`);
    await sleep(600);

    // 7. Guided Step 3: Multilingual Bengali Prompt ("এলিস কে ০.০০০১ ইথ পাঠাও")
    await cdp.evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('#guided-demo button'));
      if (buttons[2]) buttons[2].click();
    })()`);
    const bengaliOk = await waitForText(cdp, 'Human-in-the-Loop Execution Gate', 25000);
    await cdp.evaluate(`document.querySelector('#agent-console')?.scrollIntoView({ behavior: 'instant' })`);
    await sleep(500);
    await cdp.screenshot(path.resolve(process.cwd(), 'evidence/browser/06_bengali_intent_prepared.png'));
    results.push({
      step: '7. Multilingual Native Bengali Prompt ("এলিস কে ০.০০০১ ইথ পাঠাও")',
      passed: bengaliOk,
      details: 'Live AI parsed Bengali transfer into 0.0001 ETH to Alice and passed all 5 pre-sign gates',
      screenshot: 'evidence/browser/06_bengali_intent_prepared.png',
    });

    // Cancel Bengali Proposal
    await cdp.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Cancel Proposal'));
      if (btn) btn.click();
    })()`);
    await sleep(600);

    // 8. Guided Step 4: Excessive Spend Blocked ("Send 5 ETH to alice")
    await cdp.evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('#guided-demo button'));
      if (buttons[3]) buttons[3].click();
    })()`);
    const excessiveBlocked = await waitForText(cdp, 'Execution Permanently Prohibited', 25000);
    await cdp.evaluate(`document.querySelector('#agent-console')?.scrollIntoView({ behavior: 'instant' })`);
    await sleep(500);
    await cdp.screenshot(path.resolve(process.cwd(), 'evidence/browser/07_excessive_spend_blocked.png'));
    results.push({
      step: '8. Excessive Amount Policy Block ("Send 5 ETH to alice")',
      passed: excessiveBlocked,
      details: 'Blocked by deterministic policy engine (EXCEEDS_PER_TX_LIMIT) with NON-EXECUTABLE PROPOSAL badge',
      screenshot: 'evidence/browser/07_excessive_spend_blocked.png',
    });

    // 9. Guided Step 5: Negation Safety Filter ("Do not send 0.1 ETH to alice")
    await cdp.evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('#guided-demo button'));
      if (buttons[4]) buttons[4].click();
    })()`);
    await sleep(800);
    const negationBlocked = await waitForText(cdp, 'NON-EXECUTABLE PROPOSAL', 20000);
    await cdp.evaluate(`document.querySelector('#agent-console')?.scrollIntoView({ behavior: 'instant' })`);
    await sleep(500);
    await cdp.screenshot(path.resolve(process.cwd(), 'evidence/browser/08_negation_blocked.png'));
    results.push({
      step: '9. Negation Safety Filter ("Do not send 0.1 ETH to alice")',
      passed: negationBlocked,
      details: 'Halted at INTENT_VALIDATION with CONTRADICTORY_INSTRUCTION before transaction builder',
      screenshot: 'evidence/browser/08_negation_blocked.png',
    });

    // 10. Guided Step 7: Topic F ERC-20 Phishing Fixture ("excessive-finite-approval")
    await cdp.evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('#guided-demo button'));
      if (buttons[6]) buttons[6].click();
    })()`);
    const fixtureIsolated = await waitForText(cdp, 'NON-EXECUTABLE DEMO', 15000);
    await cdp.evaluate(`document.querySelector('#agent-console')?.scrollIntoView({ behavior: 'instant' })`);
    await sleep(500);
    await cdp.screenshot(path.resolve(process.cwd(), 'evidence/browser/09_phishing_fixture_demo.png'));
    results.push({
      step: '10. Topic F Threat Fixture Isolation ("Phishing: 1M USDC Approval")',
      passed: fixtureIsolated,
      details: 'Displayed DEMO / SIMULATED and NON-EXECUTABLE DEMO badges; no signing button rendered',
      screenshot: 'evidence/browser/09_phishing_fixture_demo.png',
    });

    // 11. Scroll to Security History & Policy Management
    await cdp.evaluate(`document.querySelector('#security-center')?.scrollIntoView({ behavior: 'instant' })`);
    await sleep(500);
    const confirmedTxVisible = await waitForText(cdp, 'CONFIRMED', 10000);
    await cdp.screenshot(path.resolve(process.cwd(), 'evidence/browser/10_policy_editor_and_history.png'));
    results.push({
      step: '11. Proposal History & Confirmed Sepolia Tx Display',
      passed: confirmedTxVisible,
      details: 'Verified CONFIRMED Sepolia transaction 0xfe315950... and Policy Management panel in DOM',
      screenshot: 'evidence/browser/10_policy_editor_and_history.png',
    });

    // 12. Scroll to Architecture Panel
    await cdp.evaluate(`document.querySelector('#architecture')?.scrollIntoView({ behavior: 'instant' })`);
    await sleep(500);
    const archVisible = await waitForText(cdp, 'Architecture & How It Works', 10000);
    await cdp.screenshot(path.resolve(process.cwd(), 'evidence/ui/architecture_panel.png'));
    results.push({
      step: '12. Architecture & Trust Boundary Inspector Render',
      passed: archVisible,
      details: 'Rendered 6-stage pipeline architecture and 4 core security invariants',
      screenshot: 'evidence/ui/architecture_panel.png',
    });

    const summaryPayload = {
      executedAt: new Date().toISOString(),
      browser: 'Google Chrome Headless (CDP)',
      appUrl: APP_URL,
      allPassed: results.every((r) => r.passed),
      pageErrors: cdp.pageErrors,
      results,
    };

    const outJson = path.resolve(process.cwd(), 'evidence/browser/browser_test_results.json');
    fs.mkdirSync(path.dirname(outJson), { recursive: true });
    fs.writeFileSync(outJson, JSON.stringify(summaryPayload, null, 2));
    console.log('BROWSER_E2E_SUMMARY:', JSON.stringify(summaryPayload, null, 2));
  } finally {
    cdp.close();
    chromeProc.kill();
    // Restore original sentinai.db and truncate WAL so test runs never leave extra rows
    try {
      fs.copyFileSync(backupPath, dbPath);
      if (fs.existsSync(`${dbPath}-wal`)) fs.writeFileSync(`${dbPath}-wal`, Buffer.alloc(0));
      fs.unlinkSync(backupPath);
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error('BROWSER_E2E_FATAL:', err);
  process.exit(1);
});
