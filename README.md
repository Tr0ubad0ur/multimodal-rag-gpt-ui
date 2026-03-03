<div align="center">
    <a href="https://www.mirea.ru">
      <img src="https://www.mirea.ru/upload/medialibrary/205/yly02h0ioocdeega8ir1kbsstul6q9ws/new_logo.png" width="96" alt="РТУ МИРЭА">
    </a>
    <h1>Diploma</h1>
    <p><i>ИПТИП, Fullstack-разработка, ЭФБО-04-22</i></p>
    <p>
        <a href="https://t.me/Papajunn" target="_blank">Матвей Вишняков</a>
    </p>
</div>

# Multimodal RAG GPT UI

Frontend-клиент для дипломного проекта по мультимодальному поиску и анализу данных (RAG + GPT).

## Что в проекте

- Чат с моделью (`/ask`, `/ask_auth`)
- Регистрация/вход и хранение сессии
- История запросов пользователя
- Загрузка файлов и работа с вложениями
- Knowledge Base: папки, файлы, фильтры по папкам/файлам, drag-and-drop перемещение
- Поддержка RU/EN локализации

## Технологии

- Nuxt 4
- Vue 3
- TypeScript
- Tailwind CSS
- `@nuxtjs/i18n`

## Быстрый старт

```bash
git clone git@github.com:Tr0ubad0ur/multimodal-rag-gpt-ui.git
cd multimodal-rag-gpt-ui/frontend
npm install
npm run dev
```

После запуска UI доступен на `http://localhost:3000`.

## Переменные окружения

Frontend использует API backend через `runtimeConfig.public.apiBase`.

Создайте `frontend/.env`:

```env
NUXT_PUBLIC_API_BASE=http://localhost:8000
```

Если переменная не задана, используется значение по умолчанию: `http://localhost:8000`.

## Скрипты

Выполняются из директории `frontend/`.

```bash
npm run dev      # запуск в режиме разработки
npm run build    # production-сборка
npm run preview  # локальный просмотр production-сборки
```

## Структура репозитория

```text
.
├── frontend/
│   ├── components/
│   ├── composables/
│   ├── pages/
│   ├── i18n/
│   ├── types/
│   ├── assets/
│   ├── nuxt.config.ts
│   └── package.json
└── README.md
```

## Примечания

- Для функций Knowledge Base и загрузки файлов требуется авторизация.
- Если backend недоступен или указан неверный `NUXT_PUBLIC_API_BASE`, UI будет показывать ошибки запросов.
