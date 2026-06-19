from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    DATABASE_URL: str = "postgresql+asyncpg://docuflow:docuflow@localhost:5432/docuflow"
    REDIS_URL: str = "redis://localhost:6379/0"

    SECRET_KEY: str = "change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Optional dedicated key for encrypting secrets at rest (connector configs,
    # AI API keys). Falls back to ``SECRET_KEY`` when left empty so existing
    # deployments keep working — see ``encryption_secret``.
    ENCRYPTION_KEY: str = ""

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "docuflow"
    MINIO_SECURE: bool = False

    SUPER_ADMIN_EMAIL: str = "admin@docuflow.io"

    # Public URL of the web client. Used to lock down CORS in production.
    FRONTEND_URL: str = "http://localhost:5173"

    DEBUG: bool = True

    @property
    def encryption_secret(self) -> str:
        """Key used for symmetric encryption of secrets at rest."""
        return self.ENCRYPTION_KEY or self.SECRET_KEY

    @property
    def cors_origins(self) -> list[str]:
        """Allowed CORS origins. Open in debug, locked to the client in prod."""
        if self.DEBUG:
            return ["*"]
        return [self.FRONTEND_URL]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
