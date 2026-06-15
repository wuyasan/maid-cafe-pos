from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "Maid Cafe POS API"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/maid_cafe_pos"


settings = Settings()
