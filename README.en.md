# Profile and Tabs Manager – Server Component

This is the backend server for the [Profile Tabs Manager Chrome Extension](https://chrome.google.com/webstore/detail/profile-tabs-manager/), which allows you to manage Chrome profiles, view tabs, and save pages as `.mhtml` files offline.

This server is required to use the extension.

---

## 🚀 Quick Start (For Users)

### 1. Download the Server

👉 [📦 GitHub Releases](https://github.com/LiveProger/profile-tabs-manager/releases/tag/reliz1.0.1)

Download the `.exe` file — no installation is required.

### 2. Launch the Server

Run the `.exe` file. It will start a local server on port `3000`. No terminal or configuration needed.

### 3. Install the Extension

👉 [🧩 Chrome Web Store – Profile Tabs Manager](https://chrome.google.com/webstore/detail/profile-tabs-manager/)

### 4. Use It

Once the extension and server are running, you can:

- Switch and manage Chrome profiles
- Save pages offline as `.mhtml` files
- View and delete saved pages
- Set a custom folder for saved pages

---

## 👨‍💻 Developer Guide

### Prerequisites

- Node.js (v18 or higher recommended)
- npm
- Git
- Google Chrome with profiles enabled
- SQLite3

### Installation

```bash
git clone https://github.com/LiveProger/profile-tabs-manager.git
cd profile-tabs-manager
npm install
```

Create `.env` file:

```bash
echo "PORT=3000" > .env
```

Run the server:

```bash
npm start
```

### Build Executable

Install `pkg`:

```bash
npm install --save-dev pkg
```

Build the executable:

```bash
npm run build
```

The output will be in the `dist/` folder.

### Scripts

- `npm start` – run the server
- `npm run dev` – run with hot-reload (nodemon)
- `npm run build` – compile into `.exe`

### Project Structure

- `server.js` – main server logic
- `SavedPages/` – folder where saved pages are stored
- `profiles.db` – SQLite database file
- `com.example.chrome_profile_host.json` – native messaging config for Chrome
