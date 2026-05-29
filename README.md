# Tamil Daily Kural Video Generator

An automated, end-to-end video production pipeline built with **Remotion** and **Node.js** that generates high-quality, production-ready YouTube Shorts featuring daily Thirukkural verses, translations, and calendar information. 

This project orchestrates local React-based video rendering, Google Cloud Text-to-Speech (TTS) generation, and dynamic audio normalization using FFmpeg to produce beautifully themed, bilingual educational videos.

---

## 🌟 Key Features

*   **Automated Video Composition:** Uses [Remotion](https://www.remotion.dev/) to programmatically render React components frame-by-frame into an MP4 video, ensuring pixel-perfect transitions and animations.
*   **Next-Gen Conversational TTS:** Integrates with Google Cloud TTS API using state-of-the-art **Chirp3-HD Multimodal Models** for highly expressive, human-like bilingual voiceovers (Tamil and English).
*   **Intelligent Audio Normalization:** Automatically detects the LUFS loudness of external audio tracks (e.g., musical Kural renditions) and uses `ffmpeg` (`loudnorm` and `apad` filters) to dynamically balance the AI-generated TTS meaning tracks to match the exact same decibel level.
*   **Dynamic Layout & Typography:** Utilizes responsive web technologies (CSS Flexbox, fluid typography `clamp()`) to ensure consistent visual aesthetics regardless of varying text lengths.
*   **Bilingual Content Engine:** Processes a database of 1330 Kurals, providing pure Tamil (`Thanithamizh`) calendar mappings, English transliterations, and separated phonetic TTS explanations (`tdk-explanation`) for fine-tuned pronunciation control.
*   **Automated Audio Splicing:** Capable of automatically splitting combined 30-second audio files into exact 15-second segments on-the-fly during rendering.

---

## 🛠 Prerequisites

Before running the pipeline, ensure you have the following installed and configured:

1.  **Node.js & npm:** (v18 or higher recommended).
2.  **Google Cloud Service Account:** You must have a `credentials.json` file placed in the root directory with access to the Google Cloud Text-to-Speech API.
3.  **Local Assets Directory:** The pipeline expects a specific directory structure for offline generated assets (musical audio and illustrative images) located at:
    `public/Kurals/Adhikaaram_XXXX/Kural_YYYY/`

---

## 🚀 Usage

The generation pipeline is executed via a Command Line Interface (CLI). 

To generate a video, run the following command from the root directory:

```bash
npm start -- --start-date="2026-05-29" --days=1
```

### CLI Arguments

| Argument | Description | Default |
| :--- | :--- | :--- |
| `--start-date` | The calendar date to begin generation (`YYYY-MM-DD`). | **Required** |
| `--days` | The number of consecutive days (videos) to generate. | **Required** |
| `--test-kural` | Overrides the random selection logic and forces a specific Kural number. | `undefined` |
| `--persona` | The Google Cloud Chirp3-HD persona to use for TTS (e.g., `Leda`, `Puck`, `Fenrir`). | `Leda` |
| `--theme` | Forces a specific visual color theme (e.g., `indigo`, `crimson`, `emerald`). | Randomly selected |
| `--force-regenerate`| Forces the pipeline to ignore cached files and regenerate both the TTS audio and the MP4 video from scratch. | `false` |

### Example Command

To force regenerate the video for Kural 12 using the "Fenrir" voice persona:

```bash
npm start -- --start-date="2026-05-29" --days=1 --test-kural=12 --persona=Fenrir --force-regenerate
```

---

## 📂 Directory Structure

*   `/src`: Core application logic, Kural selection algorithms, and state management.
*   `/src/video`: Remotion React components containing the visual design, animations, and transitions.
*   `/data`: Contains the `thirukkural.json` database and pure Tamil mappings.
*   `/public`: Destination for external static assets (images, musical audio clips).
*   `/data/Daily_Videos`: Output destination where the final rendered `.mp4` videos are saved.

---

## ⚙️ Audio Normalization Pipeline

When executing, the engine checks for the presence of a 30-second `XXXX_kural_meaning_audio.mp3` file. If found without a standalone verse file, it will automatically cut the first 15 seconds. 

It then measures the exact LUFS integrated loudness of that track and applies an identical `loudnorm` filter dynamically via FFmpeg to the generated Google Cloud TTS responses, ensuring uniform volume across all segments before seamlessly stitching them together.
