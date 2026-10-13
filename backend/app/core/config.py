from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', protected_namespaces=('settings_',))

    database_url: str = 'sqlite:///./fraud_ops.db'
    cors_origins: str = 'http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:8000'
    model_version: str = 'xgboost_v1'
    demo_analyst_id: str = 'demo_analyst'

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(',') if o.strip()]

settings = Settings()
