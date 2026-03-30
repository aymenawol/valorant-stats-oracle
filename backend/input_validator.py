import re

MAX_QUERY_LENGTH = 300

# Patterns that indicate injection attempts
_DANGEROUS_PATTERNS = [
    re.compile(r"<\s*script", re.IGNORECASE),
    re.compile(r"javascript\s*:", re.IGNORECASE),
    re.compile(r"on\w+\s*=", re.IGNORECASE),
    re.compile(r";\s*(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE)\b", re.IGNORECASE),
    re.compile(r"(--|/\*|\*/|xp_)", re.IGNORECASE),
]


class ValidationError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def validate_input(raw: str) -> str:
    """Validate and sanitize user input. Returns cleaned string or raises ValidationError."""
    if not raw or not raw.strip():
        raise ValidationError("Query is empty or malformed.")

    cleaned = raw.strip()

    if len(cleaned) > MAX_QUERY_LENGTH:
        raise ValidationError(
            f"Query exceeds {MAX_QUERY_LENGTH} character limit."
        )

    for pattern in _DANGEROUS_PATTERNS:
        if pattern.search(cleaned):
            raise ValidationError("Query is empty or malformed.")

    return cleaned
