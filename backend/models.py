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
    address = Column(String, nullable=True)  # Add address field for blockchain wallet


class Software(Base):
    __tablename__ = "software"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    version = Column(String)
    hash = Column(String, unique=True, index=True)
    developer_email = Column(String, index=True)
    is_approved = Column(Boolean, default=False)
    is_rejected = Column(Boolean, default=False)