from __future__ import annotations

import json
from pathlib import Path

CONTENT_DIR = Path(__file__).resolve().parent / "content"


def main() -> None:
    lesson_keys: set[str] = set()
    question_keys: set[str] = set()
    lesson_count = card_count = question_count = 0
    rich_count = formula_count = example_count = code_count = 0

    for path in sorted((CONTENT_DIR / "courses").glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        subject = payload.get("subject") or {}
        assert subject.get("id") and subject.get("name"), f"Bad subject in {path}"
        for lesson in payload.get("lessons", []):
            key = lesson.get("key")
            assert key and key not in lesson_keys, f"Duplicate/missing lesson key: {key}"
            lesson_keys.add(key)
            lesson_count += 1
            cards = lesson.get("cards") or []
            assert cards, f"Lesson has no cards: {key}"
            for card in cards:
                source = card.get("source") or {}
                assert card.get("type") in {"intro", "theory", "recap"}, f"Bad card type in {key}"
                assert card.get("title") and card.get("text"), f"Empty card in {key}"
                assert source.get("title") and source.get("url"), f"Missing source in {key}"
                assert len(card.get("details") or []) >= 2, f"Flashcard needs key points in {key}"
                assert card.get("takeaway"), f"Flashcard needs takeaway in {key}"
                rich_count += 1
                formula_count += int(bool(card.get("formula")))
                example_count += int(bool(card.get("example")))
                code_count += int(bool(card.get("code")))
                card_count += 1

    for path in sorted((CONTENT_DIR / "questions").glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        assert payload.get("subjectId"), f"Missing subjectId in {path}"
        for item in payload.get("questions", []):
            key = item.get("key")
            assert key and key not in question_keys, f"Duplicate/missing question key: {key}"
            question_keys.add(key)
            assert len(item.get("answers", [])) >= 2, f"Not enough answers in {key}"
            assert 0 <= int(item.get("correctIndex", -1)) < len(item["answers"]), f"Bad correctIndex in {key}"
            question_count += 1

    assert rich_count == card_count, "Every flashcard should be rich"
    assert formula_count >= 70, f"Too few formula blocks: {formula_count}"
    assert example_count >= 80, f"Too few examples: {example_count}"
    assert code_count >= 10, f"Too few code examples: {code_count}"
    print(f"OK: {lesson_count} lessons, {card_count} rich flashcards, {formula_count} formulas, {example_count} examples, {code_count} code blocks, {question_count} questions")


if __name__ == "__main__":
    main()
