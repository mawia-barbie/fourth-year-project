# from fastapi import FastAPI, HTTPException, Depends
# from fastapi.security import OAuth2PasswordBearer
# from fastapi.middleware.cors import CORSMiddleware
# from sqlalchemy.orm import Session
# from pydantic import BaseModel
# import models
# from database import SessionLocal, engine
# import bcrypt
# import jwt
# import random
# import string
# import aiosmtplib
# from email.message import EmailMessage
# from dotenv import load_dotenv
# import os
# import logging

# # Configure logging
# logging.basicConfig(level=logging.INFO)
# logger = logging.getLogger(__name__)

# # Load environment variables
# load_dotenv()

# # Create FastAPI app
# app = FastAPI()

# # Create database tables
# try:
#     models.Base.metadata.create_all(bind=engine)
#     logger.info("Database tables created successfully")
# except Exception as e:
#     logger.error(f"Failed to create database tables: {e}")
#     raise

# # Add CORS middleware
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:5174"],  # Updated to match frontend port
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # JWT settings
# JWT_SECRET = os.getenv("JWT_SECRET")
# if not JWT_SECRET:
#     logger.error("JWT_SECRET not set in .env file")
#     raise ValueError("JWT_SECRET must be set in .env file")
# ALGORITHM = "HS256"

# # SMTP settings
# SMTP_HOST = os.getenv("SMTP_HOST")
# SMTP_PORT = os.getenv("SMTP_PORT")
# SMTP_USERNAME = os.getenv("SMTP_USERNAME")
# SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
# if not all([SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD]):
#     logger.error("SMTP settings incomplete in .env file")
#     raise ValueError("SMTP settings must be set in .env file")
# SMTP_PORT = int(SMTP_PORT)

# # Dependency for database sessions
# def get_db():
#     db = SessionLocal()
#     try:
#         yield db
#     finally:
#         db.close()

# # OAuth2PasswordBearer for token-based authentication
# oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# # Pydantic models for request validation
# class UserLogin(BaseModel):
#     email: str
#     password: str

# class UserRegister(BaseModel):
#     email: str
#     password: str

# class OtpVerify(BaseModel):
#     email: str
#     otp: str

# # OTP storage (in-memory for development; use Redis in production)
# otp_store = {}

# # Function to send OTP via email
# async def send_otp_email(email: str, otp: str):
#     message = EmailMessage()
#     message.set_content(f"Your OTP is {otp}. It expires in 5 minutes.")
#     message["Subject"] = "Cracked Software Detection System OTP"
#     message["From"] = SMTP_USERNAME
#     message["To"] = email

#     try:
#         await aiosmtplib.send(
#             message,
#             hostname=SMTP_HOST,
#             port=SMTP_PORT,
#             username=SMTP_USERNAME,
#             password=SMTP_PASSWORD,
#             use_tls=True,
#         )
#         logger.info(f"OTP email sent to {email}")
#     except Exception as e:
#         logger.error(f"Failed to send OTP email to {email}: {e}")
#         raise

# # Endpoint for user registration
# @app.post("/register")
# async def register(user: UserRegister, db: Session = Depends(get_db)):
#     logger.info(f"Register attempt for email: {user.email}")
#     # Validate email
#     if not user.email or not user.email.strip():
#         logger.warning("Registration failed: Email is required")
#         raise HTTPException(status_code=400, detail="Email is required")
    
#     # Validate password
#     if not user.password or len(user.password) < 8 or not any(c.isupper() for c in user.password) or \
#        not any(c.isdigit() for c in user.password) or not any(c in "!@#$%^&*" for c in user.password):
#         logger.warning("Registration failed: Invalid password format")
#         raise HTTPException(status_code=400, detail="Password must be 8+ characters with 1 uppercase, 1 number, 1 special character")

#     # Check if email exists
#     db_user = db.query(models.User).filter(models.User.email == user.email).first()
#     if db_user:
#         logger.warning(f"Registration failed: Email {user.email} already registered")
#         raise HTTPException(status_code=400, detail="Email already registered")

#     # Hash password
#     try:
#         hashed_password = bcrypt.hashpw(user.password.encode(), bcrypt.gensalt()).decode()
#     except Exception as e:
#         logger.error(f"Password hashing failed: {e}")
#         raise HTTPException(status_code=500, detail="Password hashing failed")

#     # Create user
#     try:
#         db_user = models.User(
#             email=user.email,
#             hashed_password=hashed_password
#         )
#         db.add(db_user)
#         db.commit()
#         db.refresh(db_user)
#         logger.info(f"User registered successfully: {user.email}")
#     except Exception as e:
#         logger.error(f"Database error during registration: {e}")
#         raise HTTPException(status_code=500, detail="Database error")

#     return {"message": "User registered successfully"}

# # Endpoint for user login
# @app.post("/login")
# async def login(user: UserLogin, db: Session = Depends(get_db)):
#     logger.info(f"Login attempt for email: {user.email}")
#     db_user = db.query(models.User).filter(models.User.email == user.email).first()
#     if not db_user or not bcrypt.checkpw(user.password.encode(), db_user.hashed_password.encode()):
#         logger.warning(f"Login failed for {user.email}: Invalid credentials")
#         raise HTTPException(status_code=401, detail="Invalid email or password")

#     # Generate and store OTP
#     otp = ''.join(random.choices(string.digits, k=6))
#     otp_store[user.email] = otp

#     # Send OTP email
#     try:
#         await send_otp_email(user.email, otp)
#     except Exception as e:
#         logger.error(f"Failed to send OTP for {user.email}: {e}")
#         raise HTTPException(status_code=500, detail="Failed to send OTP")

#     return {"message": "OTP sent to your email"}

# # Endpoint for OTP verification
# @app.post("/verify-otp")
# async def verify_otp(data: OtpVerify):
#     logger.info(f"OTP verification attempt for email: {data.email}")
#     stored_otp = otp_store.get(data.email)
#     if not stored_otp or stored_otp != data.otp:
#         logger.warning(f"OTP verification failed for {data.email}: Invalid OTP")
#         raise HTTPException(status_code=401, detail="Invalid OTP")

#     # Generate JWT token
#     try:
#         token = jwt.encode({"email": data.email}, JWT_SECRET, algorithm=ALGORITHM)
#     except Exception as e:
#         logger.error(f"JWT encoding failed: {e}")
#         raise HTTPException(status_code=500, detail="JWT encoding failed")

#     # Clear OTP
#     otp_store.pop(data.email, None)
#     logger.info(f"OTP verified and token issued for {data.email}")

#     return {"access_token": token, "token_type": "bearer"}



from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
import models
from database import SessionLocal, engine
import bcrypt
import jwt as pyjwt  # Explicitly import pyjwt to avoid conflicts
import random
import string
import aiosmtplib
from email.message import EmailMessage
from dotenv import load_dotenv
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Create FastAPI app
app = FastAPI()

# Create database tables
try:
    models.Base.metadata.create_all(bind=engine)
    logger.info("Database tables created successfully")
except Exception as e:
    logger.error(f"Failed to create database tables: {e}")
    raise

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Matches frontend port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# JWT settings
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    logger.error("JWT_SECRET not set in .env file")
    raise ValueError("JWT_SECRET must be set in .env file")
ALGORITHM = "HS256"

# SMTP settings
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = os.getenv("SMTP_PORT")
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
if not all([SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD]):
    logger.error("SMTP settings incomplete in .env file")
    raise ValueError("SMTP settings must be set in .env file")
SMTP_PORT = int(SMTP_PORT)

# Dependency for database sessions
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# OAuth2PasswordBearer for token-based authentication
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# Pydantic models for request validation
class UserLogin(BaseModel):
    email: str
    password: str

class UserRegister(BaseModel):
    email: str
    password: str

class OtpVerify(BaseModel):
    email: str
    otp: str

# OTP storage (in-memory for development; use Redis in production)
otp_store = {}

# Function to send OTP via email
async def send_otp_email(email: str, otp: str):
    message = EmailMessage()
    message.set_content(f"Your OTP is {otp}. It expires in 5 minutes.")
    message["Subject"] = "Cracked Software Detection System OTP"
    message["From"] = SMTP_USERNAME
    message["To"] = email

    try:
        await aiosmtplib.send(
            message,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USERNAME,
            password=SMTP_PASSWORD,
            use_tls=True,
        )
        logger.info(f"OTP email sent to {email}")
    except Exception as e:
        logger.error(f"Failed to send OTP email to {email}: {e}")
        raise

# Endpoint for user registration
@app.post("/register")
async def register(user: UserRegister, db: Session = Depends(get_db)):
    logger.info(f"Register attempt for email: {user.email}")
    # Validate email
    if not user.email or not user.email.strip():
        logger.warning("Registration failed: Email is required")
        raise HTTPException(status_code=400, detail="Email is required")
    
    # Validate password
    if not user.password or len(user.password) < 8 or not any(c.isupper() for c in user.password) or \
       not any(c.isdigit() for c in user.password) or not any(c in "!@#$%^&*" for c in user.password):
        logger.warning("Registration failed: Invalid password format")
        raise HTTPException(status_code=400, detail="Password must be 8+ characters with 1 uppercase, 1 number, 1 special character")

    # Check if email exists
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        logger.warning(f"Registration failed: Email {user.email} already registered")
        raise HTTPException(status_code=400, detail="Email already registered")

    # Hash password
    try:
        hashed_password = bcrypt.hashpw(user.password.encode(), bcrypt.gensalt()).decode()
    except Exception as e:
        logger.error(f"Password hashing failed: {e}")
        raise HTTPException(status_code=500, detail="Password hashing failed")

    # Create user
    try:
        db_user = models.User(
            email=user.email,
            hashed_password=hashed_password
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        logger.info(f"User registered successfully: {user.email}")
    except Exception as e:
        logger.error(f"Database error during registration: {e}")
        raise HTTPException(status_code=500, detail="Database error")

    return {"message": "User registered successfully"}

# Endpoint for user login
@app.post("/login")
async def login(user: UserLogin, db: Session = Depends(get_db)):
    logger.info(f"Login attempt for email: {user.email}")
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if not db_user or not bcrypt.checkpw(user.password.encode(), db_user.hashed_password.encode()):
        logger.warning(f"Login failed for {user.email}: Invalid credentials")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Generate and store OTP
    otp = ''.join(random.choices(string.digits, k=6))
    otp_store[user.email] = otp

    # Send OTP email
    try:
        await send_otp_email(user.email, otp)
    except Exception as e:
        logger.error(f"Failed to send OTP for {user.email}: {e}")
        raise HTTPException(status_code=500, detail="Failed to send OTP")

    return {"message": "OTP sent to your email"}

# Endpoint for OTP verification
@app.post("/verify-otp")
async def verify_otp(data: OtpVerify):
    logger.info(f"OTP verification attempt for email: {data.email}")
    stored_otp = otp_store.get(data.email)
    if not stored_otp or stored_otp != data.otp:
        logger.warning(f"OTP verification failed for {data.email}: Invalid OTP")
        raise HTTPException(status_code=401, detail="Invalid OTP")

    # Generate JWT token
    try:
        token = pyjwt.encode({"email": data.email}, JWT_SECRET, algorithm=ALGORITHM)
    except Exception as e:
        logger.error(f"JWT encoding failed: {e}")
        raise HTTPException(status_code=500, detail=f"JWT encoding failed: {str(e)}")

    # Clear OTP
    otp_store.pop(data.email, None)
    logger.info(f"OTP verified and token issued for {data.email}")

    return {"access_token": token, "token_type": "bearer"}