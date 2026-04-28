from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    forge_host: str = "localhost"
    forge_port: int = 8421

    llamafactory_dir: Path = Path.home() / "LLaMA-Factory"
    llamacpp_dir: Path = Path.home() / "llama.cpp"

    datasets_dir: Path = Path.home() / "forge" / "datasets"
    models_dir: Path = Path.home() / "forge" / "models"
    jobs_dir: Path = Path.home() / "forge" / "jobs"

    huggingface_token: str = ""
    kaggle_username: str = ""
    kaggle_key: str = ""

    # Ollama
    ollama_base_url: str = "http://localhost:11434"

    # Frontend origin for CORS
    frontend_origin: str = "http://localhost:3004"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    def ensure_dirs(self) -> None:
        """Create all data directories if they do not exist."""
        for d in (self.datasets_dir, self.models_dir, self.jobs_dir):
            d.mkdir(parents=True, exist_ok=True)


settings = Settings()
