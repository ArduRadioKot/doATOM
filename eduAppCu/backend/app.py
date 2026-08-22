from __future__ import annotations

import json
import os
import random
import sqlite3
import threading
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from secrets import token_urlsafe

from flask import Flask, jsonify, request, session
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent


def load_local_env() -> None:
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


load_local_env()
DB_PATH = Path(os.getenv("DUATOM_DB", BASE_DIR / "data" / "duatom.db"))

app = Flask(__name__)
app.json.ensure_ascii = False
app.secret_key = os.getenv("FLASK_SECRET_KEY", "duatom-dev-change-me")
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv("COOKIE_SECURE", "false").lower() in {"1", "true", "yes"},
)
CORS(app, supports_credentials=True)

CONTENT_DIR = BASE_DIR / "content"


def load_learning_content() -> tuple[list[dict], dict[str, list[dict]]]:
    """Load canonical course and question content from JSON files.

    SQLite stores identities, progress and attempts; lesson/question copy lives in backend/content.
    """
    courses: list[dict] = []
    questions: dict[str, list[dict]] = {}
    course_dir = CONTENT_DIR / "courses"
    question_dir = CONTENT_DIR / "questions"
    if not course_dir.exists() or not question_dir.exists():
        raise RuntimeError(f"Learning content directory is missing: {CONTENT_DIR}")

    for path in sorted(course_dir.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        subject = payload.get("subject") or {}
        if not subject.get("id") or not isinstance(payload.get("lessons"), list):
            raise RuntimeError(f"Invalid course JSON: {path}")
        for lesson in payload["lessons"]:
            if not lesson.get("key") or not lesson.get("title") or not isinstance(lesson.get("cards"), list):
                raise RuntimeError(f"Invalid lesson in {path}: {lesson.get('title', '<untitled>')}")
            for card in lesson["cards"]:
                source = card.get("source") or {}
                if not source.get("title") or not source.get("url"):
                    raise RuntimeError(f"Every flashcard must have a source URL: {path} / {lesson['key']}")
        courses.append(payload)

    for path in sorted(question_dir.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        subject_id = payload.get("subjectId")
        items = payload.get("questions")
        if not subject_id or not isinstance(items, list):
            raise RuntimeError(f"Invalid question JSON: {path}")
        for item in items:
            if not item.get("key") or len(item.get("answers", [])) < 2:
                raise RuntimeError(f"Invalid question in {path}: {item.get('key', '<no-key>')}")
        questions[subject_id] = items

    return courses, questions


COURSE_CATALOG, QUESTION_CATALOG = load_learning_content()
SUBJECTS = [
    (course["subject"]["id"], course["subject"]["name"], course["subject"]["icon"], course["subject"]["description"])
    for course in COURSE_CATALOG
]



STORE_ITEMS = [
    ("hints3", "Три подсказки", "help-circle", "Скрывают два неверных варианта в вопросе.", 15, "hints", 3),
    ("boost5", "Удвоитель ×5", "zap", "Следующие 5 награждаемых правильных ответов дают вдвое больше атомкоинов.", 60, "boost", 5),
    ("badge_researcher", "Значок «Исследователь»", "microscope", "Коллекционный значок для профиля.", 120, "badge", 1),
    ("badge_engineer", "Значок «Атомный инженер»", "atom", "Коллекционный значок для профиля.", 220, "badge", 1),
]

SUBJECT_ORDER = ["physics", "informatics", "chemistry", "biology", "math", "history"]

ONBOARDING_INTERESTS = [
    {"id": "reactor_physics", "title": "Физика реакторов", "description": "Нейтроны, цепная реакция, тепло и управление мощностью.", "icon": "atom", "subjects": ["physics", "math"]},
    {"id": "energy_engineering", "title": "Энергетика и инженерия", "description": "Как АЭС превращает энергию деления в электричество.", "icon": "zap", "subjects": ["physics", "math"]},
    {"id": "digital_control", "title": "Цифровые системы", "description": "Датчики, алгоритмы, данные и автоматизация атомных объектов.", "icon": "cpu", "subjects": ["informatics", "math"]},
    {"id": "nuclear_medicine", "title": "Ядерная медицина", "description": "Радионуклиды, диагностика, терапия и биологические эффекты.", "icon": "dna", "subjects": ["biology", "chemistry"]},
    {"id": "materials", "title": "Топливо и материалы", "description": "Изотопы, химия топлива, коррозия и свойства материалов.", "icon": "flask", "subjects": ["chemistry", "physics"]},
    {"id": "safety_ecology", "title": "Безопасность и экология", "description": "Дозиметрия, защита, контроль среды и ответственная эксплуатация.", "icon": "target", "subjects": ["biology", "chemistry"]},
    {"id": "history_people", "title": "История и люди отрасли", "description": "Ключевые этапы, проекты и развитие мирного атома.", "icon": "landmark", "subjects": ["history"]},
    {"id": "research_careers", "title": "Наука и профессии", "description": "Исследования, инженерные роли и задачи современных специалистов.", "icon": "microscope", "subjects": ["physics", "informatics", "history"]},
]

ONBOARDING_QUESTIONS = [
    {"id": "physics_chain", "subjectId": "physics", "question": "Что непосредственно поддерживает цепную реакцию деления в реакторе?", "answers": ["Электроны", "Нейтроны", "Молекулы воды", "Фотоны видимого света"], "correctIndex": 1},
    {"id": "physics_energy", "subjectId": "physics", "question": "Какая последовательность преобразования энергии наиболее типична для АЭС?", "answers": ["Тепловая → химическая → световая → электрическая", "Механическая → ядерная → химическая → электрическая", "Ядерная → тепловая → механическая → электрическая", "Электрическая → тепловая → ядерная → механическая"], "correctIndex": 2},
    {"id": "informatics_sensor", "subjectId": "informatics", "question": "Зачем промышленной цифровой системе нужны временные метки у показаний датчиков?", "answers": ["Чтобы понимать, когда было получено каждое измерение", "Чтобы увеличить физическую температуру датчика", "Чтобы заменить резервные каналы связи", "Чтобы изменить единицы измерения"], "correctIndex": 0},
    {"id": "chemistry_isotope", "subjectId": "chemistry", "question": "Чем изотопы одного химического элемента отличаются друг от друга?", "answers": ["Числом протонов в ядре", "Химическим символом элемента", "Обязательным отсутствием электронов", "Числом нейтронов в ядре"], "correctIndex": 3},
    {"id": "biology_protection", "subjectId": "biology", "question": "Какое действие обычно уменьшает дозу внешнего облучения от удалённого источника?", "answers": ["Увеличить время рядом с источником", "Увеличить расстояние до источника", "Убрать экранирование", "Подойти ближе к источнику"], "correctIndex": 1},
    {"id": "math_half_life", "subjectId": "math", "question": "После трёх периодов полураспада какая доля исходного количества ядер останется?", "answers": ["1/3", "3/8", "1/8", "1/6"], "correctIndex": 2},
    {"id": "math_efficiency", "subjectId": "math", "question": "Тепловая мощность установки 3000 МВт, КПД 33%. Какова примерная электрическая мощность?", "answers": ["990 МВт", "99 МВт", "3000 МВт", "9090 МВт"], "correctIndex": 0},
    {"id": "history_obninsk", "subjectId": "history", "question": "Какое событие связано с Обнинском и 1954 годом?", "answers": ["Открытие нейтрона", "Создание таблицы Менделеева", "Первый полёт человека в космос", "Пуск первой в мире атомной электростанции"], "correctIndex": 3},
]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS subjects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                icon TEXT NOT NULL,
                description TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS lessons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject_id TEXT NOT NULL,
                content_key TEXT,
                title TEXT NOT NULL,
                summary TEXT NOT NULL,
                body TEXT NOT NULL,
                cards_json TEXT NOT NULL DEFAULT '[]',
                difficulty TEXT NOT NULL DEFAULT 'Базовый',
                duration_minutes INTEGER NOT NULL DEFAULT 8,
                tags_json TEXT NOT NULL DEFAULT '[]',
                FOREIGN KEY(subject_id) REFERENCES subjects(id)
            );
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject_id TEXT NOT NULL,
                content_key TEXT,
                topic TEXT NOT NULL,
                question TEXT NOT NULL,
                answers_json TEXT NOT NULL,
                correct_index INTEGER NOT NULL,
                explanation TEXT NOT NULL,
                difficulty TEXT NOT NULL DEFAULT 'Базовый',
                origin TEXT NOT NULL DEFAULT 'original',
                source_title TEXT,
                source_url TEXT,
                FOREIGN KEY(subject_id) REFERENCES subjects(id)
            );
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL DEFAULT '',
                coins INTEGER NOT NULL DEFAULT 20,
                hints INTEGER NOT NULL DEFAULT 0,
                boost_answers INTEGER NOT NULL DEFAULT 0,
                selected_badge TEXT,
                onboarding_required INTEGER NOT NULL DEFAULT 0,
                interests_json TEXT NOT NULL DEFAULT '[]',
                assessment_json TEXT NOT NULL DEFAULT '{}',
                program_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS answer_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                question_id INTEGER NOT NULL,
                correct INTEGER NOT NULL,
                answer_index INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS answer_rewards (
                user_id INTEGER NOT NULL,
                question_id INTEGER NOT NULL,
                reward_date TEXT NOT NULL,
                PRIMARY KEY(user_id, question_id, reward_date),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS store_items (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                icon TEXT NOT NULL,
                description TEXT NOT NULL,
                price INTEGER NOT NULL,
                kind TEXT NOT NULL,
                value INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS user_items (
                user_id INTEGER NOT NULL,
                item_id TEXT NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                PRIMARY KEY(user_id, item_id),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(item_id) REFERENCES store_items(id)
            );
            CREATE TABLE IF NOT EXISTS subscriptions (
                user_id INTEGER PRIMARY KEY,
                plan TEXT NOT NULL DEFAULT 'free',
                expires_at TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS premium_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT NOT NULL UNIQUE,
                duration_days INTEGER NOT NULL DEFAULT 30,
                used_by INTEGER,
                used_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(used_by) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS chat_usage (
                user_id INTEGER NOT NULL,
                usage_date TEXT NOT NULL,
                messages INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(user_id, usage_date),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS lesson_progress (
                user_id INTEGER NOT NULL,
                lesson_id INTEGER NOT NULL,
                completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(user_id, lesson_id),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS purchase_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                item_id TEXT NOT NULL,
                price INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(item_id) REFERENCES store_items(id)
            );
            """
        )
        # Безопасная миграция существующей SQLite-базы: старые аккаунты не заставляем проходить онбординг,
        # а для новых регистраций onboarding_required выставляется явно.
        existing_user_columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
        user_column_migrations = {
            "onboarding_required": "INTEGER NOT NULL DEFAULT 0",
            "interests_json": "TEXT NOT NULL DEFAULT '[]'",
            "assessment_json": "TEXT NOT NULL DEFAULT '{}'",
            "program_json": "TEXT NOT NULL DEFAULT '{}'",
        }
        for column_name, definition in user_column_migrations.items():
            if column_name not in existing_user_columns:
                conn.execute(f"ALTER TABLE users ADD COLUMN {column_name} {definition}")

        conn.executemany(
            """INSERT INTO subjects(id, name, icon, description) VALUES (?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET name=excluded.name, icon=excluded.icon, description=excluded.description""",
            SUBJECTS,
        )
        existing_lesson_columns = {row["name"] for row in conn.execute("PRAGMA table_info(lessons)").fetchall()}
        lesson_column_migrations = {
            "content_key": "TEXT",
            "cards_json": "TEXT NOT NULL DEFAULT '[]'",
            "difficulty": "TEXT NOT NULL DEFAULT 'Базовый'",
            "duration_minutes": "INTEGER NOT NULL DEFAULT 8",
            "tags_json": "TEXT NOT NULL DEFAULT '[]'",
        }
        for column_name, definition in lesson_column_migrations.items():
            if column_name not in existing_lesson_columns:
                conn.execute(f"ALTER TABLE lessons ADD COLUMN {column_name} {definition}")

        existing_question_columns = {row["name"] for row in conn.execute("PRAGMA table_info(questions)").fetchall()}
        question_column_migrations = {
            "content_key": "TEXT",
            "difficulty": "TEXT NOT NULL DEFAULT 'Базовый'",
            "origin": "TEXT NOT NULL DEFAULT 'original'",
            "source_title": "TEXT",
            "source_url": "TEXT",
        }
        for column_name, definition in question_column_migrations.items():
            if column_name not in existing_question_columns:
                conn.execute(f"ALTER TABLE questions ADD COLUMN {column_name} {definition}")

        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_lessons_content_key ON lessons(content_key)")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_content_key ON questions(content_key)")

        # JSON is canonical. Existing rows with matching titles are upgraded in place so progress IDs survive.
        for course in COURSE_CATALOG:
            subject_id = course["subject"]["id"]
            for lesson in course["lessons"]:
                body = "\n\n".join(card.get("text", "") for card in lesson["cards"] if card.get("type") == "theory")
                values = (
                    subject_id, lesson["key"], lesson["title"], lesson["summary"], body,
                    json.dumps(lesson["cards"], ensure_ascii=False),
                    lesson.get("difficulty", "Базовый"), int(lesson.get("durationMinutes", 8)),
                    json.dumps(lesson.get("tags", []), ensure_ascii=False),
                )
                existing = conn.execute(
                    "SELECT id FROM lessons WHERE content_key=? OR (content_key IS NULL AND subject_id=? AND title=?) ORDER BY content_key IS NULL LIMIT 1",
                    (lesson["key"], subject_id, lesson["title"]),
                ).fetchone()
                if existing:
                    conn.execute(
                        """UPDATE lessons SET subject_id=?, content_key=?, title=?, summary=?, body=?, cards_json=?,
                           difficulty=?, duration_minutes=?, tags_json=? WHERE id=?""",
                        (*values, existing["id"]),
                    )
                else:
                    conn.execute(
                        """INSERT INTO lessons(subject_id, content_key, title, summary, body, cards_json, difficulty, duration_minutes, tags_json)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""", values,
                    )

        for subject_id, questions in QUESTION_CATALOG.items():
            for item in questions:
                source = item.get("source") or {}
                values = (
                    subject_id, item["key"], item["topic"], item["question"],
                    json.dumps(item["answers"], ensure_ascii=False), int(item["correctIndex"]), item["explanation"],
                    item.get("difficulty", "Базовый"), item.get("origin", "original"), source.get("title"), source.get("url"),
                )
                existing = conn.execute("SELECT id FROM questions WHERE content_key=?", (item["key"],)).fetchone()
                if existing:
                    conn.execute(
                        """UPDATE questions SET subject_id=?, content_key=?, topic=?, question=?, answers_json=?, correct_index=?,
                           explanation=?, difficulty=?, origin=?, source_title=?, source_url=? WHERE id=?""",
                        (*values, existing["id"]),
                    )
                else:
                    conn.execute(
                        """INSERT INTO questions(subject_id, content_key, topic, question, answers_json, correct_index, explanation,
                           difficulty, origin, source_title, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", values,
                    )
        conn.executemany(
            """INSERT INTO store_items(id, title, icon, description, price, kind, value)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET title=excluded.title, icon=excluded.icon,
                 description=excluded.description, price=excluded.price, kind=excluded.kind, value=excluded.value""",
            STORE_ITEMS,
        )


def subject_row_to_dict(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "name": row["name"], "icon": row["icon"], "description": row["description"]}


def current_user_id() -> int | None:
    value = session.get("user_id")
    return int(value) if isinstance(value, int) or (isinstance(value, str) and value.isdigit()) else None


def require_user() -> tuple[int | None, tuple | None]:
    user_id = current_user_id()
    if not user_id:
        return None, (jsonify({"error": "Нужно войти в аккаунт"}), 401)
    return user_id, None


PUBLIC_API_PATHS = {
    "/api/health",
    "/api/config",
    "/api/me",
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/logout",
}


@app.before_request
def protect_learning_api():
    """Не отдаём учебные данные и пользовательские функции без активной сессии."""
    if request.method == "OPTIONS" or not request.path.startswith("/api/"):
        return None
    if request.path in PUBLIC_API_PATHS:
        return None
    if not current_user_id():
        return jsonify({"error": "Войдите или зарегистрируйтесь, чтобы открыть учебную платформу"}), 401
    return None


def parse_expiry(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def subscription_info(conn: sqlite3.Connection, user_id: int) -> dict:
    row = conn.execute("SELECT plan, expires_at FROM subscriptions WHERE user_id = ?", (user_id,)).fetchone()
    if not row:
        return {"plan": "free", "name": "Базовый", "isPremium": False, "expiresAt": None}
    expiry = parse_expiry(row["expires_at"])
    active = row["plan"] == "atom_plus" and (expiry is None or expiry > utcnow())
    if not active:
        return {"plan": "free", "name": "Базовый", "isPremium": False, "expiresAt": None}
    return {"plan": "atom_plus", "name": "АТОМ+", "isPremium": True, "expiresAt": row["expires_at"]}


def profile_payload(conn: sqlite3.Connection, user_id: int) -> dict | None:
    user = conn.execute(
        "SELECT id, email, first_name, last_name, coins, hints, boost_answers, selected_badge, onboarding_required, interests_json, assessment_json, program_json, created_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if not user:
        return None
    stats = conn.execute(
        "SELECT COUNT(*) AS answered, COALESCE(SUM(correct), 0) AS correct FROM answer_attempts WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    badges = conn.execute(
        """SELECT s.id, s.title, s.icon FROM user_items ui
           JOIN store_items s ON s.id = ui.item_id
           WHERE ui.user_id = ? AND s.kind = 'badge' ORDER BY s.price""",
        (user_id,),
    ).fetchall()
    answered = int(stats["answered"] or 0)
    correct = int(stats["correct"] or 0)
    completed_lessons = conn.execute(
        """SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id
           WHERE lp.user_id=? AND l.content_key IS NOT NULL""", (user_id,)
    ).fetchone()[0]
    total_lessons = conn.execute("SELECT COUNT(*) FROM lessons WHERE content_key IS NOT NULL").fetchone()[0]
    return {
        "id": user["id"],
        "email": user["email"],
        "firstName": user["first_name"],
        "lastName": user["last_name"],
        "coins": user["coins"],
        "hints": user["hints"],
        "boostAnswers": user["boost_answers"],
        "selectedBadge": user["selected_badge"],
        "badges": [dict(row) for row in badges],
        "createdAt": user["created_at"],
        "onboardingCompleted": not bool(user["onboarding_required"]),
        "interests": json.loads(user["interests_json"] or "[]"),
        "assessment": json.loads(user["assessment_json"] or "{}"),
        "program": json.loads(user["program_json"] or "{}"),
        "subscription": subscription_info(conn, user_id),
        "stats": {
            "answered": answered,
            "correct": correct,
            "accuracy": round(correct / answered * 100) if answered else 0,
            "completedLessons": int(completed_lessons),
            "totalLessons": int(total_lessons),
        },
    }


def make_premium_key(conn: sqlite3.Connection, duration_days: int = 30) -> str:
    while True:
        key = "ATOM-" + token_urlsafe(12).replace("-", "").replace("_", "").upper()[:16]
        try:
            conn.execute("INSERT INTO premium_keys(key, duration_days) VALUES (?, ?)", (key, duration_days))
            return key
        except sqlite3.IntegrityError:
            continue


def build_study_program(conn: sqlite3.Connection, interests: list[str], answers: dict[str, int]) -> tuple[dict, dict]:
    valid_interest_map = {item["id"]: item for item in ONBOARDING_INTERESTS}
    valid_question_map = {item["id"]: item for item in ONBOARDING_QUESTIONS}

    totals = {subject_id: 0 for subject_id in SUBJECT_ORDER}
    correct = {subject_id: 0 for subject_id in SUBJECT_ORDER}
    for question_id, question in valid_question_map.items():
        totals[question["subjectId"]] += 1
        if answers.get(question_id) == question["correctIndex"]:
            correct[question["subjectId"]] += 1

    interest_weights = {subject_id: 0 for subject_id in SUBJECT_ORDER}
    for interest_id in interests:
        item = valid_interest_map.get(interest_id)
        if not item:
            continue
        for subject_id in item["subjects"]:
            if subject_id in interest_weights:
                interest_weights[subject_id] += 1

    subject_rows = {
        row["id"]: row
        for row in conn.execute("SELECT id, name, icon FROM subjects").fetchall()
    }
    sections = []
    for subject_id in SUBJECT_ORDER:
        total = totals[subject_id]
        score = correct[subject_id] / total if total else 0.0
        interest_count = interest_weights[subject_id]
        priority = round((1.0 - score) * 3.0 + min(interest_count, 3) * 0.75, 3)
        if score < 0.5 and interest_count:
            reason = "Тема тебе интересна, а базу стоит укрепить"
        elif score < 0.5:
            reason = "Начнём с основ и постепенно усложним материал"
        elif interest_count:
            reason = "Есть базовые знания и выраженный интерес к направлению"
        else:
            reason = "Закрепим знания после приоритетных направлений"
        lesson_ids = [
            int(row["id"])
            for row in conn.execute("SELECT id FROM lessons WHERE subject_id=? AND content_key IS NOT NULL ORDER BY id", (subject_id,)).fetchall()
        ]
        row = subject_rows.get(subject_id)
        sections.append({
            "subjectId": subject_id,
            "name": row["name"] if row else subject_id,
            "icon": row["icon"] if row else "book-open",
            "scorePct": round(score * 100),
            "interestCount": interest_count,
            "priority": priority,
            "reason": reason,
            "lessonIds": lesson_ids,
        })

    sections.sort(key=lambda item: (-item["priority"], SUBJECT_ORDER.index(item["subjectId"])))
    total_correct = sum(correct.values())
    total_questions = sum(totals.values())
    percent = round(total_correct / total_questions * 100) if total_questions else 0
    if percent >= 75:
        level = "Уверенная база"
        level_note = "Можно быстрее проходить знакомые основы и больше времени уделять прикладным темам."
    elif percent >= 45:
        level = "Базовый уровень"
        level_note = "Часть основ уже знакома. Программа начнёт с тем, где тест показал пробелы."
    else:
        level = "Стартовый уровень"
        level_note = "Программа начнёт с фундаментальных понятий и будет двигаться небольшими шагами."

    assessment = {
        "correct": total_correct,
        "total": total_questions,
        "percent": percent,
        "bySubject": {
            subject_id: {
                "correct": correct[subject_id],
                "total": totals[subject_id],
                "percent": round(correct[subject_id] / totals[subject_id] * 100) if totals[subject_id] else 0,
            }
            for subject_id in SUBJECT_ORDER
        },
    }
    program = {
        "level": level,
        "levelNote": level_note,
        "focusSubjects": [item["subjectId"] for item in sections[:3]],
        "sections": sections,
        "generatedAt": iso(utcnow()),
    }
    return assessment, program


def public_onboarding_payload() -> dict:
    return {
        "interests": [
            {key: item[key] for key in ("id", "title", "description", "icon")}
            for item in ONBOARDING_INTERESTS
        ],
        "questions": [
            {key: item[key] for key in ("id", "subjectId", "question", "answers")}
            for item in ONBOARDING_QUESTIONS
        ],
    }


def local_ai_answer(message: str, subject_id: str | None) -> str:
    query = message.lower().strip()
    with connect() as conn:
        if subject_id and subject_id in SUBJECT_ORDER:
            rows = conn.execute(
                "SELECT s.name AS subject_name, l.title, l.summary, l.body FROM lessons l JOIN subjects s ON s.id=l.subject_id WHERE l.subject_id=? AND l.content_key IS NOT NULL",
                (subject_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT s.name AS subject_name, l.title, l.summary, l.body FROM lessons l JOIN subjects s ON s.id=l.subject_id WHERE l.content_key IS NOT NULL"
            ).fetchall()
    words = {w.strip('.,!?():;\"«»').lower() for w in query.split() if len(w) > 3}
    def score(row):
        hay = f"{row['title']} {row['summary']} {row['body']}".lower()
        return sum(1 for word in words if word in hay)
    ranked = sorted(rows, key=score, reverse=True)
    best = ranked[0] if ranked else None
    if not best:
        return "Я могу помочь с физикой, информатикой, химией, биологией, математикой и историей атомной промышленности. Задай вопрос по одной из этих тем."
    body = best["body"].replace("\n\n", " ")
    if len(body) > 900:
        body = body[:897] + "…"
    if "тест" in query or "вопрос" in query:
        return f"Мини-тренировка по теме «{best['title']}»: сначала сформулируй главный принцип своими словами, затем назови один пример его применения в атомной отрасли. После этого открой раздел «Задания» — там есть проверяемые вопросы и атомкоины за правильные ответы."
    if "проще" in query or "объясни" in query:
        return f"Простыми словами — **{best['title']}**. {body}\n\nЕсли хочешь, спроси: «приведи пример» или «дай мини-тест»."
    return f"Нашёл близкую тему: **{best['subject_name']} · {best['title']}**.\n\n{body}\n\nМогу объяснить это проще или предложить мини-тест."


def external_ai_answer(message: str, subject_id: str | None) -> str | None:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    system_text = (
        "Ты учебный помощник ДуАТОМ. Отвечай по-русски, кратко и понятно школьнику. "
        "Все примеры связывай с мирными применениями атомной промышленности. "
        "Не давай опасных инструкций по созданию оружия, обращению с радиоактивными материалами или обходу промышленной безопасности. "
        f"Текущий предмет: {subject_id or 'не выбран'}."
    )
    payload = json.dumps({
        "model": model,
        "input": [
            {"role": "system", "content": system_text},
            {"role": "user", "content": message},
        ],
        "max_output_tokens": 700,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
        text = data.get("output_text")
        if text:
            return str(text).strip()
        for block in data.get("output", []):
            for content in block.get("content", []):
                if content.get("type") == "output_text" and content.get("text"):
                    return str(content["text"]).strip()
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError):
        return None
    return None


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "app": "ДуАТОМ"})


@app.get("/api/config")
def config():
    return jsonify({
        "telegramBotUrl": os.getenv("TELEGRAM_BOT_URL", "https://t.me/yasno_sub_bot"),
        "coinReward": 5,
    })


@app.post("/api/auth/register")
def register():
    body = request.get_json(silent=True) or {}
    email = str(body.get("email", "")).strip().lower()
    password = str(body.get("password", ""))
    first_name = str(body.get("firstName", "")).strip()
    last_name = str(body.get("lastName", "")).strip()
    if not first_name or not email or "@" not in email:
        return jsonify({"error": "Укажите имя и корректную почту"}), 400
    if len(password) < 8:
        return jsonify({"error": "Пароль должен содержать не менее 8 символов"}), 400
    try:
        with connect() as conn:
            cur = conn.execute(
                "INSERT INTO users(email, password_hash, first_name, last_name, onboarding_required) VALUES (?, ?, ?, ?, 1)",
                (email, generate_password_hash(password), first_name, last_name),
            )
            user_id = int(cur.lastrowid)
            conn.execute("INSERT OR IGNORE INTO subscriptions(user_id, plan) VALUES (?, 'free')", (user_id,))
            payload = profile_payload(conn, user_id)
    except sqlite3.IntegrityError:
        return jsonify({"error": "Аккаунт с такой почтой уже существует"}), 409
    session.clear()
    session["user_id"] = user_id
    return jsonify(payload), 201


@app.post("/api/auth/login")
def login():
    body = request.get_json(silent=True) or {}
    email = str(body.get("email", "")).strip().lower()
    password = str(body.get("password", ""))
    with connect() as conn:
        user = conn.execute("SELECT id, password_hash FROM users WHERE email = ?", (email,)).fetchone()
        if not user or not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Неверная почта или пароль"}), 401
        payload = profile_payload(conn, int(user["id"]))
    session.clear()
    session["user_id"] = int(user["id"])
    return jsonify(payload)


@app.post("/api/auth/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/me")
def me():
    user_id = current_user_id()
    if not user_id:
        return jsonify({"user": None})
    with connect() as conn:
        payload = profile_payload(conn, user_id)
    if not payload:
        session.clear()
        return jsonify({"user": None})
    return jsonify({"user": payload})


@app.put("/api/me")
def update_me():
    user_id, error = require_user()
    if error:
        return error
    body = request.get_json(silent=True) or {}
    first_name = str(body.get("firstName", "")).strip()
    last_name = str(body.get("lastName", "")).strip()
    if not first_name:
        return jsonify({"error": "Имя не может быть пустым"}), 400
    with connect() as conn:
        conn.execute("UPDATE users SET first_name=?, last_name=? WHERE id=?", (first_name, last_name, user_id))
        payload = profile_payload(conn, user_id)
    return jsonify(payload)


@app.get("/api/onboarding")
def onboarding_data():
    user_id, error = require_user()
    if error:
        return error
    payload = public_onboarding_payload()
    with connect() as conn:
        user = conn.execute(
            "SELECT onboarding_required, interests_json, assessment_json, program_json FROM users WHERE id=?",
            (user_id,),
        ).fetchone()
    payload["completed"] = not bool(user["onboarding_required"]) if user else False
    payload["selectedInterests"] = json.loads(user["interests_json"] or "[]") if user else []
    payload["assessment"] = json.loads(user["assessment_json"] or "{}") if user else {}
    payload["program"] = json.loads(user["program_json"] or "{}") if user else {}
    return jsonify(payload)


@app.post("/api/onboarding/submit")
def onboarding_submit():
    user_id, error = require_user()
    if error:
        return error
    body = request.get_json(silent=True) or {}
    interests = body.get("interests") or []
    answers = body.get("answers") or {}
    if not isinstance(interests, list) or not isinstance(answers, dict):
        return jsonify({"error": "Некорректные данные входного теста"}), 400

    valid_interest_ids = {item["id"] for item in ONBOARDING_INTERESTS}
    cleaned_interests = []
    for value in interests:
        interest_id = str(value)
        if interest_id in valid_interest_ids and interest_id not in cleaned_interests:
            cleaned_interests.append(interest_id)
    if not cleaned_interests:
        return jsonify({"error": "Выберите хотя бы одно интересное направление"}), 400
    if len(cleaned_interests) > 5:
        return jsonify({"error": "Выберите не больше пяти интересных направлений"}), 400

    valid_question_ids = {item["id"] for item in ONBOARDING_QUESTIONS}
    cleaned_answers: dict[str, int] = {}
    for question_id in valid_question_ids:
        value = answers.get(question_id)
        if not isinstance(value, int) or value < 0 or value > 3:
            return jsonify({"error": "Ответьте на все вопросы входного теста"}), 400
        cleaned_answers[question_id] = value

    with connect() as conn:
        assessment, program = build_study_program(conn, cleaned_interests, cleaned_answers)
        conn.execute(
            """UPDATE users
               SET onboarding_required=0, interests_json=?, assessment_json=?, program_json=?
               WHERE id=?""",
            (
                json.dumps(cleaned_interests, ensure_ascii=False),
                json.dumps(assessment, ensure_ascii=False),
                json.dumps(program, ensure_ascii=False),
                user_id,
            ),
        )
        user_payload = profile_payload(conn, user_id)
    return jsonify({"user": user_payload, "assessment": assessment, "program": program})


@app.get("/api/subjects")
def list_subjects():
    with connect() as conn:
        rows = conn.execute(
            """SELECT s.*, COUNT(DISTINCT CASE WHEN l.content_key IS NOT NULL THEN l.id END) AS lessons_count, COUNT(DISTINCT CASE WHEN q.content_key IS NOT NULL THEN q.id END) AS questions_count
               FROM subjects s
               LEFT JOIN lessons l ON l.subject_id = s.id
               LEFT JOIN questions q ON q.subject_id = s.id
               GROUP BY s.id
               ORDER BY CASE s.id
                 WHEN 'physics' THEN 1 WHEN 'informatics' THEN 2 WHEN 'chemistry' THEN 3
                 WHEN 'biology' THEN 4 WHEN 'math' THEN 5 WHEN 'history' THEN 6 ELSE 99 END"""
        ).fetchall()
    return jsonify([
        {**subject_row_to_dict(row), "lessonsCount": row["lessons_count"], "questionsCount": row["questions_count"]}
        for row in rows
    ])


@app.get("/api/subjects/<subject_id>")
def get_subject(subject_id: str):
    user_id = current_user_id()
    with connect() as conn:
        subject = conn.execute("SELECT * FROM subjects WHERE id = ?", (subject_id,)).fetchone()
        if not subject:
            return jsonify({"error": "Предмет не найден"}), 404
        lessons = conn.execute(
            """SELECT id, title, summary, body, cards_json, difficulty, duration_minutes, tags_json
               FROM lessons WHERE subject_id = ? AND content_key IS NOT NULL ORDER BY id""", (subject_id,)
        ).fetchall()
        completed = set()
        if user_id:
            completed = {row["lesson_id"] for row in conn.execute(
                "SELECT lesson_id FROM lesson_progress WHERE user_id=?", (user_id,)
            ).fetchall()}
    lesson_payload = []
    for row in lessons:
        item = dict(row)
        item["cards"] = json.loads(item.pop("cards_json") or "[]")
        item["durationMinutes"] = item.pop("duration_minutes")
        item["tags"] = json.loads(item.pop("tags_json") or "[]")
        item["completed"] = item["id"] in completed
        lesson_payload.append(item)
    return jsonify({**subject_row_to_dict(subject), "lessons": lesson_payload})


@app.get("/api/topics")
def topics():
    user_id = current_user_id()
    with connect() as conn:
        subjects = conn.execute(
            """SELECT * FROM subjects ORDER BY CASE id
               WHEN 'physics' THEN 1 WHEN 'informatics' THEN 2 WHEN 'chemistry' THEN 3
               WHEN 'biology' THEN 4 WHEN 'math' THEN 5 WHEN 'history' THEN 6 ELSE 99 END"""
        ).fetchall()
        completed = set()
        if user_id:
            completed = {row["lesson_id"] for row in conn.execute(
                "SELECT lesson_id FROM lesson_progress WHERE user_id=?", (user_id,)
            ).fetchall()}
        result = []
        for subject in subjects:
            lessons = conn.execute(
                """SELECT id, title, summary, difficulty, duration_minutes, tags_json FROM lessons
                   WHERE subject_id=? AND content_key IS NOT NULL ORDER BY id""", (subject["id"],)
            ).fetchall()
            result.append({
                **subject_row_to_dict(subject),
                "lessons": [
                    {**{k: v for k, v in dict(lesson).items() if k not in {"duration_minutes", "tags_json"}},
                     "durationMinutes": lesson["duration_minutes"], "tags": json.loads(lesson["tags_json"] or "[]"),
                     "completed": lesson["id"] in completed}
                    for lesson in lessons
                ],
            })
    return jsonify(result)


@app.post("/api/lessons/<int:lesson_id>/complete")
def complete_lesson(lesson_id: int):
    user_id, error = require_user()
    if error:
        return error
    with connect() as conn:
        lesson = conn.execute("SELECT id FROM lessons WHERE id=? AND content_key IS NOT NULL", (lesson_id,)).fetchone()
        if not lesson:
            return jsonify({"error": "Урок не найден"}), 404
        conn.execute(
            "INSERT OR IGNORE INTO lesson_progress(user_id, lesson_id) VALUES (?, ?)",
            (user_id, lesson_id),
        )
        done = conn.execute(
            """SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id
               WHERE lp.user_id=? AND l.content_key IS NOT NULL""", (user_id,)
        ).fetchone()[0]
        total = conn.execute("SELECT COUNT(*) FROM lessons WHERE content_key IS NOT NULL").fetchone()[0]
    return jsonify({"ok": True, "completedLessons": done, "totalLessons": total})


@app.get("/api/subjects/<subject_id>/quiz")
def get_quiz(subject_id: str):
    try:
        limit = max(1, min(int(request.args.get("limit", 5)), 10))
    except ValueError:
        limit = 5
    with connect() as conn:
        rows = conn.execute(
            """SELECT id, topic, question, answers_json, difficulty, origin, source_title, source_url
               FROM questions WHERE subject_id = ? AND content_key IS NOT NULL""", (subject_id,)
        ).fetchall()
    if not rows:
        return jsonify({"error": "Вопросы не найдены"}), 404
    selected = random.sample(rows, min(limit, len(rows)))
    return jsonify([
        {
            "id": row["id"], "topic": row["topic"], "question": row["question"],
            "answers": json.loads(row["answers_json"]), "difficulty": row["difficulty"], "origin": row["origin"],
            "source": {"title": row["source_title"], "url": row["source_url"]} if row["source_title"] else None,
        }
        for row in selected
    ])


@app.post("/api/questions/<int:question_id>/check")
def check_answer(question_id: int):
    body = request.get_json(silent=True) or {}
    answer_index = body.get("answerIndex")
    if not isinstance(answer_index, int):
        return jsonify({"error": "answerIndex должен быть числом"}), 400
    user_id = current_user_id()
    coins_awarded = 0
    balance = None
    with connect() as conn:
        row = conn.execute(
            "SELECT correct_index, explanation FROM questions WHERE id = ?", (question_id,)
        ).fetchone()
        if not row:
            return jsonify({"error": "Вопрос не найден"}), 404
        correct = answer_index == row["correct_index"]
        if user_id:
            conn.execute(
                "INSERT INTO answer_attempts(user_id, question_id, correct, answer_index) VALUES (?, ?, ?, ?)",
                (user_id, question_id, int(correct), answer_index),
            )
            if correct:
                reward_date = utcnow().date().isoformat()
                try:
                    conn.execute(
                        "INSERT INTO answer_rewards(user_id, question_id, reward_date) VALUES (?, ?, ?)",
                        (user_id, question_id, reward_date),
                    )
                    user = conn.execute("SELECT boost_answers FROM users WHERE id=?", (user_id,)).fetchone()
                    base_reward = 5
                    if subscription_info(conn, user_id)["isPremium"]:
                        base_reward = 7
                    multiplier = 2 if user and user["boost_answers"] > 0 else 1
                    coins_awarded = base_reward * multiplier
                    conn.execute("UPDATE users SET coins=coins+? WHERE id=?", (coins_awarded, user_id))
                    if multiplier == 2:
                        conn.execute("UPDATE users SET boost_answers=MAX(boost_answers-1, 0) WHERE id=?", (user_id,))
                except sqlite3.IntegrityError:
                    coins_awarded = 0
            balance_row = conn.execute("SELECT coins FROM users WHERE id=?", (user_id,)).fetchone()
            balance = balance_row["coins"] if balance_row else None
    return jsonify({
        "correct": correct,
        "correctIndex": row["correct_index"],
        "explanation": row["explanation"],
        "coinsAwarded": coins_awarded,
        "balance": balance,
        "rewardNote": "Награда за этот вопрос уже получена сегодня" if correct and user_id and coins_awarded == 0 else None,
    })


@app.post("/api/questions/<int:question_id>/hint")
def use_hint(question_id: int):
    user_id, error = require_user()
    if error:
        return error
    with connect() as conn:
        question = conn.execute("SELECT answers_json, correct_index FROM questions WHERE id=?", (question_id,)).fetchone()
        if not question:
            return jsonify({"error": "Вопрос не найден"}), 404
        user = conn.execute("SELECT hints FROM users WHERE id=?", (user_id,)).fetchone()
        if not user or user["hints"] <= 0:
            return jsonify({"error": "Подсказки закончились. Их можно купить в магазине."}), 400
        answers = json.loads(question["answers_json"])
        wrong = [i for i in range(len(answers)) if i != question["correct_index"]]
        hidden = random.sample(wrong, min(2, len(wrong)))
        conn.execute("UPDATE users SET hints=hints-1 WHERE id=?", (user_id,))
        left = conn.execute("SELECT hints FROM users WHERE id=?", (user_id,)).fetchone()["hints"]
    return jsonify({"hiddenIndices": hidden, "hintsLeft": left})


@app.get("/api/store")
def store():
    user_id = current_user_id()
    with connect() as conn:
        rows = conn.execute("SELECT * FROM store_items ORDER BY price, id").fetchall()
        owned = set()
        hints = 0
        boosts = 0
        if user_id:
            owned = {row["item_id"] for row in conn.execute(
                "SELECT item_id FROM user_items WHERE user_id=?", (user_id,)
            ).fetchall()}
            user = conn.execute("SELECT hints, boost_answers FROM users WHERE id=?", (user_id,)).fetchone()
            if user:
                hints = int(user["hints"])
                boosts = int(user["boost_answers"])
    payload = []
    for row in rows:
        item = dict(row)
        item["owned"] = row["id"] in owned and row["kind"] == "badge"
        item["inventory"] = hints if row["kind"] == "hints" else boosts if row["kind"] == "boost" else (1 if item["owned"] else 0)
        payload.append(item)
    return jsonify(payload)


@app.post("/api/store/buy")
def buy_store_item():
    user_id, error = require_user()
    if error:
        return error
    body = request.get_json(silent=True) or {}
    item_id = str(body.get("itemId", "")).strip()
    if not item_id:
        return jsonify({"error": "Не выбран товар"}), 400
    with connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        item = conn.execute("SELECT * FROM store_items WHERE id=?", (item_id,)).fetchone()
        if not item:
            return jsonify({"error": "Товар не найден"}), 404
        if item["kind"] not in {"hints", "boost", "badge"}:
            return jsonify({"error": "Неизвестный тип товара"}), 400
        if item["kind"] == "badge" and conn.execute(
            "SELECT 1 FROM user_items WHERE user_id=? AND item_id=?", (user_id, item_id)
        ).fetchone():
            return jsonify({"error": "Этот значок уже куплен"}), 400
        debit = conn.execute(
            "UPDATE users SET coins=coins-? WHERE id=? AND coins>=?",
            (item["price"], user_id, item["price"]),
        )
        if debit.rowcount != 1:
            balance = conn.execute("SELECT coins FROM users WHERE id=?", (user_id,)).fetchone()
            return jsonify({
                "error": "Недостаточно атомкоинов",
                "balance": int(balance["coins"]) if balance else 0,
                "price": int(item["price"]),
            }), 400
        if item["kind"] == "hints":
            conn.execute("UPDATE users SET hints=hints+? WHERE id=?", (item["value"], user_id))
        elif item["kind"] == "boost":
            conn.execute("UPDATE users SET boost_answers=boost_answers+? WHERE id=?", (item["value"], user_id))
        elif item["kind"] == "badge":
            conn.execute(
                "INSERT INTO user_items(user_id, item_id, quantity) VALUES (?, ?, 1)",
                (user_id, item_id),
            )
            conn.execute("UPDATE users SET selected_badge=? WHERE id=?", (item_id, user_id))
        conn.execute(
            "INSERT INTO purchase_history(user_id, item_id, price) VALUES (?, ?, ?)",
            (user_id, item_id, item["price"]),
        )
        payload = profile_payload(conn, user_id)
    return jsonify({
        "ok": True,
        "message": f"Покупка «{item['title']}» выполнена",
        "user": payload,
    })


@app.post("/api/profile/badge")
def select_badge():
    user_id, error = require_user()
    if error:
        return error
    item_id = str((request.get_json(silent=True) or {}).get("itemId", ""))
    with connect() as conn:
        item = conn.execute(
            """SELECT s.id FROM user_items ui JOIN store_items s ON s.id=ui.item_id
               WHERE ui.user_id=? AND ui.item_id=? AND s.kind='badge'""", (user_id, item_id)
        ).fetchone()
        if not item:
            return jsonify({"error": "Сначала купите этот значок"}), 400
        conn.execute("UPDATE users SET selected_badge=? WHERE id=?", (item_id, user_id))
        payload = profile_payload(conn, user_id)
    return jsonify(payload)


@app.get("/api/subscription")
def get_subscription():
    user_id = current_user_id()
    if not user_id:
        return jsonify({
            "current": {"plan": "free", "name": "Базовый", "isPremium": False, "expiresAt": None},
            "plans": [
                {"id": "free", "name": "Базовый", "price": "0 ₽", "features": ["Учебные материалы", "+5 атомкоинов за правильный ответ", "5 сообщений AI-чату в день"]},
                {"id": "atom_plus", "name": "АТОМ+", "price": "по ключу", "features": ["Безлимитный AI-чат", "+7 атомкоинов за правильный ответ", "Ключ выдаётся через Telegram-бота"]},
            ],
        })
    with connect() as conn:
        current = subscription_info(conn, user_id)
    return jsonify({
        "current": current,
        "plans": [
            {"id": "free", "name": "Базовый", "price": "0 ₽", "features": ["Учебные материалы", "+5 атомкоинов за правильный ответ", "5 сообщений AI-чату в день"]},
            {"id": "atom_plus", "name": "АТОМ+", "price": "по ключу", "features": ["Безлимитный AI-чат", "+7 атомкоинов за правильный ответ", "Ключ выдаётся через Telegram-бота"]},
        ],
    })


@app.post("/api/subscription/activate")
def activate_subscription():
    user_id, error = require_user()
    if error:
        return error
    key = str((request.get_json(silent=True) or {}).get("key", "")).strip().upper()
    if not key:
        return jsonify({"error": "Введите ключ"}), 400
    with connect() as conn:
        row = conn.execute("SELECT id, duration_days, used_by FROM premium_keys WHERE key=?", (key,)).fetchone()
        if not row:
            return jsonify({"error": "Ключ не найден"}), 404
        if row["used_by"]:
            return jsonify({"error": "Ключ уже использован"}), 400
        current = subscription_info(conn, user_id)
        base = parse_expiry(current.get("expiresAt")) if current["isPremium"] else utcnow()
        if not base or base < utcnow():
            base = utcnow()
        expires = base + timedelta(days=int(row["duration_days"]))
        conn.execute(
            """INSERT INTO subscriptions(user_id, plan, expires_at) VALUES (?, 'atom_plus', ?)
               ON CONFLICT(user_id) DO UPDATE SET plan='atom_plus', expires_at=excluded.expires_at""",
            (user_id, iso(expires)),
        )
        conn.execute("UPDATE premium_keys SET used_by=?, used_at=? WHERE id=?", (user_id, iso(utcnow()), row["id"]))
        payload = subscription_info(conn, user_id)
    return jsonify({"message": "Подписка АТОМ+ активирована", "subscription": payload})


@app.post("/api/chat")
def chat():
    user_id, error = require_user()
    if error:
        return error
    body = request.get_json(silent=True) or {}
    message = str(body.get("message", "")).strip()
    subject_id = str(body.get("subjectId", "")).strip() or None
    if not message:
        return jsonify({"error": "Введите сообщение"}), 400
    if len(message) > 2000:
        return jsonify({"error": "Сообщение слишком длинное"}), 400
    today = utcnow().date().isoformat()
    with connect() as conn:
        premium = subscription_info(conn, user_id)["isPremium"]
        usage = conn.execute("SELECT messages FROM chat_usage WHERE user_id=? AND usage_date=?", (user_id, today)).fetchone()
        count = int(usage["messages"]) if usage else 0
        if not premium and count >= 5:
            return jsonify({"error": "Лимит Базового тарифа — 5 сообщений в день. АТОМ+ снимает лимит."}), 429
        conn.execute(
            """INSERT INTO chat_usage(user_id, usage_date, messages) VALUES (?, ?, 1)
               ON CONFLICT(user_id, usage_date) DO UPDATE SET messages=messages+1""",
            (user_id, today),
        )
    external = external_ai_answer(message, subject_id)
    answer = external or local_ai_answer(message, subject_id)
    return jsonify({"content": answer, "source": "external" if external else "local"})


# Telegram-бот работает в том же процессе, что и Flask backend, и использует ту же SQLite-базу.
def start_telegram_bot() -> bool:
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        print("Telegram-бот не запущен: TELEGRAM_BOT_TOKEN не задан")
        return False

    try:
        import telebot
        from telebot import types
    except ImportError:
        print("Telegram-бот не запущен: установите pyTelegramBotAPI из backend/requirements.txt")
        return False

    admin_ids = {
        int(value.strip())
        for value in os.getenv("TELEGRAM_ADMIN_IDS", "").split(",")
        if value.strip().isdigit()
    }
    app_url = os.getenv("DUATOM_APP_URL", "http://localhost:8080").strip()
    bot = telebot.TeleBot(token)

    def is_admin(user_id: int) -> bool:
        return user_id in admin_ids

    @bot.message_handler(commands=["start"])
    def bot_start(message):
        markup = types.InlineKeyboardMarkup()
        markup.add(
            types.InlineKeyboardButton(
                text="💳 Оплатить подписку",
                callback_data="pay",
            )
        )
        # Only add URL button if it's a valid HTTPS URL
        if app_url.startswith("https://"):
            markup.add(types.InlineKeyboardButton("Открыть ДуАТОМ", url=app_url))

        bot.send_message(
            message.chat.id,
            "👋 Привет! Я бот для активации премиум подписки в сервисе doATOM!\n\n"
            "Этот сервис предназначен для подготовки к экзаменам с персональным ИИ-ментором.\n\n"
            "Нажмите кнопку ниже для оплаты подписки или используйте команду /help для справки.",
            reply_markup=markup,
        )

    @bot.message_handler(commands=["help"])
    def bot_help(message):
        help_text = """
/start - Начало работы
/help - Справка по командам
/generate - Сгенерировать ключ (только для администратора)
/keys - Показать список ключей (только для администратора)
/pay - Оплатить подписку
/about - что умеет приложение
/shop - как работают атомкоины
"""

        if is_admin(message.from_user.id):
            bot.send_message(message.chat.id, help_text)
        else:
            bot.send_message(
                message.chat.id,
                "/start - Начало работы\n/help - Справка по командам\n/pay - Оплатить подписку\n/about - что умеет приложение\n/shop - как работают атомкоины",
            )

    @bot.message_handler(commands=["about"])
    def bot_about(message):
        bot.send_message(
            message.chat.id,
            "Шесть учебных направлений объединены атомной тематикой. Веб-приложение хранит прогресс, "
            "атомкоины, покупки и даёт доступ к AI-помощнику.",
        )

    @bot.message_handler(commands=["shop"])
    def bot_shop(message):
        bot.send_message(
            message.chat.id,
            "Атомкоины начисляются за правильные ответы. Во внутреннем Атоммаркете на них можно покупать "
            "подсказки, удвоители награды и коллекционные значки. Реальные платежи для атомкоинов не используются.",
        )

    @bot.message_handler(commands=["generate"])
    def bot_generate(message):
        if not is_admin(message.from_user.id):
            bot.send_message(message.chat.id, "❌ Эта команда доступна только администраторам")
            return
        parts = message.text.split()
        days = 30
        if len(parts) > 1 and parts[1].isdigit():
            days = max(1, min(int(parts[1]), 365))
        try:
            with connect() as conn:
                key = make_premium_key(conn, days)
            bot.send_message(
                message.chat.id,
                "✅ Ключ премиум подписки создан!\n\n"
                f"🔑 Ключ: `{key}`\n\n"
                f"Срок: {days} дней после активации в приложении\n\n"
                "Пользователь может активировать этот ключ в профиле.",
                parse_mode="Markdown",
            )
        except Exception as error:
            bot.send_message(
                message.chat.id,
                f"❌ Ошибка при создании ключа: {error}",
            )

    @bot.message_handler(commands=["keys"])
    def bot_keys(message):
        if not is_admin(message.from_user.id):
            bot.send_message(message.chat.id, "❌ Эта команда доступна только администраторам")
            return
        try:
            with connect() as conn:
                rows = conn.execute(
                    "SELECT key, duration_days, used_by, created_at FROM premium_keys ORDER BY id DESC LIMIT 10"
                ).fetchall()
            if not rows:
                bot.send_message(message.chat.id, "📭 Нет созданных ключей")
                return

            response = "📋 Последние 10 ключей:\n\n"
            for row in rows:
                status = "✅ Активен" if True else "❌ Деактивирован"
                used = "✔️ Использован" if row["used_by"] else "⏳ Доступен"
                expires = "после активации"

                response += (
                    f"🔑 {row['key']}\n"
                    f"   Статус: {status}\n"
                    f"   Используется: {used}\n"
                    f"   Истекает: {expires}\n"
                    f"   Создан: {row['created_at']}\n\n"
                )

            bot.send_message(message.chat.id, response)
        except Exception as error:
            bot.send_message(
                message.chat.id,
                f"❌ Ошибка при получении ключей: {error}",
            )

    @bot.callback_query_handler(func=lambda call: call.data == "pay")
    def handle_payment(call):
        try:
            prices = [types.LabeledPrice(label="Премиум подписка", amount=1)]

            bot.send_invoice(
                call.from_user.id,
                title="Премиум подписка doATOM",
                description="Доступ к ИИ-ментору для подготовки к экзаменам на 30 дней",
                invoice_payload="premium_subscription",
                provider_token="",
                currency="XTR",
                prices=prices,
                is_flexible=False,
            )
        except Exception as error:
            bot.send_message(
                call.from_user.id,
                f"❌ Ошибка при инициации платежа: {error}",
            )

    @bot.pre_checkout_query_handler(func=lambda query: True)
    def checkout(pre_checkout_query):
        bot.answer_pre_checkout_query(pre_checkout_query.id, ok=True)

    @bot.message_handler(content_types=["successful_payment"])
    def handle_successful_payment(message):
        try:
            with connect() as conn:
                key = make_premium_key(conn, 30)

            bot.send_message(
                message.chat.id,
                "✅ Спасибо за оплату!\n\n"
                "🎉 Ваш ключ премиум подписки готов!\n\n"
                f"🔑 Ваш ключ активации:\n`{key}`\n\n"
                "📝 Как активировать:\n"
                "1. Откройте приложение doATOM\n"
                "2. Перейдите в профиль\n"
                "3. Вставьте ключ в раздел «Премиум подписка»\n"
                "4. Нажмите «Активировать»\n\n"
                "✨ После активации откроется доступ к ИИ-ментору!",
                parse_mode="Markdown",
            )
        except Exception as error:
            bot.send_message(
                message.chat.id,
                f"❌ Ошибка при генерации ключа: {error}\n\n"
                "Пожалуйста, обратитесь в поддержку.",
            )

    @bot.message_handler(commands=["pay"])
    def pay_command(message):
        handle_payment(
            types.CallbackQuery(
                id="0",
                from_user=message.from_user,
                chat_instance="0",
                data="pay",
            )
        )

    def polling():
        print("Telegram-бот ДуАТОМ запущен вместе с Flask backend")
        try:
            bot.infinity_polling(skip_pending=True, timeout=30, long_polling_timeout=30)
        except Exception as exc:
            print(f"Telegram-бот остановлен: {exc}")

    threading.Thread(target=polling, name="duatom-telegram-bot", daemon=True).start()
    return True


init_db()

if __name__ == "__main__":
    start_telegram_bot()
    app.run(
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "5001")),
        debug=os.getenv("DEBUG", "true").lower() in {"1", "true", "yes", "on"},
        use_reloader=False,
    )
