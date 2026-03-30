import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    redis_url: str = "redis://localhost:6379"
    vlr_base_url: str = "https://www.vlr.gg/stats"
    rate_limit_rps: float = 1.0
    cache_ttl: int = 900  # 15 minutes
    fetch_timeout: float = 8.0
    fetch_retries: int = 2
    lock_ttl: int = 10

    class Config:
        env_file = ".env"


settings = Settings()
