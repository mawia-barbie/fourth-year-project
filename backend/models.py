from sqlalchemy import Column, Integer, String, Boolean
from database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="user")
    is_approved = Column(Boolean, default=False)
    is_rejected = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)
    address = Column(String, nullable=True)

class Software(Base):
    __tablename__ = "software"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    version = Column(String)
    hash = Column(String, unique=True, index=True)
    developer_email = Column(String)
    is_approved = Column(Boolean, default=False)
    is_rejected = Column(Boolean, default=False)