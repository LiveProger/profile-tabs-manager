Profile Tabs Manager
A Node.js server for managing Chrome profiles and tabs, designed as a native messaging host for a Chrome extension. This project supports profile switching, tab management, and saving pages as MHTML files.
Features

Manage Chrome profiles and their associated tabs.
Save and retrieve web pages as MHTML files.
Native messaging support for Chrome extension communication.
Environment variable configuration for port and other settings.
Build system for creating a distributable executable.

Prerequisites

Node.js: Version 18 or higher (LTS versions like v18.x.x or v20.x.x recommended).
npm: Version 8 or higher.
Google Chrome: Installed and configured with user profiles.
SQLite3: Used for database storage.
Git: For cloning the repository.

Installation

Clone the Repository:
git clone https://github.com/your-username/profile-tabs-manager.git
cd profile-tabs-manager


Install Dependencies:
npm install


Set Up Environment Variables:Create a .env file in the project root with the following content:
PORT=3000

Modify the PORT value as needed.

Configure Chrome Native Messaging:

Place the com.example.chrome_profile_host.json file in the appropriate directory:
Windows: C:\Users\<YourUsername>\AppData\Local\Google\Chrome\User Data\NativeMessagingHosts
macOS: ~/Library/Application Support/Google/Chrome/NativeMessagingHosts
Linux: ~/.config/google-chrome/NativeMessagingHosts


Ensure the path in com.example.chrome_profile_host.json points to node.exe (for development) or the compiled binary (after building, e.g., dist/profile-tabs-manager.exe).
Update the allowed_origins field to match your Chrome extension's ID.


Run the Server in Development Mode:
npm start

The server will run on the port specified in .env (default: 3000).


Build Instructions
To create a distributable executable:

Install pkg:Ensure pkg is installed as a dev dependency:
npm install --save-dev pkg


Check Node.js Version:Verify your Node.js version for compatibility:
node -v

If using Node.js v19.x.x, the build script uses node18-win-x64, which is compatible. For better stability, consider upgrading to an LTS version (v18 or v20).

Build the Executable:Run the build script to compile server.js into a standalone executable:
npm run build

This generates an executable in the dist/ directory (e.g., dist/profile-tabs-manager.exe for Windows). The script uses --targets node18-win-x64, as node19 is not directly supported by pkg.

Update Native Messaging Configuration:Modify com.example.chrome_profile_host.json to point to the compiled executable:
"path": "C:\\Users\\<YourUsername>\\Desktop\\profile-tabs-manager\\dist\\profile-tabs-manager.exe"


Test the Executable:Run the compiled executable:
.\dist\profile-tabs-manager.exe --native-messaging



Development Setup
For development with hot-reloading, use nodemon:

Install nodemon:
npm install --save-dev nodemon


Run with Hot-Reloading:
npm run dev

This starts the server and restarts it automatically on code changes.


Project Structure

server.js: Main server application with Express and SQLite3 integration.
com.example.chrome_profile_host.json: Chrome native messaging host configuration.
.env: Environment variables (e.g., PORT).
profiles.db: SQLite database for storing profiles and tabs (created automatically).
SavedPages/: Directory for storing MHTML files.
.gitignore: Ignores node_modules, .env, and other unnecessary files.
package.json: Project metadata and scripts.
dist/: Output directory for compiled executables.

Scripts

npm start: Runs the server in production mode (node server.js).
npm run dev: Runs the server with nodemon for development.
npm run build: Compiles the server into an executable using pkg for node18-win-x64.

Dependencies

express: Web framework for handling HTTP requests.
sqlite3: Database for storing profile and tab information.
uuid: Generates unique IDs for profiles.
dotenv: Loads environment variables from .env.

Dev Dependencies

pkg: Compiles Node.js projects into executables.
nodemon: Provides hot-reloading for development.

Notes

The .env file is ignored by .gitignore to prevent sensitive data from being committed.
Ensure Chrome is installed and accessible at the paths specified in server.js.
The server caches profile information for 5 minutes. Use the forceRefresh=true query parameter in the /profiles endpoint to bypass the cache.
MHTML files are stored in the SavedPages/ directory and linked to tabs in the database.
The build uses --targets node18-win-x64, as pkg does not directly support node19. This is compatible with Node.js v19.x.x, but upgrading to an LTS version (v18 or v20) is recommended.

Troubleshooting

Database Errors: Ensure profiles.db is writable and not corrupted.
Chrome Not Found: Verify the chromePath in server.js matches your Chrome installation.
Port Conflicts: Change the PORT in .env if 3000 is in use.
Native Messaging Issues: Confirm the extension ID in com.example.chrome_profile_host.json matches your Chrome extension.
Build Errors:
Check your Node.js version (node -v) and ensure compatibility with pkg.
If native module errors occur (e.g., sqlite3), run:npm rebuild sqlite3


For debugging, use:npx pkg server.js --targets node18-win-x64 --output dist/profile-tabs-manager --debug





For further assistance, refer to the Chrome Native Messaging documentation.