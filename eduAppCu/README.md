# ДуАТОМ

Учебный демонстрационный проект в визуальном стиле Росатома. Не является официальным сервисом Госкорпорации «Росатом».

## Текущая версия

- один курс: **Информатика**;
- единый источник курса и заданий: **Python 3 Tutorial — Python Software Foundation**;
- образовательные карточки без логотипа предмета;
- AI-чат через **OpenRouter**;
- одна регистрация на одно браузерное устройство;
- отдельная мобильная компоновка: адаптивный header, bottom navigation, mobile chat, карточки, уроки и auth bottom-sheet;
- PWA-файлы сохранены.

## Запуск frontend

```bash
npm install
npm run dev
```

## Запуск backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
# заполните OPENROUTER_API_KEY и FLASK_SECRET_KEY
.venv/bin/python app.py
```

Подробнее: `backend/README.md`.
