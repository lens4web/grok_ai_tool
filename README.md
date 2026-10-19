<div align="center">

# ⚡ Grok AI Studio

**A self-hosted, privacy-first web workspace and hardened API proxy for the full xAI Grok ecosystem.**

[![Next.js 16](https://img.shields.io/badge/Next.js-16.3.6-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.2.8-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?style=flat&logo=tailwindcss)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green?style=flat&logo=node.js)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-80%20passing-brightgreen?style=flat)](https://github.com/lens4web/grok_ai_tool)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Features](#-key-features) • [Security & Privacy](#-security--privacy-architecture) • [Supported Models](#-supported-models--capabilities) • [Getting Started](#-getting-started) • [Deployment](#-production-deployment) • [Testing](#-testing--quality-assurance)

</div>

---

## 🌟 Overview

**Grok AI Studio** is an open-source, production-ready web application engineered to unlock the complete capabilities of the **xAI API**. Built on **Next.js 16 App Router**, **React 19**, and **Tailwind CSS v4**, it provides an intuitive, responsive workspace for text generation, deep reasoning, image creation and inpainting, multimodal video synthesis, high-fidelity speech synthesis, audio transcription, and low-latency realtime voice interaction.

Designed from the ground up with **zero-trust security principles**, Grok AI Studio ensures that your xAI API keys are never exposed to browser storage or persisted on disk. All communication is brokered through a hardened, same-origin Node.js proxy with dynamic Content Security Policy (CSP) nonces, strict Server-Side Request Forgery (SSRF) guards, and binary magic-byte media verification.

---

## ✨ Key Features

### 🧠 1. Text Generation & Deep Reasoning
- **Next-Gen Models**: Direct support for `grok-4.7`, `grok-4.6`, `grok-4.5`, `grok-4.3`, `grok-4.20`, and `grok-build-0.1`.
- **Reasoning Controls**: Adjust reasoning effort (`none`, `low`, `medium`, `high`) for models that support chain-of-thought exploration.
- **Search Augmentation**: Toggle live Web Search and X (Twitter) search grounding for up-to-the-minute real-world information.
- **Structured Outputs**: Full support for JSON Mode and strict `JSON Schema` validation.
- **System Instructions**: Set dedicated system directives, control token budgets, and fine-tune sampling parameters (`temperature` vs `top_p`).

### 🎨 2. Image Studio (Generation & Inpainting)
- **Imagine Image 2.0 & Pro**: Create photorealistic images with `grok-imagine-image-2.0` and classic `grok-imagine-image`.
- **Quality Modes**: Switch between `speed` (fast iterations) and `quality` (high-fidelity rendering) on Image 2.0.
- **Flexible Aspect Ratios & Resolutions**: Support for 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9, and 1k/2k resolutions.
- **Image Editing & Inpainting**: Upload up to 5 reference images to guide edits, styles, and character consistency.
- **Secure Media Proxies**: Downloaded images are validated via file signatures (JPEG, PNG, WebP) and served as local Blob URLs without leaking credentials.

### 🎬 3. Video Synthesis Studio
- **`grok-imagine-video-1.5`**:
  - Multi-prompt multimodal video generation (text-to-video, image animation, reference images).
  - High resolutions: 480p, 720p, and 1080p.
  - Duration from 1 to 15 seconds.
  - **Character & Style Anchors**: Assign roles to uploaded images (Reference `<IMAGE_1>`, Locked First Frame `<IMAGE_0>`, Locked Last Frame, or Keyframes at precise timestamps).
  - **Multi-Voice Audio Binding**: Attach up to 3 preset voices (`<AUDIO_0>`, `<AUDIO_1>`, `<AUDIO_2>`) directly bound to characters in the prompt.
- **`grok-imagine-video-1.5-lite`**:
  - Ultra-fast text-to-video and single-frame image-to-video.
  - Built-in native speech lip-sync audio generation.
  - Optimized cost and throughput across 480p, 720p, and 1080p.
- **Classic Video Editing & Extension**:
  - Extend existing MP4 videos by adding 2–10 seconds.
  - Edit existing MP4 clips up to 8.7 seconds with textual prompt instructions.
- **Robust Async Polling**: Non-blocking request tracking with automatic status retry, local cancellation, and manual request-ID recovery.

### 🎙️ 4. Audio, Speech & Realtime Voice
- **Grok Text-to-Speech (TTS)**:
  - High-fidelity voice generation using `/v1/tts`.
  - 28 built-in studio voices (e.g., `eve`, `adam`, `steve`, `victoria`, `leo`, `charlie`, `bella`, etc.) plus custom voice IDs.
  - Formats: MP3 (configurable bitrate 32–320 kbps), WAV, PCM, μ-law, and A-law (8 kHz to 48 kHz).
  - Speech rate tuning, text normalization, word-level timestamps, and custom JSON pronunciation lexicons.
  - Up to 60,000 characters per synthesis request.
- **Voice Transcribe 2.0 (STT)**:
  - Fast, accurate multipart transcription via `/v1/stt`.
  - Speaker diarization, channel separation, voice activity detection (VAD), number formatting, and filler word filtering.
- **Voice Think Fast 2.0 (Realtime Voice)**:
  - Interactive low-latency voice interaction via WebSocket with ephemeral session tokens.
  - Bidirectional text and audio streaming with instant response synthesis.

### 🌍 5. Internationalization & Ergonomics
- **20 Languages Supported**: English, Russian, Spanish, French, German, Portuguese, Italian, Chinese, Japanese, Korean, Arabic, Hindi, Bengali, Turkish, Indonesian, Vietnamese, Thai, Ukrainian, Persian, and Urdu.
- **Native RTL Layouts**: Full Right-to-Left (RTL) mirroring and typography for Arabic, Persian, and Urdu.
- **Dynamic Theming**: Seamless Dark, Light, and System themes that persist across sessions without reloading or losing input state.
- **Per-Model In-Memory Drafts**: Switching between models preserves each model's text, attachments, selected options, and active request IDs in an isolated draft state.

---

## 🔒 Security & Privacy Architecture

Grok AI Studio is architected specifically to safely operate in untrusted environments and public deployments.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Client Browser                                  │
│   • HttpOnly, Secure, SameSite=Strict Session Cookie                        │
│   • Nonced Content-Security-Policy (CSP)                                    │
│   • Never stores API keys in localStorage / sessionStorage / cookies        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                      Same-Origin POST /api/session
                      Strict Header: X-Grok-Request: 1
                      Origin Matching: APP_ORIGIN
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                    Next.js Hardened Gateway (Node.js)                       │
│   • Ephemeral In-Memory Key Vault (Cleared on process exit / 8h TTL)        │
│   • Bounded Stream Parser (Strict 72 MiB body limit to prevent OOM)        │
│   • Rate Limiting & Same-Origin Enforcement                                 │
│   • Redacted Logging (API keys and base64 payloads stripped from logs)      │
│   • SSRF Protection for Media Downloads:                                    │
│       - Whitelisted hosts: *.x.ai CDN endpoints only                        │
│       - No redirects allowed (`redirect: 'error'`)                          │
│       - Binary magic-byte verification (MP4 'ftyp', PNG, JPEG, WebP)        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                     Outbound TLS / HTTPS to api.x.ai
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                              xAI Cloud API                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Security Guarantees:
1. **Zero Persistent Storage of Secrets**:
   - The user's xAI API key is verified once against `/v1/models` and held strictly in an **in-memory RAM vault** with an opaque, cryptographic session token returned in an `__Host-` / `HttpOnly`, `SameSite=Strict` cookie.
   - Closing the session or restarting the server permanently purges the key.
2. **Strict Origin & CSRF Defense**:
   - All API endpoints mandate the custom header `X-Grok-Request: 1` and verify `Sec-Fetch-Site: same-origin` along with `Origin: ${APP_ORIGIN}`. Requests from unauthorized origins or cross-site contexts are immediately rejected.
3. **Hardened Media Proxy & SSRF Prevention**:
   - When downloading generated images or videos, the server verifies that the destination URL matches strictly approved xAI hosts (`vidgen.x.ai`, `imgen.x.ai`, `files-cdn.x.ai`).
   - Redirects are forbidden (`redirect: 'error'`), size limits are enforced (25 MiB for images, 256 MiB for video), and incoming payloads are inspected for valid binary signatures (`ftyp` MP4 box, PNG/JPEG headers) before streaming to the browser.
4. **Dynamic CSP Nonces**:
   - Every HTTP response is signed with a unique cryptographic nonce generated per-request. Inline scripts and styles are prevented from executing unless explicitly permitted by the nonce.

---

## 📊 Supported Models & Capabilities

| Capability | Models | Endpoints & Key Parameters |
| :--- | :--- | :--- |
| **Reasoning & Chat** | `grok-4.7`, `grok-4.6`, `grok-4.5`, `grok-4.3`, `grok-4.20`, `grok-build-0.1` | `/v1/responses`<br>• Temperature / Top-P<br>• Reasoning effort (`none`, `low`, `medium`, `high`)<br>• Web & X search grounding<br>• JSON Schema structured output |
| **Image Synthesis** | `grok-imagine-image-2.0`<br>`grok-imagine-image` | `/images/generations`, `/images/edits`<br>• Aspect ratios: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9<br>• Quality modes (`speed` / `quality`)<br>• Up to 5 reference images |
| **Video 1.5** | `grok-imagine-video-1.5` | `/v1/videos/generations`<br>• Text-to-video, image animation, multi-reference<br>• Keyframes, locked start & end frames<br>• Reference voice binding (`<AUDIO_0>`…`<AUDIO_2>`)<br>• Resolutions: 480p, 720p, 1080p |
| **Video 1.5 Lite** | `grok-imagine-video-1.5-lite` | `/v1/videos/generations`<br>• Ultra-fast generation with native lip-sync audio<br>• Single-image animation or text-to-video<br>• Resolutions: 480p, 720p, 1080p |
| **Video Edit & Extend** | `grok-imagine-video` (Classic) | `/v1/videos/edits`, `/v1/videos/extensions`<br>• Extend clip by 2–10 seconds<br>• Edit clip up to 8.7 seconds |
| **Text-to-Speech (TTS)** | `grok-tts` | `/v1/tts`<br>• 28 preset voices or custom voice IDs<br>• MP3, WAV, PCM, μ-law, A-law<br>• Word timestamps & pronunciation dictionaries |
| **Speech-to-Text (STT)** | `grok-voice-transcribe-2.0` | `/v1/stt`<br>• Multipart audio upload<br>• Speaker diarization, VAD, number formatting |
| **Realtime Voice** | `grok-voice-think-fast-2.0` | Bidirectional WebSocket<br>• Ephemeral tokens, interactive bidirectional audio |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v20.9.0` or higher (tested on Node.js `22.x` and `24.x`).
- **Package Manager**: `npm` (v10+).
- **xAI API Key**: Obtainable from the [xAI Developer Console](https://console.x.ai/).

### Local Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/lens4web/grok_ai_tool.git
   cd grok_ai_tool
   ```

2. **Install dependencies**:
   ```bash
   npm ci
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```
   *Note: Webpack (`--webpack`) is configured by default for reliable asset bundling and typography compatibility.*

4. **Open the application**:
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser.
   - Click **API Settings** in the upper right.
   - Paste your personal xAI API key (`xai-...`) and click **Connect**.
   - Your key is validated against `/v1/models` and held securely in server memory for the duration of your session.

---

## 🛠️ Configuration & Environment Variables

| Variable | Default | Purpose | Required in Prod |
| :--- | :--- | :--- | :---: |
| `APP_ORIGIN` | `http://localhost:3000` | The canonical public origin (e.g. `https://grok.yourdomain.com`). Strictly enforced on all incoming API requests. | **Yes** |
| `PORT` | `3000` | The local port the Node.js process listens on. | Optional |
| `HOSTNAME` | `0.0.0.0` (or `127.0.0.1`) | The network interface to bind to. | Optional |
| `NODE_ENV` | `development` | Set to `production` for production builds. | Recommended |

---

## 🌐 Production Deployment

Grok AI Studio is designed to run as a **standalone Node.js server** behind a reverse proxy (such as Nginx, Caddy, or Cloudflare). Because CSP nonces and memory-backed session vaults require an active Node runtime, static export hosting (e.g., GitHub Pages) is not supported.

### 1. Build the Standalone Artifact
```bash
npm ci
npm run build
cp -a public .next/standalone/public
cp -a .next/static .next/standalone/.next/static
```

### 2. Run with Systemd
Create `/etc/systemd/system/grok.service` (a template is provided in [`deploy/grok/grok.service`](deploy/grok/grok.service)):

```ini
[Unit]
Description=Grok AI Studio Standalone Service
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=grokdeploy
Group=grokdeploy
WorkingDirectory=/srv/grok/current
Environment=NODE_ENV=production
Environment=APP_ORIGIN=https://grok.yourdomain.com
Environment=HOSTNAME=127.0.0.1
Environment=PORT=3002
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0027
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/grok/releases

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now grok.service
```

### 3. Nginx Reverse Proxy
Configure Nginx with a client body size of at least `75m` and long timeouts to accommodate large file uploads, reasoning models, and video polling:

```nginx
server {
    listen 443 ssl http2;
    server_name grok.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/grok.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/grok.yourdomain.com/privkey.pem;

    client_max_body_size 75m;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 10s;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
        proxy_cache off;
    }
}
```

### 4. CI/CD with GitHub Actions
An automated GitHub Actions workflow is included at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). It automatically runs tests, typechecks, builds standalone bundles, performs smoke tests, and deploys zero-downtime releases over SSH.

To use the workflow, configure the following **GitHub Repository Secrets**:
- `GROK_DEPLOY_KEY`: Private SSH key for the deployment user.
- `GROK_KNOWN_HOSTS`: SSH `known_hosts` fingerprint of the deployment target.
- `GROK_DEPLOY_HOST`: IP address or domain of the deployment server.
- `GROK_DEPLOY_USER`: Deployment username (e.g. `grokdeploy`).

---

## 🧪 Testing & Quality Assurance

The codebase includes an extensive test suite verifying API payload transformations, security headers, media proxy validation, and schema definitions without consuming any paid xAI API credits:

```bash
# Run unit and integration tests (80 tests)
npm test

# Run ESLint validation
npm run lint

# Run TypeScript typechecker
npm run typecheck

# Run SEO & metadata audit
SEO_TEST_ORIGIN=http://127.0.0.1:3002 npm run test:seo
```

---

## 📂 Repository Structure

```
├── .github/workflows/        # Automated CI/CD deployment pipeline
├── deploy/grok/              # Production systemd and nginx configuration templates
├── docs/                     # Architecture, security, and model documentation
│   ├── AUDIT.md              # Security audit and compliance review
│   ├── UI_SECURITY.md        # Session vault, themes, and CSP documentation
│   ├── MODEL_INFO.md         # xAI model catalog dates and mobile validations
│   ├── VIDEO_DOWNLOAD.md     # Video download proxy and SSRF defense details
│   └── MODEL_WORKSPACE.md    # Multi-model draft state preservation architecture
├── public/                   # Static icons, manifest, and Open Graph assets
├── scripts/                  # Build scripts, brand asset generator, test runner
├── src/
│   ├── app/                  # Next.js 16 App Router pages and API routes
│   │   ├── api/grok/         # Hardened xAI API gateway proxy
│   │   ├── api/session/      # Secure session key exchange endpoint
│   │   └── ...
│   ├── components/           # UI components, model forms, settings dialogs
│   ├── lib/                  # Security utilities, validation schemas, translations
│   └── proxy.ts              # CSP nonce generation and security headers proxy
├── package.json
└── tsconfig.json
```

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

## 🤝 Acknowledgments

- Built for the **[xAI Developer Community](https://docs.x.ai/)**.
- Designed and maintained by [lens4web.com](https://lens4web.com).
