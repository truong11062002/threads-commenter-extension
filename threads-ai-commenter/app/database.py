from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import DATABASE_URL
from app.models import Base

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)


def create_db_and_tables():
    Base.metadata.create_all(engine)


def get_session():
    with SessionLocal() as session:
        yield session
