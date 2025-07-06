# Profile and Tabs Manager – Server Component

This is the backend server for the [Profile Tabs Manager Chrome Extension](https://chromewebstore.google.com/detail/profile-and-tabs-manager/edhaohmmppcambblkdnlecnakgfkgpln), which allows managing Chrome user profiles, viewing open tabs, and saving pages as `.mhtml` offline.

This server is required to use the extension.

---

## 🚀 Quick Start (For Users)

### 1. Download the Server

👉 [📦 GitHub Releases](https://github.com/LiveProger/profile-tabs-manager/releases/tag/reliz)

Download the `.exe` file — no install required.

### 2. Launch the Server

Just run the `.exe`. It opens a background server on port `3000`. Nothing to configure.

### 3. Install the Extension

👉 [🧩 Chrome Web Store – Profile Tabs Manager](https://chrome.google.com/webstore/detail/profile-tabs-manager/)

### 4. Use It

With the server and extension running, you can:

- Switch and manage Chrome profiles
- Save open pages offline as `.mhtml`
- View or delete saved pages
- Set a custom save folder for pages

---

## 👨‍💻 Developer Instructions

### Prerequisites

- Node.js (v18+ recommended)
- npm
- Git
- Google Chrome (with user profiles)
- SQLite3

### Installation

```bash
git clone https://github.com/LiveProger/profile-tabs-manager.git
cd profile-tabs-manager
npm install
