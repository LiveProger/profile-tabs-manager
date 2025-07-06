# Сервер для расширения Profile and Tabs Manager

Это серверная часть расширения [Profile Tabs Manager для Chrome](https://chrome.google.com/webstore/detail/profile-tabs-manager/), которое позволяет управлять профилями Chrome, просматривать вкладки и сохранять страницы офлайн в формате `.mhtml`.

Без запущенного сервера расширение работать не будет.

---

## 🚀 Быстрый старт (для пользователей)

### 1. Скачайте сервер

👉 [📦 Скачать с GitHub Releases](https://github.com/LiveProger/profile-tabs-manager/releases/tag/reliz)

Скачайте `.exe` — установка не требуется.

### 2. Запустите сервер

Просто откройте `.exe` файл. Сервер автоматически запустится на порту `3000`. Конфигурация не требуется.

### 3. Установите расширение

👉 [🧩 Chrome Web Store – Profile Tabs Manager](https://chrome.google.com/webstore/detail/profile-tabs-manager/)

### 4. Использование

Когда сервер и расширение активны, вы можете:

- Переключаться между профилями Chrome
- Сохранять страницы в формате `.mhtml` для офлайн-доступа
- Просматривать и удалять сохранённые страницы
- Указывать собственную папку для сохранения

---

## 👨‍💻 Инструкция для разработчиков

### Требования

- Node.js (рекомендуется версия 18+)
- npm
- Git
- Google Chrome с включёнными профилями
- SQLite3

### Установка

```bash
git clone https://github.com/LiveProger/profile-tabs-manager.git
cd profile-tabs-manager
npm install
```

Создайте `.env` файл:

```bash
echo "PORT=3000" > .env
```

Запустите сервер:

```bash
npm start
```

### Сборка `.exe`

Установите `pkg`:

```bash
npm install --save-dev pkg
```

Соберите исполняемый файл:

```bash
npm run build
```

Скомпилированный файл появится в папке `dist/`.

### Команды

- `npm start` — запуск сервера
- `npm run dev` — запуск с авто-перезапуском (через nodemon)
- `npm run build` — сборка `.exe`

### Структура проекта

- `server.js` — основная логика сервера
- `SavedPages/` — папка для сохранённых страниц
- `profiles.db` — база данных SQLite
- `com.example.chrome_profile_host.json` — конфигурация native messaging для Chrome
