# Backend ДуАТОМ

Единый backend: Flask API + SQLite + Telegram-бот в одном процессе.

## Что изменено

- В приложении оставлен **один курс — «Информатика»**.
- Все флешкарточки и задания используют **один источник**: официальный **Python 3 Tutorial — Python Software Foundation** (`https://docs.python.org/3/tutorial/`).
- AI-чат работает **только через OpenRouter**. Локальной имитации ответа больше нет.
- Ключ OpenRouter хранится только в backend `.env` в `OPENROUTER_API_KEY` и не отправляется во frontend.
- При регистрации backend привязывает хеш браузерного device-id к созданному пользователю. С одного устройства нельзя зарегистрировать второй аккаунт.

> Ограничение «1 устройство = 1 регистрация» рассчитано на веб-приложение и использует HttpOnly cookie + локальный идентификатор браузера. Полный сброс cookie/данных браузера или другой профиль браузера технически может выглядеть как новое устройство. Для жёсткой аппаратной привязки нужен нативный клиент/MDM/attestation, а не browser fingerprinting.

## Запуск

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
```

В `.env` укажите минимум:

```env
FLASK_SECRET_KEY=replace-with-a-long-random-secret
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=openai/gpt-4.1-mini
DEVICE_ID_PEPPER=replace-with-another-long-random-secret
```

Затем:

```bash
.venv/bin/python app.py
```

Flask API: `http://localhost:5001`.

Во втором терминале из корня проекта:

```bash
npm install
npm run dev
```

## OpenRouter

Endpoint backend использует `https://openrouter.ai/api/v1/chat/completions`. Frontend вызывает только `/api/chat`; секретный ключ остаётся на сервере.

Если `OPENROUTER_API_KEY` отсутствует, `/api/chat` возвращает понятную ошибку конфигурации вместо локального сгенерированного ответа. Неудачный запрос к OpenRouter не расходует дневной лимит сообщений.

## Контент

`content/courses/informatics.json` — единственный файл курса.

`content/questions/informatics.json` — единственный файл заданий.

При старте backend синхронизирует JSON с SQLite и удаляет старые учебные сущности других предметов, поэтому прежняя база также переходит на одно-курсовую модель.

Проверка контента:

```bash
python validate_content.py
```
