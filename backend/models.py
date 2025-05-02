from sqlalchemy import Column, Integer, String, Boolean, DateTime, func
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="user")  # 'user' or 'admin'
    is_approved = Column(Boolean, default=False)  # Admin approval status
    created_at = Column(DateTime, default=func.now())

class Software(Base):
    __tablename__ = "software"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    version = Column(String, nullable=False)
    hash = Column(String, unique=True, nullable=False)
    developer_email = Column(String, nullable=False)
    is_approved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())