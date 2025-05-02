from fastapi import FastAPI, HTTPException, Depends, File, UploadFile
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
import models
from database import SessionLocal, engine
import bcrypt
import jwt
import random
import string
import aiosmtplib
from email.message import EmailMessage
from dotenv import load_dotenv
import os
import logging
import hashlib

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
    allow_origins=["http://localhost:5173"],
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

class CreateAdminRequest(BaseModel):
    email: str
    password: str

class OtpVerify(BaseModel):
    email: str
    otp: str

# OTP storage (in-memory for development; use Redis in production)
otp_store = {}

# Function to send email
async def send_email(email: str, subject: str, content: str):
    message = EmailMessage()
    message.set_content(content)
    message["Subject"] = subject
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
        logger.info(f"Email sent to {email}")
    except Exception as e:
        logger.error(f"Failed to send email to {email}: {e}")
        raise

# Get current user from JWT
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        email: str = payload.get("email")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# Endpoint for user registration
@app.post("/register")
async def register(user: UserRegister, db: Session = Depends(get_db)):
    logger.info(f"Register attempt for email: {user.email}")
    if not user.email or not user.email.strip():
        logger.warning("Registration failed: Email is required")
        raise HTTPException(status_code=400, detail="Email is required")
    
    if not user.password or len(user.password) < 8 or not any(c.isupper() for c in user.password) or \
       not any(c.isdigit() for c in user.password) or not any(c in "!@#$%^&*" for c in user.password):
        logger.warning("Registration failed: Invalid password format")
        raise HTTPException(status_code=400, detail="Password must be 8+ characters with 1 uppercase, 1 number, 1 special character")

    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        logger.warning(f"Registration failed: Email {user.email} already registered")
        raise HTTPException(status_code=400, detail="Email already registered")

    try:
        hashed_password = bcrypt.hashpw(user.password.encode(), bcrypt.gensalt()).decode()
    except Exception as e:
        logger.error(f"Password hashing failed: {e}")
        raise HTTPException(status_code=500, detail="Password hashing failed")

    try:
        db_user = models.User(
            email=user.email,
            hashed_password=hashed_password,
            role="user",
            is_approved=False
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        logger.info(f"User registered successfully: {user.email}")
    except Exception as e:
        logger.error(f"Database error during registration: {e}")
        raise HTTPException(status_code=500, detail="Database error")

    try:
        await send_email(
            user.email,
            "Registration Pending Approval",
            "Your registration is pending admin approval. You will be notified once approved."
        )
    except Exception as e:
        logger.error(f"Failed to send pending approval email to {user.email}: {e}")
        logger.warning("Proceeding with registration despite email failure")

    return {"message": "Registration successful, awaiting admin approval"}

# Endpoint for user login
@app.post("/login")
async def login(user: UserLogin, db: Session = Depends(get_db)):
    logger.info(f"Login attempt for email: {user.email}")
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if not db_user or not bcrypt.checkpw(user.password.encode(), db_user.hashed_password.encode()):
        logger.warning(f"Login failed for {user.email}: Invalid credentials")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not db_user.is_approved:
        logger.warning(f"Login failed for {user.email}: Account not approved")
        raise HTTPException(status_code=403, detail="Account not approved by admin")

    otp = ''.join(random.choices(string.digits, k=6))
    otp_store[user.email] = otp

    try:
        await send_email(
            user.email,
            "Your OTP Code",
            f"Your OTP code is {otp}. It is valid for 5 minutes."
        )
    except Exception as e:
        logger.error(f"Failed to send OTP for {user.email}: {e}")
        raise HTTPException(status_code=500, detail="Failed to send OTP")

    return {"message": "OTP sent to your email"}

# Endpoint for OTP verification
@app.post("/verify-otp")
async def verify_otp(data: OtpVerify, db: Session = Depends(get_db)):
    logger.info(f"OTP verification attempt for email: {data.email}")
    stored_otp = otp_store.get(data.email)
    if not stored_otp or stored_otp != data.otp:
        logger.warning(f"OTP verification failed for {data.email}: Invalid OTP")
        raise HTTPException(status_code=401, detail="Invalid OTP")

    db_user = db.query(models.User).filter(models.User.email == data.email).first()
    if not db_user or not db_user.is_approved:
        logger.warning(f"OTP verification failed for {data.email}: User not approved")
        raise HTTPException(status_code=403, detail="Account not approved by admin")

    try:
        token = jwt.encode({"email": data.email, "role": db_user.role}, JWT_SECRET, algorithm=ALGORITHM)
    except Exception as e:
        logger.error(f"JWT encoding failed: {e}")
        raise HTTPException(status_code=500, detail=f"JWT encoding failed: {str(e)}")

    otp_store.pop(data.email, None)
    logger.info(f"OTP verified and token issued for {data.email}")

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": db_user.role  # Include role in response
    }

# Admin endpoints
@app.get("/admin/pending-users")
async def get_pending_users(current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        logger.warning(f"Unauthorized access to pending-users by {current_user.email}")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    db = SessionLocal()
    try:
        users = db.query(models.User).filter(models.User.is_approved == False).all()
        return {"pending_users": [{"email": user.email} for user in users]}
    finally:
        db.close()

@app.post("/admin/approve-user/{email}")
async def approve_user(email: str, current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        logger.warning(f"Unauthorized user approval attempt by {current_user.email}")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user.is_approved = True
        db.commit()
        logger.info(f"User {email} approved by {current_user.email}")
        
        try:
            await send_email(
                email,
                "Account Approved",
                "Your account has been approved. You can now log in to the system."
            )
        except Exception as e:
            logger.error(f"Failed to send approval email to {email}: {e}")
        
        return {"message": f"User {email} approved"}
    finally:
        db.close()

@app.post("/admin/reject-user/{email}")
async def reject_user(email: str, current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        logger.warning(f"Unauthorized user rejection attempt by {current_user.email}")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        db.delete(user)
        db.commit()
        logger.info(f"User {email} rejected by {current_user.email}")
        
        try:
            await send_email(
                email,
                "Account Rejected",
                "Your registration was rejected by the admin. Please contact support for more information."
            )
        except Exception as e:
            logger.error(f"Failed to send rejection email to {email}: {e}")
        
        return {"message": f"User {email} rejected"}
    finally:
        db.close()

@app.post("/admin/create-admin")
async def create_admin(admin_data: CreateAdminRequest, db: Session = Depends(get_db)):
    logger.info(f"Create admin attempt for email: {admin_data.email}")
    if not admin_data.email or not admin_data.email.strip():
        logger.warning("Admin creation failed: Email is required")
        raise HTTPException(status_code=400, detail="Email is required")

    if not admin_data.password or len(admin_data.password) < 8 or \
       not any(c.isupper() for c in admin_data.password) or \
       not any(c.isdigit() for c in admin_data.password) or \
       not any(c in "!@#$%^&*" for c in admin_data.password):
        logger.warning("Admin creation failed: Invalid password format")
        raise HTTPException(status_code=400, detail="Password must be 8+ characters with 1 uppercase, 1 number, 1 special character")

    db_user = db.query(models.User).filter(models.User.email == admin_data.email).first()
    if db_user:
        logger.warning(f"Admin creation failed: Email {admin_data.email} already registered")
        raise HTTPException(status_code=400, detail="Email already registered")

    try:
        hashed_password = bcrypt.hashpw(admin_data.password.encode(), bcrypt.gensalt()).decode()
    except Exception as e:
        logger.error(f"Password hashing failed: {e}")
        raise HTTPException(status_code=500, detail="Password hashing failed")

    try:
        db_admin = models.User(
            email=admin_data.email,
            hashed_password=hashed_password,
            role="admin",
            is_approved=True
        )
        db.add(db_admin)
        db.commit()
        db.refresh(db_admin)
        logger.info(f"Admin created successfully: {admin_data.email}")
    except Exception as e:
        logger.error(f"Database error during admin creation: {e}")
        raise HTTPException(status_code=500, detail="Database error")

    try:
        await send_email(
            admin_data.email,
            "Admin Account Created",
            f"Your admin account for the Software Cracking Detection System has been created. You can log in at http://localhost:5173/login using your email and password."
        )
    except Exception as e:
        logger.error(f"Failed to send admin confirmation email to {admin_data.email}: {e}")
        logger.warning("Proceeding with admin creation despite email failure")

    return {"message": f"Admin user {admin_data.email} created successfully"}

# Software endpoints
@app.post("/software/upload")
async def upload_software(
    name: str,
    version: str,
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user.is_approved:
        logger.warning(f"Unauthorized software upload by unapproved user {current_user.email}")
        raise HTTPException(status_code=403, detail="Account not approved")
    
    contents = await file.read()
    file_hash = hashlib.sha256(contents).hexdigest()
    
    existing_software = db.query(models.Software).filter(models.Software.hash == file_hash).first()
    if existing_software:
        logger.warning(f"Software upload failed: Hash {file_hash} already exists")
        raise HTTPException(status_code=400, detail="Software already exists")

    try:
        software = models.Software(
            name=name,
            version=version,
            hash=file_hash,
            developer_email=current_user.email,
            is_approved=False
        )
        db.add(software)
        db.commit()
        db.refresh(software)
        logger.info(f"Software {name} uploaded by {current_user.email}")
    except Exception as e:
        logger.error(f"Database error during software upload: {e}")
        raise HTTPException(status_code=500, detail="Database error")

    try:
        await send_email(
            "admin@example.com",
            "New Software Upload",
            f"Software {name} (version {version}) uploaded by {current_user.email} awaits approval."
        )
    except Exception as e:
        logger.error(f"Failed to send admin notification: {e}")

    return {"message": "Software uploaded, awaiting admin approval", "hash": file_hash}

@app.get("/software/approved")
async def get_approved_software(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_approved:
        logger.warning(f"Unauthorized access to approved software by {current_user.email}")
        raise HTTPException(status_code=403, detail="Account not approved")
    
    software = db.query(models.Software).filter(
        models.Software.developer_email == current_user.email,
        models.Software.is_approved == True
    ).all()
    return {"approved_software": [{"name": s.name, "version": s.version, "hash": s.hash} for s in software]}

@app.get("/admin/pending-software")
async def get_pending_software(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        logger.warning(f"Unauthorized access to pending-software by {current_user.email}")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    software = db.query(models.Software).filter(models.Software.is_approved == False).all()
    return {"pending_software": [{"name": s.name, "version": s.version, "hash": s.hash, "developer_email": s.developer_email} for s in software]}

@app.post("/admin/approve-software/{hash}")
async def approve_software(hash: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        logger.warning(f"Unauthorized software approval attempt by {current_user.email}")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    software = db.query(models.Software).filter(models -software.hash == hash).first()
    if not software:
        logger.warning(f"Software approval failed: Hash {hash} not found")
        raise HTTPException(status_code=404, detail="Software not found")
    
    software.is_approved = True
    db.commit()
    logger.info(f"Software {software.name} approved by {current_user.email}")
    
    try:
        await send_email(
            software.developer_email,
            "Software Approved",
            f"Your software {software.name} (version {software.version}) has been approved and can now be licensed."
        )
    except Exception as e:
        logger.error(f"Failed to send approval email to {software.developer_email}: {e}")
    
    return {"message": "Software approved"}

@app.post("/admin/reject-software/{hash}")
async def reject_software(hash: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        logger.warning(f"Unauthorized software rejection attempt by {current_user.email}")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    software = db.query(models.Software).filter(models.Software.hash == hash).first()
    if not software:
        logger.warning(f"Software rejection failed: Hash {hash} not found")
        raise HTTPException(status_code=404, detail="Software not found")
    
    db.delete(software)
    db.commit()
    logger.info(f"Software {software.name} rejected by {current_user.email}")
    
    try:
        await send_email(
            software.developer_email,
            "Software Rejected",
            f"Your software {software.name} (version {software.version}) was rejected. Please contact support for more information."
        )
    except Exception as e:
        logger.error(f"Failed to send rejection email to {software.developer_email}: {e}")
    
    return {"message": "Software rejected"}