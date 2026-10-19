# Phase 3: Video Editing & Post-Production Timeline

**Project:** SentinAI Guardian — An AI-Native Autonomous Wallet with Deterministic Risk Control  
**Target Export Format:** `MP4` (`H.264` Video + `AAC` Audio, `1920x1080`, `60 fps`, `3:00` total duration)  
**Subtitle Track:** [`docs/submission/VIDEO_CAPTIONS_EN.srt`](./VIDEO_CAPTIONS_EN.srt)  

---

## 1. Non-Linear Editor (NLE) Timeline Layout (`0:00:00` – `0:03:00`)

Use three synchronized tracks in CapCut Desktop, DaVinci Resolve, Premiere Pro, or Clipchamp:
- **Track V2 (Overlays & Callouts):** Clean lower-third titles and subtle zoom keyframes (`1.25x`–`1.35x` scale with `0.3s` ease-in/out).
- **Track V1 (Primary Video):** `1920x1080` screen recording captured from OBS Studio (`Shot 1` through `Shot 8`).
- **Track A1 (Voiceover Audio):** English narration recorded at `48 kHz` (`-6 dB` to `-3 dB` peak, `-14 LUFS` integrated loudness).
- **Subtitle Track (`SRT`):** Import [`VIDEO_CAPTIONS_EN.srt`](./VIDEO_CAPTIONS_EN.srt) directly so all 24 caption blocks align automatically to the millisecond.

---

## 2. Precision Editing & Zoom Keyframe Schedule

| Timeline Range | Segment Title | Video Track (`V1`) Source | Zoom / Pan Keyframe (`V1`) | On-Screen Text Callout (`V2` Lower Third) | Caption Blocks (`SRT`) |
|---|---|---|---|---|---|
| `00:00:00 – 00:00:20` | **1. The Problem** | `Shot 1`: Operator Login Gate (`AuthGate`) $\rightarrow$ Dashboard unlock | `1.0x` full screen (`0:00–0:10`), `1.15x` zoom on top security banner (`0:10–0:20`) | **The Autonomous Wallet Paradox** · Probabilistic LLMs vs. Irreversible Blockchains | `#1 – #3` |
| `00:00:20 – 00:00:40` | **2. The Solution** | `Shot 2`: Overview telemetry cards + Step 1 (`"Show my balance"`) | `1.0x` full dashboard (`0:20–0:30`), `1.25x` zoom on `READ-ONLY · NO SIGNER REQUIRED` badge (`0:30–0:40`) | **SentinAI Guardian (Topic F)** · Strict Privilege Separation & 6-Gate Risk Firewall | `#4 – #6` |
| `00:00:40 – 00:01:05` | **3. Live AI Intent** | `Shot 3`: Step 2 (`"Send 0.0001 ETH to alice"`) & Step 3 (`"এলিস কে ০.০০০১ ইথ পাঠাও"`) | `1.25x` zoom on AI Provenance badge (`GROQ AI` / `GEMINI AI`), `0.0001 ETH`, and resolved address `0xaeb838...2148` | **Live Multilingual Intent** · `0.0001 ETH` Prepared · Fail-Closed Recipient Resolution | `#7 – #9` |
| `00:01:05 – 00:01:30` | **4. Deterministic Security** | `Shot 4`: 6-Stage Pipeline Stepper + Pre-Execution Transaction Review Card | `1.30x` zoom on **6-Stage Pipeline Stepper** (`01`–`05` green `PASS`, `06` `Human Approval`) & **Keccak-256 IIP Digest** | **Deterministic Security Core** · `1.0 ETH` Cap · Calldata Verified · Sepolia Simulation · IIP Digest | `#10 – #12` |
| `00:01:30 – 00:01:55` | **5. Attack Rejection** | `Shot 5`: Step 4 (`5 ETH` overspend), Step 5 (`Do not send`), Step 6 (`Ignore policies`), Step 7 (`Phishing fixture`) | `1.25x` zoom on red **`NON-EXECUTABLE PROPOSAL`** badge and policy violation reasons (`EXCEEDS_PER_TX_LIMIT`) | **Non-Bypassable Policy Enforcement** · Overspend, Negation, Prompt Injection & Drainers Blocked | `#13 – #15` |
| `00:01:55 – 00:02:20` | **6. Blockchain Evidence** | `Shot 6`: `#security-center` Audit Trail $\rightarrow$ Sepolia Etherscan tab (`0xfe315950...88da`) | `1.20x` zoom on Etherscan Tx Hash `0xfe315950...88da`, Block `#11935960`, Value `0.00001 ETH`, Gas `21,000 / 12,000` | **Verified On-Chain Sepolia Proof** · Tx `0xfe315950...88da` · Block `#11935960` · Value `0.00001 ETH` | `#16 – #18` |
| `00:02:20 – 00:02:40` | **7. Architecture** | `Shot 7`: `#architecture` section & expanded `Inspect Trust Boundaries` | `1.20x` zoom on pipeline flow: `AI -> Validation -> Policy -> Simulation -> Human Approval -> Blockchain` | **Defense-in-Depth Architecture** · `AI -> Validation -> Policy -> Simulation -> Human Approval -> Blockchain` | `#19 – #21` |
| `00:02:40 – 00:03:00` | **8. Closing** | `Shot 8`: Return to `#overview` Executive Command Center | `1.0x` full screen with clean 1-second fade to black at `02:59` | **SentinAI Guardian** · 354 Automated Tests Passing · Topic F Autonomous Wallet | `#22 – #24` |

---

## 3. Recommended Export Settings (GUI & CLI)

### Option A — GUI Export (CapCut Desktop / DaVinci Resolve / Clipchamp)
- **File Name:** `SentinAI_Guardian_Demo_Video.mp4`
- **Resolution:** `1920x1080` (`1080p`)
- **Frame Rate:** `60 fps` (or `30 fps` if keeping file size under `18 MB` for direct email attachment)
- **Video Codec:** `H.264` (`MP4`), Bitrate `8–12 Mbps` VBR (produces a crisp `~18–25 MB` file for a 3-minute UI video)
- **Audio Codec:** `AAC`, `48 kHz`, `192 kbps` Stereo
- **Subtitles:** Burn-in [`VIDEO_CAPTIONS_EN.srt`](./VIDEO_CAPTIONS_EN.srt) in white `Inter` / `Calibri` `22pt` font with a semi-transparent dark background box (`#0B0F17` at `80%` opacity).

### Option B — Command-Line Encoding & Subtitle Burn-In (If Installing `ffmpeg` via `winget install Gyan.FFmpeg`)
*(Note: `ffmpeg` is not currently installed on this workstation. If the owner installs it via `winget install Gyan.FFmpeg`, run the following command to mux raw screen video, voiceover audio, and English `.srt` subtitles into a competition-ready MP4 under 20 MB):*

```powershell
ffmpeg -i raw_screen_recording.mp4 -i voiceover_en.wav `
  -vf "subtitles=docs/submission/VIDEO_CAPTIONS_EN.srt:force_style='FontName=Calibri,FontSize=18,PrimaryColour=&H00FFFFFF,BackColour=&H80170F0B,BorderStyle=4,Outline=0,Shadow=0,MarginV=24'" `
  -map 0:v:0 -map 1:a:0 `
  -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -r 30 `
  -c:a aac -b:a 192k -ar 48000 `
  -t 00:03:00 -movflags +faststart `
  deliverables/SentinAI_Guardian_Demo_Video.mp4
```
