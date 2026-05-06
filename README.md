# ⚒️ Forge AI Studio

**Local LLM Fine-Tuning & Orchestration Suite**

Forge is a production-grade, local-first platform designed for fine-tuning, managing, and deploying Large Language Models (LLMs) with surgical precision. It combines a high-fidelity "Molten Forge" aesthetic with robust hardware-aware backend services to provide a seamless developer experience for local AI development.

![Forge Banner](fromtedn/src/assets/hero.png)

---

## 🚀 Core Features

- **Hardware-Aware Training**: Automatic detection of NVIDIA or Apple Silicon GPUs with real-time VRAM calculation and allocation.
- **Ollama Native**: Direct integration with Ollama for model pulling, management, and inference.
- **Advanced Orchestration**:
  - **TrainView**: Surgical control over fine-tuning parameters (LoRA, Alpha, Epochs, Rank).
  - **Hub**: Unified management for local datasets and model versions.
  - **Playground**: High-fidelity, real-time inference playground with streaming support.
- **Molten Forge Aesthetic**: A premium "Linear-meets-Raycast" UI featuring deep black backgrounds, ember particle systems, and sleek typography.

---

## 🛠️ Tech Stack

### Frontend (`/fromtedn`)
- **Framework**: [React 19](https://react.dev/) + [Vite 8](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Icons**: [Lucide React](https://lucide.dev/)

### Backend (`/forge-backend`)
- **API**: [FastAPI](https://fastapi.tiangolo.com/)
- **Runtime**: Python 3.10+
- **Integrations**: [Ollama](https://ollama.com/), `pynvml` (GPU monitoring)
- **Server**: Uvicorn

---

## 🏗️ Project Structure

```bash
├── forge-backend/       # FastAPI Backend
│   ├── routers/         # API Endpoints (Chat, Training, Models)
│   ├── services/        # Business Logic (Ollama, Hardware, Datasets)
│   ├── utils/           # Log Parsers, VRAM Calculators
│   └── main.py          # Entry point
├── fromtedn/            # React Frontend (Vite)
│   ├── src/components/  # UI Elements (Ember Background, Sidebar)
│   ├── src/views/       # Feature Pages (Train, Hub, Models, Playground)
│   └── src/store/       # Zustand State Management
└── forge-opus/          # (Optional) Alternative Frontend / Submodule
```

---

## ⚡ Quick Start (Zero-Config)

Forge features a fully automated setup script that handles dependency installation, hardware detection, and external tool configuration (Ollama, LLaMA-Factory).

### 1. One-Click Setup
```bash
cd forge-backend
python start.py
```
**What this script does:**
- ✅ Checks Python version (3.11+ required).
- ✅ Detects GPU (NVIDIA or Apple Silicon).
- ✅ Auto-installs missing Python dependencies.
- ✅ Auto-installs & starts **Ollama** if missing.
- ✅ Auto-clones and installs **LLaMA-Factory** for training orchestration.
- ✅ Auto-detects and starts the **Frontend Studio** (Vite).
- ✅ Launches the Studio in your default browser.

### 2. Manual Setup (Optional)
If you prefer to manage dependencies yourself:

#### Backend
```bash
cd forge-backend
pip install -r requirements.txt
python main.py
```

#### Frontend
```bash
cd fromtedn
npm install
npm run dev
```
*The studio will be available at `http://localhost:3004`*

---

## 🔮 Roadmap
- [ ] Multi-GPU Support
- [ ] Export to GGUF/Safetensors via Web UI
- [ ] Integrated Dataset Labeling Tool
- [ ] Remote Orchestration via SSH

---

## 📜 License
MIT License. See [LICENSE](LICENSE) for details.

---

*Forged with ❤️ by Tashon Braganca*
