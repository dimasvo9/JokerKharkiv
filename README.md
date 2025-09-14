# Joker Online PRO

Полная онлайн-версия карточной игры «Joker»: аккаунты, комнаты, инвайты, приватные столы, лидерборд. Сервер — авторитарный, ход справа-налево, козырь виден весь кон, счёт и журнал.

## Локальный запуск (Windows)
1. Откройте `server/start_windows.bat` (двойной клик).
2. Откроется `http://localhost:8080`. Зарегистрируйтесь/войдите, создайте стол, присоединитесь и играйте.

macOS/Linux:
```bash
cd server
./start_mac_linux.sh
```

## Деплой на Render (Blueprint)
1. Залейте этот проект в публичный GitHub-репозиторий (папки `server/` и `web/` в корень).
2. На **render.com** → **Blueprints** → **New** → укажите ваш репозиторий (файл `render.yaml` уже настроен).
3. В переменных окружения укажите:
   - `JWT_SECRET` — длинный случайный ключ,
   - `APP_ORIGIN` — ваш реальный URL сервиса (после первого деплоя замените `https://example.com`).

> Альтернатива: Web Service вручную: RootDir=server, Build=`npm install`, Start=`node server.js`.

## Переменные окружения
- `JWT_SECRET` — секрет для JWT.
- `APP_ORIGIN` — базовый URL приложения (для генерации ссылок).
- (опционально) `SMTP_URL`, `FROM_EMAIL` — если захотите реальную почту.

## Стек
- Server: Node.js (Express + ws) + SQLite.
- Client: HTML/CSS/JS, одна страница.
- Dockerfile и `render.yaml` прилагаются.

Удачной игры!
