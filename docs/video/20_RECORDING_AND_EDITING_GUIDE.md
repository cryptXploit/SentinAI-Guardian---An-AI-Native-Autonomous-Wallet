# Phase 9: Video Recording & Editing Production Guide

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control  
**Competition:** 2026 Shenzhen International FinTech Competition — International Track (Topic F)  

---

## 1. Pre-Recording Environment Checklist

1. **Start Clean Local Server:**
   ```bash
   npm run dev
   ```
2. **Browser Setup:**
   - Open Google Chrome or Microsoft Edge in a clean window (Incognito or hidden bookmarks bar `Ctrl+Shift+B`).
   - Set browser zoom to **`110%`** on a `1920x1080` display so monospace addresses, Keccak-256 digests, and pipeline badges are crisp and legible on video compression.
   - Pre-open a second tab to the confirmed Sepolia Etherscan transaction:
     `https://sepolia.etherscan.io/tx/0xfe315950001536c94f363c6e7b6522eef69a2b874d958544dd91efe5ee8388da`
3. **Never Display Secrets on Video:**
   - Never open `.env` during screen recording.
   - Password input on the login page is masked (`type="password"`).

---

## 2. Recording Settings (OBS Studio / Screen Studio)

- **Canvas & Output Resolution:** `1920x1080` (16:9)
- **Frame Rate:** `60 FPS`
- **Video Encoder:** `H.264 (NVENC / x264)` at `12–15 Mbps` CBR/VBR, exported as `.mp4`
- **Audio Settings:** `48 kHz` AAC stereo (`192 kbps`), noise suppression filter enabled, peak voiceover level at `-6 dB` to `-3 dB`.

---

## 3. Editing & Callout Recommendations

1. **Zoom Keyframes:**
   - At `0:58` (Step 2 Safe Transfer), apply a `1.3x` smooth zoom onto the **Deterministic 6-Stage Execution Pipeline** stepper and the **Pre-Execution Transaction Review** card.
   - At `1:50` (Steps 4–6 Threat Blocking), highlight the red **`NON-EXECUTABLE PROPOSAL`** badge and the **`Halted at Gate`** indicator.
   - At `2:15` (Step 7 Phishing Fixture), highlight the purple **`DEMO / SIMULATED · NON-EXECUTABLE DEMO`** badge to emphasize architectural honesty.
2. **Subtitles / Captions:**
   - Burn in clean English subtitles at the bottom safe margin using the exact script in [`18_DEMO_VOICEOVER_SCRIPT.md`](./18_DEMO_VOICEOVER_SCRIPT.md) so international judges can follow every technical term even in a noisy judging room.
