const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { spawn } = require("child_process");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json({ limit: "50mb" }));

const chromeUserDataPath =
  process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "User Data")
    : path.join(
        process.env.HOME,
        "Library",
        "Application Support",
        "Google",
        "Chrome"
      );
const chromePath =
  process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "/usr/bin/google-chrome";

let profileInfoCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000;

const dbPath = path.resolve("profiles.db");
console.log(`Creating database at: ${dbPath}`);
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Database connection error:", err);
    process.exit(1);
  }
  console.log("Connected to SQLite database in project directory.");
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
    console.log("Using cached profile info:", Object.keys(profileInfoCache));
    return profileInfoCache;
  }

  try {
    const localStatePath = path.join(chromeUserDataPath, "Local State");
    console.log("Reading Local State from:", localStatePath);
    let infoCache = {};
    try {
      const data = await fs.readFile(localStatePath, "utf-8");
      const localState = JSON.parse(data);
      infoCache = localState.profile?.info_cache || {};
      console.log("Local State info_cache:", Object.keys(infoCache));
    } catch (error) {
      console.warn(
        "Local State not accessible, using fallback profiles:",
        error.message
      );
      infoCache = {
        Default: { name: "Илюха", user_email: "unknown" },
        "Profile 10": { name: "Илья", user_email: "unknown" },
        "Profile 9": { name: "Виктор", user_email: "102635353102452593383" },
        "Profile 11": { name: "test", user_email: "unknown" },
      };
    }

    const existingProfiles = await new Promise((resolve, reject) => {
      db.all("SELECT profileId, profileDir FROM Profiles", [], (err, rows) => {
        if (err) reject(err);
        else {
          console.log("Existing profiles in DB:", rows);
          resolve(rows);
        }
      });
    });
    const existingProfileDirs = existingProfiles.reduce((acc, p) => {
      acc[p.profileDir] = p.profileId;
      return acc;
    }, {});

    const normalizedCache = {};
    for (const [profileDir, value] of Object.entries(infoCache)) {
      const profileDirLower = profileDir.toLowerCase();
      let profileId = existingProfileDirs[profileDirLower];
      if (!profileId) {
        profileId = uuidv4();
        db.run(
          `INSERT OR IGNORE INTO Profiles (profileId, profileName, profileDir, userId) VALUES (?, ?, ?, ?)`,
          [
            profileId,
            value.name || `Profile ${profileDir}`,
            profileDirLower,
            value.gaia_id || value.user_id || value.user_email || "unknown",
          ],
          (err) => {
            if (err) console.error(`Error adding profile ${profileDir}:`, err);
            else
              console.log(
                `Added profile ${profileDir} to database with profileId ${profileId}`
              );
          }
        );
      }
      normalizedCache[profileDirLower] = {
        profileId,
        name: value.name || `Profile ${profileDir}`,
        profileDir: profileDirLower,
        userId: value.gaia_id || value.user_id || value.user_email || "unknown",
        email: value.user_email || "unknown",
      };
      console.log(
        `Profile found: ${profileDir} -> Name: ${
          value.name
        }, ProfileId: ${profileId}, UserId: ${
          value.gaia_id || value.user_id || value.user_email
        }, Email: ${value.user_email}`
      );
    }

    profileInfoCache = normalizedCache;
    lastCacheTime = now;
    console.log(
      "Normalized profile info cache:",
      Object.keys(profileInfoCache)
    );
    return profileInfoCache;
  } catch (error) {
    console.error("Error reading Local State:", error.message);
    return profileInfoCache || {};
  }
}

app.get("/profile-name", async (req, res) => {
  try {
    const profileId = req.query.profileId?.toLowerCase();
    if (!profileId) {
      return res.status(400).json({ error: "Missing profileId" });
    }
    const profileNames = await getProfileNames();
    const profile = Object.values(profileNames).find(
      (p) => p.profileId === profileId
    );
    const profileName = profile?.name || "Unknown Profile";
    console.log(
      `Returning profile name for profileId ${profileId}: ${profileName}`
    );
    res.json({ profileName });
  } catch (error) {
    console.error("Error in /profile-name:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/profiles", async (req, res) => {
  if (req.query.forceRefresh === "true") {
    profileInfoCache = null;
    lastCacheTime = 0;
    console.log("Cache cleared due to forceRefresh");
  }
  const profileNames = await getProfileNames();
  const currentProfileId = req.query.currentProfileId?.toLowerCase();
  console.log(
    "Received currentProfileId:",
    currentProfileId,
    "Available profiles:",
    Object.keys(profileNames)
  );

  db.all("SELECT * FROM Profiles", [], (err, profiles) => {
    if (err) {
      console.error("Error fetching profiles from database:", err);
      return res.status(500).json({ error: err.message });
    }
    console.log("Profiles from database:", profiles);

    const enrichedProfiles = profiles.map((profile) => ({
      ...profile,
      profileName:
        profileNames[profile.profileDir]?.name ||
        profile.profileName ||
        `Profile ${profile.profileDir}`,
      isCurrent:
        currentProfileId && profile.profileId.toLowerCase() === currentProfileId
          ? true
          : false,
      tabs: [],
    }));

    db.all(
      "SELECT tabId AS id, profileId, title, url FROM Tabs",
      [],
      async (err, tabs) => {
        if (err) {
          console.error("Error fetching tabs:", err);
          return res.status(500).json({ error: err.message });
        }
        console.log("Tabs from database:", tabs);

        db.all("SELECT * FROM SavedPages", [], async (err, savedPages) => {
          if (err) {
            console.error("Error fetching saved pages:", err);
            return res.status(500).json({ error: err.message });
          }

          // Фильтруем savedPages, оставляя только записи с существующими файлами
          const validSavedPages = [];
          for (const page of savedPages) {
            try {
              const filePath = page.filePath.replace("file://", "");
              await fs.access(filePath);
              validSavedPages.push(page);
            } catch (error) {
              if (error.code === "ENOENT") {
                console.warn(
                  `File not found for saved page id ${page.id}: ${page.filePath}`
                );
                // Удаляем запись из базы данных
                db.run(
                  "DELETE FROM SavedPages WHERE id = ?",
                  [page.id],
                  (err) => {
                    if (err) {
                      console.error(
                        `Error deleting stale saved page ${page.id}:`,
                        err
                      );
                    } else {
                      console.log(
                        `Deleted stale saved page with id ${page.id}`
                      );
                    }
                  }
                );
              } else {
                console.error(
                  `Error checking file for page id ${page.id}:`,
                  error
                );
              }
            }
          }
          console.log("Valid saved pages:", validSavedPages);

          enrichedProfiles.forEach((profile) => {
            profile.tabs = tabs
              .filter(
                (tab) =>
                  tab.profileId.toLowerCase() ===
                  profile.profileId.toLowerCase()
              )
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
          console.log(
            "Returning enriched profiles:",
            JSON.stringify(enrichedProfiles, null, 2)
          );
          res.json(enrichedProfiles);
        });
      }
    );
  });
});

app.post("/profiles", (req, res) => {
  const { profileId, profileName, userId, tabs } = req.body;
  console.log("Received profile update:", {
    profileId,
    profileName,
    tabs: tabs ? tabs.length : 0,
  });
  console.log("Tabs data:", JSON.stringify(tabs, null, 2));

  if (!profileId || !profileName) {
    console.error("Missing profileId or profileName:", {
      profileId,
      profileName,
    });
    return res.status(400).json({ error: "Missing profileId or profileName" });
  }

  db.run(
    `INSERT OR REPLACE INTO Profiles (profileId, profileName, profileDir, userId) VALUES (?, ?, ?, ?)`,
    [
      profileId.toLowerCase(),
      profileName,
      profileName === "Unknown Profile" ? "default" : profileName.toLowerCase(),
      userId || profileId,
    ],
    (err) => {
      if (err) {
        console.error("Error updating profile:", err);
        return res.status(500).json({ error: err.message });
      }
      console.log("Updated profile:", profileId);

      db.run(
        `DELETE FROM Tabs WHERE profileId = ?`,
        [profileId.toLowerCase()],
        (err) => {
          if (err) {
            console.error("Error deleting tabs:", err);
            return res.status(500).json({ error: err.message });
          }
          console.log("Deleted tabs for profileId:", profileId);

          if (tabs && tabs.length > 0) {
            const validTabs = tabs.filter(
              (tab) =>
                tab.id &&
                tab.title &&
                tab.url &&
                !tab.url.startsWith("chrome://") &&
                !tab.url.startsWith("file://") &&
                !tab.url.startsWith("chrome-extension://")
            );
            if (validTabs.length === 0) {
              console.log(`No valid tabs to insert for profileId ${profileId}`);
              return res.json({ status: "success" });
            }

            // Проверяем существующие tabId для избежания дубликатов
            db.all(
              `SELECT tabId FROM Tabs WHERE profileId = ?`,
              [profileId.toLowerCase()],
              (err, existingTabs) => {
                if (err) {
                  console.error("Error checking existing tabs:", err);
                  return res.status(500).json({ error: err.message });
                }
                const existingTabIds = new Set(
                  existingTabs.map((t) => t.tabId)
                );
                const uniqueTabs = validTabs.filter(
                  (tab) => !existingTabIds.has(tab.id)
                );
                console.log("Unique tabs to insert:", uniqueTabs);

                if (uniqueTabs.length === 0) {
                  console.log(
                    `No unique tabs to insert for profileId ${profileId}`
                  );
                  return res.json({ status: "success" });
                }

                const placeholders = uniqueTabs
                  .map(() => "(?, ?, ?, ?)")
                  .join(",");
                const values = uniqueTabs.flatMap((tab) => [
                  tab.id,
                  profileId.toLowerCase(),
                  tab.title,
                  tab.url,
                ]);
                console.log("Inserting tabs:", values);
                db.run(
                  `INSERT OR IGNORE INTO Tabs (tabId, profileId, title, url) VALUES ${placeholders}`,
                  values,
                  (err) => {
                    if (err) {
                      console.error("Error inserting tabs:", err);
                      return res.status(500).json({ error: err.message });
                    }
                    console.log(
                      `Inserted ${uniqueTabs.length} tabs for profileId ${profileId}`
                    );
                    res.json({ status: "success" });
                  }
                );
              }
            );
          } else {
            console.log(`No tabs to insert for profileId ${profileId}`);
            res.json({ status: "success" });
          }
        }
      );
    }
  );
});

app.post("/save-page", async (req, res) => {
  const { url, title, mhtmlData, profileId } = req.body;
  if (!url || !title || !mhtmlData || !profileId) {
    console.error("Missing required fields:", {
      url,
      title,
      mhtmlData,
      profileId,
    });
    return res.status(400).json({ error: "Missing required fields" });
  }

  const fileName = `saved_page_${Date.now()}.mhtml`;
  const filePath = path.join(__dirname, "SavedPages", fileName);

  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(mhtmlData, "base64"));

    db.run(
      `INSERT INTO SavedPages (url, fileName, timestamp, title, filePath) VALUES (?, ?, ?, ?, ?)`,
      [
        url,
        fileName,
        new Date().toISOString(),
        title,
        `file://${filePath.replace(/\\/g, "/")}`,
      ],
      function (err) {
        if (err) {
          console.error("Error saving page to database:", err);
          return res
            .status(500)
            .json({ error: `Database error: ${err.message}` });
        }
        console.log(`Saved page: ${fileName}`);
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
    console.error("Error saving page file:", error.message);
    res
      .status(500)
      .json({ error: `Failed to save page file: ${error.message}` });
  }
});

app.get("/saved-pages", async (req, res) => {
  db.all("SELECT * FROM SavedPages", [], async (err, pages) => {
    if (err) {
      console.error("Error fetching saved pages:", err);
      return res.status(500).json({ error: err.message });
    }

    // Фильтруем страницы, проверяя существование файлов
    const validPages = [];
    for (const page of pages) {
      try {
        const filePath = page.filePath.replace("file://", "");
        await fs.access(filePath);
        validPages.push(page);
      } catch (error) {
        if (error.code === "ENOENT") {
          console.warn(
            `File not found for saved page id ${page.id}: ${page.filePath}`
          );
          // Можно также удалить запись из базы данных
          db.run("DELETE FROM SavedPages WHERE id = ?", [page.id], (err) => {
            if (err) {
              console.error(`Error deleting stale saved page ${page.id}:`, err);
            } else {
              console.log(`Deleted stale saved page with id ${page.id}`);
            }
          });
        } else {
          console.error(`Error checking file for page id ${page.id}:`, error);
        }
      }
    }

    console.log("Returning valid saved pages:", validPages);
    res.json(validPages);
  });
});

app.delete("/saved-page", (req, res) => {
  const { url, id } = req.body;
  if (!url || !id) {
    console.error("Missing url or id");
    return res.status(400).json({ error: "Missing url or id" });
  }

  db.get(
    "SELECT filePath FROM SavedPages WHERE id = ?",
    [id],
    async (err, row) => {
      if (err) {
        console.error("Error fetching filePath:", err);
        return res.status(500).json({ error: err.message });
      }
      if (!row) {
        console.error("Page not found:", id);
        return res.status(404).json({ error: "Page not found" });
      }

      const filePath = row.filePath.replace("file://", "");
      try {
        // Проверяем существование файла
        await fs.access(filePath);
        // Если файл существует, удаляем его
        await fs.unlink(filePath);
        console.log(`Deleted file: ${filePath}`);
      } catch (error) {
        if (error.code === "ENOENT") {
          console.warn(`File not found, skipping deletion: ${filePath}`);
        } else {
          console.error("Error checking or deleting file:", error);
          return res
            .status(500)
            .json({ error: `Failed to delete file: ${error.message}` });
        }
      }

      // Удаляем запись из базы данных
      db.run("DELETE FROM SavedPages WHERE id = ?", [id], (err) => {
        if (err) {
          console.error("Error deleting page from database:", err);
          return res.status(500).json({ error: err.message });
        }
        console.log(`Deleted saved page with id ${id} from database`);
        res.json({ success: true });
      });
    }
  );
});

if (process.argv.includes("--native-messaging")) {
  console.log("Starting in native messaging mode");
  process.stdin.on("readable", () => {
    const lengthBytes = process.stdin.read(4);
    if (!lengthBytes) return;

    const length = lengthBytes.readUInt32LE(0);
    const message = process.stdin.read(length);
    if (!message) return;

    try {
      const parsedMessage = JSON.parse(message.toString());
      const { url, profileId } = parsedMessage;

      if (!url || !profileId) {
        console.error("Missing url or profileId:", parsedMessage);
        process.stdout.write(
          Buffer.from(JSON.stringify({ error: "Missing url or profileId" }))
        );
        return;
      }

      console.log("Received native message:", parsedMessage);
      db.get(
        "SELECT profileDir FROM Profiles WHERE profileId = ?",
        [profileId.toLowerCase()],
        (err, row) => {
          if (err) {
            console.error("Error fetching profileDir:", err);
            process.stdout.write(
              Buffer.from(JSON.stringify({ error: err.message }))
            );
            return;
          }
          const profileDir = row?.profileDir || "Default";
          console.log(`Opening URL ${url} in profileDir ${profileDir}`);

          fs.access(chromePath, fs.constants.X_OK)
            .then(() => {
              console.log("Spawning Chrome with args:", [
                `--profile-directory=${profileDir}`,
                url,
                "--new-window",
              ]);
              const chromeProcess = spawn(chromePath, [
                `--profile-directory=${profileDir}`,
                url,
                "--new-window",
              ]);

              chromeProcess.on("error", (err) => {
                console.error("Error spawning Chrome:", err);
                process.stdout.write(
                  Buffer.from(JSON.stringify({ error: err.message }))
                );
              });

              chromeProcess.on("exit", (code) => {
                console.log(`Chrome process exited with code ${code}`);
                process.stdout.write(
                  Buffer.from(JSON.stringify({ success: true }))
                );
              });
            })
            .catch((err) => {
              console.error(
                `Chrome executable not found at ${chromePath}:`,
                err
              );
              process.stdout.write(
                Buffer.from(
                  JSON.stringify({
                    error: `Chrome executable not found: ${err.message}`,
                  })
                )
              );
            });
        }
      );
    } catch (error) {
      console.error("Error parsing Native Message:", error);
      process.stdout.write(
        Buffer.from(JSON.stringify({ error: error.message }))
      );
    }
  });
} else {
  app.listen(3000, () =>
    console.log("Server running on http://localhost:3000")
  );
}
