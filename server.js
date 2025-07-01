const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { spawn } = require("child_process");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config(); // Загрузка переменных окружения

const app = express();
app.use(express.json({ limit: "50mb" }));

const chromeUserDataPath =
  process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "User Data")
    : path.join(process.env.HOME, "Library", "Application Support", "Google", "Chrome");
const chromePath =
  process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "/usr/bin/google-chrome";

let profileInfoCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000;

const db = new sqlite3.Database("profiles.db", (err) => {
  if (err) {
    console.error("Ошибка подключения к базе данных:", err);
    process.exit(1);
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS Profiles (
      profileId TEXT PRIMARY KEY,
      profileName TEXT NOT NULL,
      profileDir TEXT UNIQUE,
      userId TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS Tabs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profileId TEXT,
      tabId INTEGER NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      FOREIGN KEY (profileId) REFERENCES Profiles(profileId),
      UNIQUE(profileId, tabId)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS SavedPages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      fileName TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      title TEXT NOT NULL,
      filePath TEXT
    )
  `);
});

async function getProfileNames() {
  const now = Date.now();
  if (profileInfoCache && now - lastCacheTime < CACHE_DURATION) {
    return profileInfoCache;
  }

  try {
    const localStatePath = path.join(chromeUserDataPath, "Local State");
    let infoCache = {};
    try {
      const data = await fs.readFile(localStatePath, "utf-8");
      infoCache = JSON.parse(data).profile?.info_cache || {};
    } catch {
      infoCache = {
        Default: { name: "Илюха", user_email: "unknown" },
        "Profile 10": { name: "Илья", user_email: "unknown" },
        "Profile 9": { name: "Виктор", user_email: "102635353102452593383" },
        "Profile 11": { name: "test", user_email: "unknown" },
      };
    }

    const existingProfiles = await new Promise((resolve, reject) => {
      db.all("SELECT profileId, profileDir FROM Profiles", (err, rows) => {
        err ? reject(err) : resolve(rows);
      });
    });
    const existingProfileDirs = existingProfiles.reduce((acc, p) => {
      acc[p.profileDir] = p.profileId;
      return acc;
    }, {});

    const normalizedCache = {};
    for (const [profileDir, value] of Object.entries(infoCache)) {
      const profileDirLower = profileDir.toLowerCase();
      let profileId = existingProfileDirs[profileDirLower] || uuidv4();
      db.run(
        `INSERT OR IGNORE INTO Profiles (profileId, profileName, profileDir, userId) VALUES (?, ?, ?, ?)`,
        [profileId, value.name || `Profile ${profileDir}`, profileDirLower, value.user_email || "unknown"],
        (err) => {
          if (err) console.error(`Ошибка добавления профиля ${profileDir}:`, err);
        }
      );
      normalizedCache[profileDirLower] = {
        profileId,
        name: value.name || `Profile ${profileDir}`,
        profileDir: profileDirLower,
        userId: value.user_email || "unknown",
      };
    }

    const profiles = await new Promise((resolve, reject) => {
      db.all("SELECT profileId, profileDir FROM Profiles", (err, rows) => {
        err ? reject(err) : resolve(rows);
      });
    });
    const seenProfileDirs = new Set();
    for (const profile of profiles) {
      if (seenProfileDirs.has(profile.profileDir)) {
        console.log(`Удаление дублирующего профиля: ${profile.profileId} для profileDir: ${profile.profileDir}`);
        await new Promise((resolve, reject) => {
          db.run("DELETE FROM Profiles WHERE profileId = ?", [profile.profileId], (err) => {
            err ? reject(err) : resolve();
          });
        });
        await new Promise((resolve, reject) => {
          db.run("DELETE FROM Tabs WHERE profileId = ?", [profile.profileId], (err) => {
            err ? reject(err) : resolve();
          });
        });
      } else {
        seenProfileDirs.add(profile.profileDir);
      }
    }

    profileInfoCache = normalizedCache;
    lastCacheTime = now;
    console.log("Обновлён кэш профилей с", Object.keys(normalizedCache).length, "профилями");
    return profileInfoCache;
  } catch (error) {
    console.error("Ошибка чтения Local State:", error.message);
    return profileInfoCache || {};
  }
}

app.get("/profile-name", async (req, res) => {
  try {
    const profileId = req.query.profileId?.toLowerCase();
    if (!profileId) return res.status(400).json({ error: "Отсутствует profileId" });
    const profileNames = await getProfileNames();
    const profile = Object.values(profileNames).find((p) => p.profileId === profileId);
    res.json({ profileName: profile?.name || "Неизвестный профиль" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/profiles", async (req, res) => {
  if (req.query.forceRefresh === "true") {
    profileInfoCache = null;
    lastCacheTime = 0;
  }
  const profileNames = await getProfileNames();
  const currentProfileId = req.query.currentProfileId?.toLowerCase();

  db.all("SELECT * FROM Profiles", async (err, profiles) => {
    if (err) return res.status(500).json({ error: err.message });
    const enrichedProfiles = profiles.map((profile) => ({
      ...profile,
      profileName: profileNames[profile.profileDir]?.name || profile.profileName,
      isCurrent: currentProfileId && profile.profileId.toLowerCase() === currentProfileId,
      tabs: [],
    }));

    db.all("SELECT tabId AS id, profileId, title, url FROM Tabs", async (err, tabs) => {
      if (err) return res.status(500).json({ error: err.message });
      const savedPages = await new Promise((resolve, reject) => {
        db.all("SELECT * FROM SavedPages", (err, pages) => {
          err ? reject(err) : resolve(pages);
        });
      });
      const validSavedPages = [];
      for (const page of savedPages) {
        try {
          await fs.access(page.filePath.replace("file://", ""));
          validSavedPages.push(page);
        } catch (error) {
          if (error.code === "ENOENT") {
            db.run("DELETE FROM SavedPages WHERE id = ?", [page.id]);
          }
        }
      }

      enrichedProfiles.forEach((profile) => {
        profile.tabs = tabs
          .filter((tab) => tab.profileId.toLowerCase() === profile.profileId.toLowerCase())
          .map((tab) => ({
            ...tab,
            savedVersions: validSavedPages
              .filter((page) => page.url === tab.url)
              .map((page) => ({
                id: page.id,
                fileName: page.fileName,
                timestamp: page.timestamp,
                title: page.title,
                filePath: page.filePath,
              })),
          }));
      });
      res.json(enrichedProfiles);
    });
  });
});

app.post("/profiles", async (req, res) => {
  const { profileId, profileName, tabs } = req.body;
  if (!profileId || !profileName) {
    return res.status(400).json({ error: "Отсутствует profileId или profileName" });
  }

  const profileNames = await getProfileNames();
  const profile = Object.values(profileNames).find((p) => p.profileId === profileId.toLowerCase());
  const profileDir = profile?.profileDir || profileName.toLowerCase();

  db.run(
    `INSERT OR REPLACE INTO Profiles (profileId, profileName, profileDir, userId) VALUES (?, ?, ?, ?)`,
    [profileId.toLowerCase(), profileName, profileDir, profileId.toLowerCase()],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.run(`DELETE FROM Tabs WHERE profileId = ?`, [profileId.toLowerCase()], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!tabs || tabs.length === 0) return res.json({ status: "success" });

        const validTabs = tabs.filter(
          (tab) =>
            tab.id &&
            tab.title &&
            tab.url &&
            !tab.url.startsWith("chrome://") &&
            !tab.url.startsWith("file://") &&
            !tab.url.startsWith("chrome-extension://")
        );
        if (validTabs.length === 0) return res.json({ status: "success" });

        const placeholders = validTabs.map(() => "(?, ?, ?, ?)").join(",");
        const values = validTabs.flatMap((tab) => [tab.id, profileId.toLowerCase(), tab.title, tab.url]);
        db.run(
          `INSERT OR IGNORE INTO Tabs (tabId, profileId, title, url) VALUES ${placeholders}`,
          values,
          (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ status: "success" });
          }
        );
      });
    }
  );
});

app.delete("/profile", async (req, res) => {
  const { profileId } = req.body;
  if (!profileId) return res.status(400).json({ error: "Отсутствует profileId" });

  try {
    const profile = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM Profiles WHERE profileId = ?", [profileId.toLowerCase()], (err, row) => {
        err ? reject(err) : resolve(row);
      });
    });

    if (!profile) {
      return res.status(404).json({ error: "Профиль не найден" });
    }

    const tabs = await new Promise((resolve, reject) => {
      db.all("SELECT url FROM Tabs WHERE profileId = ?", [profileId.toLowerCase()], (err, rows) => {
        err ? reject(err) : resolve(rows);
      });
    });

    const savedPages = await new Promise((resolve, reject) => {
      db.all("SELECT id, filePath FROM SavedPages WHERE url IN (SELECT url FROM Tabs WHERE profileId = ?)", 
        [profileId.toLowerCase()], (err, rows) => {
          err ? reject(err) : resolve(rows);
        });
    });

    for (const page of savedPages) {
      try {
        const filePath = page.filePath.replace("file://", "");
        await fs.access(filePath);
        await fs.unlink(filePath);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error(`Не удалось удалить файл ${page.filePath}:`, error.message);
        }
      }
    }

    await new Promise((resolve, reject) => {
      db.run("DELETE FROM SavedPages WHERE url IN (SELECT url FROM Tabs WHERE profileId = ?)", 
        [profileId.toLowerCase()], (err) => {
          err ? reject(err) : resolve();
        });
    });

    await new Promise((resolve, reject) => {
      db.run("DELETE FROM Tabs WHERE profileId = ?", [profileId.toLowerCase()], (err) => {
        err ? reject(err) : resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run("DELETE FROM Profiles WHERE profileId = ?", [profileId.toLowerCase()], (err) => {
        err ? reject(err) : resolve();
      });
    });

    profileInfoCache = null;
    lastCacheTime = 0;

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/save-page", async (req, res) => {
  const { url, title, mhtmlData, profileId } = req.body;
  if (!url || !title || !mhtmlData || !profileId) {
    return res.status(400).json({ error: "Отсутствуют обязательные поля" });
  }

  const fileName = `saved_page_${Date.now()}.mhtml`;
  const filePath = path.join(__dirname, "SavedPages", fileName);

  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(mhtmlData, "base64"));
    db.run(
      `INSERT INTO SavedPages (url, fileName, timestamp, title, filePath) VALUES (?, ?, ?, ?, ?)`,
      [url, fileName, new Date().toISOString(), title, `file://${filePath.replace(/\\/g, "/")}`],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({
          id: this.lastID,
          fileName,
          timestamp: new Date().toISOString(),
          title,
          filePath: `file://${filePath.replace(/\\/g, "/")}`,
          success: true,
        });
      }
    );
  } catch (error) {
    res.status(500).json({ error: `Не удалось сохранить страницу: ${error.message}` });
  }
});

app.get("/saved-pages", async (req, res) => {
  db.all("SELECT * FROM SavedPages", async (err, pages) => {
    if (err) return res.status(500).json({ error: err.message });
    const validPages = [];
    for (const page of pages) {
      try {
        await fs.access(page.filePath.replace("file://", ""));
        validPages.push(page);
      } catch (error) {
        if (error.code === "ENOENT") {
          db.run("DELETE FROM SavedPages WHERE id = ?", [page.id]);
        }
      }
    }
    res.json(validPages);
  });
});

app.delete("/saved-page", async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "Отсутствует id" });

  db.get("SELECT filePath FROM SavedPages WHERE id = ?", [id], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Страница не найдена" });

    try {
      const filePath = row.filePath.replace("file://", "");
      await fs.access(filePath);
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        return res.status(500).json({ error: `Не удалось удалить файл: ${error.message}` });
      }
    }

    db.run("DELETE FROM SavedPages WHERE id = ?", [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

if (process.argv.includes("--native-messaging")) {
  process.stdin.on("readable", () => {
    const lengthBytes = process.stdin.read(4);
    if (!lengthBytes) return;

    const length = lengthBytes.readUInt32LE(0);
    const message = process.stdin.read(length);
    if (!message) return;

    try {
      const { url, profileId } = JSON.parse(message.toString());
      if (!url || !profileId) {
        process.stdout.write(Buffer.from(JSON.stringify({ error: "Отсутствует url или profileId" })));
        return;
      }

      db.get("SELECT profileDir FROM Profiles WHERE profileId = ?", [profileId.toLowerCase()], (err, row) => {
        if (err) {
          process.stdout.write(Buffer.from(JSON.stringify({ error: err.message })));
          return;
        }
        const profileDir = row?.profileDir || "Default";
        fs.access(chromePath, fs.constants.X_OK)
          .then(() => {
            const chromeProcess = spawn(chromePath, [`--profile-directory=${profileDir}`, url, "--new-window"]);
            chromeProcess.on("error", (err) => {
              process.stdout.write(Buffer.from(JSON.stringify({ error: err.message })));
            });
            chromeProcess.on("exit", () => {
              process.stdout.write(Buffer.from(JSON.stringify({ success: true })));
            });
          })
          .catch((err) => {
            process.stdout.write(
              Buffer.from(JSON.stringify({ error: `Исполняемый файл Chrome не найден: ${err.message}` }))
            );
          });
      });
    } catch (error) {
      process.stdout.write(Buffer.from(JSON.stringify({ error: error.message })));
    }
  });
} else {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
  });
}