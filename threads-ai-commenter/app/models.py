from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class GenerationLog(Base):
    __tablename__ = "app_generation_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String, index=True, nullable=False)
    tone = Column(String, nullable=False)
    page_url = Column(String, nullable=True)
    input_chars = Column(Integer, nullable=False)
    output_chars = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DevicePreference(Base):
    __tablename__ = "app_device_preferences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String, unique=True, index=True, nullable=False)
    user_voice = Column(Text, nullable=True)
    viral_strategy = Column(Text, nullable=True)
    use_viral_strategy = Column(Boolean, nullable=False, default=True, server_default="1")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
