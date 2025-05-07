from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, Form, status
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "*"],
)

# Log middleware initialization
logger.info("CORS middleware initialized with allow_origins: http://localhost:5173")

# Global exception handler to ensure CORS headers on errors
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
        headers={"Access-Control-Allow-Origin": "http://localhost:5173", "Access-Control-Allow-Credentials": "true"}
    )

# Create database tables
try:
    models.Base.metadata.create_all(bind=engine)
    logger.info("Database tables created successfully")
except Exception as e:
    logger.error(f"Failed to create database tables: {e}")
    raise

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
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="users/login")

# Pydantic models for request validation
class UserLogin(BaseModel):
    email: str
    password: str | None = None

class UserRegister(BaseModel):
    email: str
    password: str

class CreateAdminRequest(BaseModel):
    email: str
    password: str

class OtpVerify(BaseModel):
    email: str
    otp: str

class UserUpdate(BaseModel):
    address: str

class FeedbackRequest(BaseModel):
    email: str
    feedback: str

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
        role: str = payload.get("role")
        if email is None or role is None:
            logger.warning(f"Invalid token: Missing email or role. Payload: {payload}")
            raise HTTPException(status_code=401, detail="Invalid token: Missing email or role")
        logger.info(f"Token decoded successfully: email={email}, role={role}")
    except jwt.PyJWTError as e:
        logger.warning(f"JWT decode error: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        logger.warning(f"User not found for email: {email}")
        raise HTTPException(status_code=401, detail="User not found")
    if user.role != role:
        logger.warning(f"Role mismatch for {email}: token_role={role}, db_role={user.role}")
        raise HTTPException(status_code=403, detail="Role mismatch")
    return user

# Endpoint for user registration
@app.post("/users/register")
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
            is_approved=False,
            is_rejected=False,
            is_archived=False
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
@app.post("/users/login")
async def login(user: UserLogin, db: Session = Depends(get_db)):
    logger.info(f"Login attempt for email: {user.email}")
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    
    if not db_user:
        logger.warning(f"Login failed for {user.email}: User not found")
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.password and not bcrypt.checkpw(user.password.encode(), db_user.hashed_password.encode()):
        logger.warning(f"Login failed for {user.email}: Invalid password")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not db_user.is_approved or db_user.is_rejected or db_user.is_archived:
        logger.warning(f"Login failed for {user.email}: Account not found")
        raise HTTPException(status_code=403, detail="Account not found")

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

# Endpoint for resending OTP
@app.post("/users/resend-otp")
async def resend_otp(email: str, db: Session = Depends(get_db)):
    logger.info(f"Resend OTP attempt for email: {email}")
    db_user = db.query(models.User).filter(models.User.email == email).first()
    if not db_user:
        logger.warning(f"Resend OTP failed: {email} not found")
        raise HTTPException(status_code=404, detail="User not found")
    
    if not db_user.is_approved or db_user.is_rejected or db_user.is_archived:
        logger.warning(f"Resend OTP failed for {email}: Account not approved, rejected, or archived")
        raise HTTPException(status_code=403, detail="Account not approved, rejected, or archived")

    otp = ''.join(random.choices(string.digits, k=6))
    otp_store[email] = otp

    try:
        await send_email(
            email,
            "Your OTP Code",
            f"Your OTP code is {otp}. It is valid for 5 minutes."
        )
        logger.info(f"OTP resent to {email}")
        return {"message": "OTP resent to your email"}
    except Exception as e:
        logger.error(f"Failed to send OTP for {email}: {e}")
        raise HTTPException(status_code=500, detail="Failed to resend OTP")

# Endpoint for OTP verification
@app.post("/users/verify-otp")
async def verify_otp(data: OtpVerify, db: Session = Depends(get_db)):
    logger.info(f"OTP verification attempt for email: {data.email}")
    stored_otp = otp_store.get(data.email)
    if not stored_otp or stored_otp != data.otp:
        logger.warning(f"OTP verification failed for {data.email}: Invalid OTP")
        raise HTTPException(status_code=401, detail="Invalid OTP")

    db_user = db.query(models.User).filter(models.User.email == data.email).first()
    if not db_user or not db_user.is_approved or db_user.is_rejected or db_user.is_archived:
        logger.warning(f"OTP verification failed for {data.email}: User not approved, rejected, or archived")
        raise HTTPException(status_code=403, detail="Account not approved, rejected, or archived")

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
        "role": db_user.role
    }

# Endpoint to get current user
@app.get("/users/me")
async def get_current_user_endpoint(current_user: models.User = Depends(get_current_user)):
    return {
        "email": current_user.email,
        "role": current_user.role,
        "is_approved": current_user.is_approved,
        "is_rejected": current_user.is_rejected,
        "is_archived": current_user.is_archived,
        "address": current_user.address
    }

# Endpoint to update user address
@app.patch("/users/update-address")
async def update_user_address(
    data: UserUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    logger.info(f"Updating address for user {current_user.email}")
    try:
        if not data.address:
            logger.warning(f"Address update failed for {current_user.email}: Address is empty")
            raise HTTPException(status_code=400, detail="Address cannot be empty")
        current_user.address = data.address
        db.commit()
        db.refresh(current_user)
        logger.info(f"Address updated for {current_user.email}: {data.address}")
        return {"message": "Address updated successfully"}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Database error during address update for {current_user.email}: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# Admin endpoints
@app.get("/admin/pending-users")
async def get_pending_users(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"Fetching pending users by {current_user.email}")
    if current_user.role != "admin":
        logger.warning(f"Unauthorized access to pending-users by {current_user.email} (role: {current_user.role})")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        users = db.query(models.User).filter(
            models.User.is_approved == False,
            models.User.is_rejected == False,
            models.User.is_archived == False
        ).all()
        logger.info(f"Retrieved {len(users)} pending users: {[user.email for user in users]}")
        return {"pending_users": [{"email": user.email, "role": user.role} for user in users]}
    except Exception as e:
        logger.error(f"Database error in get_pending_users: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/admin/accepted-users")
async def get_accepted_users(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"Fetching accepted users by {current_user.email}")
    if current_user.role != "admin":
        logger.warning(f"Unauthorized access to accepted-users by {current_user.email} (role: {current_user.role})")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        users = db.query(models.User).filter(
            models.User.is_approved == True,
            models.User.is_archived == False
        ).all()
        logger.info(f"Retrieved {len(users)} accepted users: {[user.email for user in users]}")
        return {"accepted_users": [{"email": user.email, "role": user.role} for user in users]}
    except Exception as e:
        logger.error(f"Database error in get_accepted_users: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/admin/rejected-users")
async def get_rejected_users(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"Fetching rejected users by {current_user.email}")
    if current_user.role != "admin":
        logger.warning(f"Unauthorized access to rejected-users by {current_user.email} (role: {current_user.role})")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        users = db.query(models.User).filter(
            models.User.is_rejected == True,
            models.User.is_archived == False
        ).all()
        logger.info(f"Retrieved {len(users)} rejected users: {[user.email for user in users]}")
        return {"rejected_users": [{"email": user.email, "role": user.role} for user in users]}
    except Exception as e:
        logger.error(f"Database error in get_rejected_users: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/admin/archived-users")
async def get_archived_users(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"Fetching archived users by {current_user.email}")
    if current_user.role != "admin":
        logger.warning(f"Unauthorized access to archived-users by {current_user.email} (role: {current_user.role})")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        users = db.query(models.User).filter(
            models.User.is_archived == True
        ).all()
        logger.info(f"Retrieved {len(users)} archived users: {[user.email for user in users]}")
        return {"archived_users": [{"email": user.email, "role": user.role} for user in users]}
    except Exception as e:
        logger.error(f"Database error in get_archived_users: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/admin/approve-user/{email}")
async def approve_user(email: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"User approval attempt for {email} by {current_user.email}")
    if current_user.role != "admin":
        logger.warning(f"Unauthorized user approval attempt by {current_user.email}")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            logger.warning(f"User approval failed: {email} not found")
            raise HTTPException(status_code=404, detail="User not found")
        if user.is_approved:
            logger.warning(f"User approval failed: {email} already approved")
            raise HTTPException(status_code=400, detail="User already approved")
        if user.is_archived:
            logger.warning(f"User approval failed: {email} is archived")
            raise HTTPException(status_code=400, detail="User is archived")
        
        user.is_approved = True
        user.is_rejected = False
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
            logger.warning("Proceeding with user approval despite email failure")
        
        return {"message": f"User {email} approved"}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Database error during user approval for {email}: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/admin/reject-user/{email}")
async def reject_user(email: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"User rejection attempt for {email} by {current_user.email}")
    if current_user.role != "admin":
        logger.warning(f"Unauthorized user rejection attempt by {current_user.email}")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            logger.warning(f"User rejection failed: {email} not found")
            raise HTTPException(status_code=404, detail="User not found")
        if user.is_rejected:
            logger.warning(f"User rejection failed: {email} already rejected")
            raise HTTPException(status_code=400, detail="User already rejected")
        if user.is_archived:
            logger.warning(f"User rejection failed: {email} is archived")
            raise HTTPException(status_code=400, detail="User is archived")
        
        user.is_rejected = True
        user.is_approved = False
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
            logger.warning("Proceeding with user rejection despite email failure")
        
        return {"message": f"User {email} rejected"}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Database error during user rejection for {email}: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/admin/archive-user/{email}")
async def archive_user(email: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"User archive attempt for {email} by {current_user.email}")
    if current_user.role != "admin":
        logger.warning(f"Unauthorized user archive attempt by {current_user.email}")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            logger.warning(f"User archive failed: {email} not found")
            raise HTTPException(status_code=404, detail="User not found")
        if user.is_archived:
            logger.warning(f"User archive failed: {email} already archived")
            raise HTTPException(status_code=400, detail="User already archived")
        if user.role == "admin":
            logger.warning(f"User archive failed: Cannot archive admin user {email}")
            raise HTTPException(status_code=400, detail="Cannot archive admin user")
        
        user.is_archived = True
        db.commit()
        logger.info(f"User {email} archived by {current_user.email}")
        
        try:
            await send_email(
                email,
                "Account Archived",
                "Your account has been archived by the admin. Please contact support for more information."
            )
        except Exception as e:
            logger.error(f"Failed to send archive email to {email}: {e}")
            logger.warning("Proceeding with user archive despite email failure")
        
        return {"message": f"User {email} archived"}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Database error during user archive for {email}: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/admin/unarchive-user/{email}")
async def unarchive_user(email: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"User unarchive attempt for {email} by {current_user.email}")
    if current_user.role != "admin":
        logger.warning(f"Unauthorized user unarchive attempt by {current_user.email}")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            logger.warning(f"User unarchive failed: {email} not found")
            raise HTTPException(status_code=404, detail="User not found")
        if not user.is_archived:
            logger.warning(f"User unarchive failed: {email} not archived")
            raise HTTPException(status_code=400, detail="User is not archived")
        
        user.is_archived = False
        db.commit()
        logger.info(f"User {email} unarchived by {current_user.email}")
        
        try:
            await send_email(
                email,
                "Account Unarchived",
                "Your account has been unarchived by the admin. You can now log in to the system."
            )
        except Exception as e:
            logger.error(f"Failed to send unarchive email to {email}: {e}")
            logger.warning("Proceeding with user unarchive despite email failure")
        
        return {"message": f"User {email} unarchived"}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Database error during user unarchive for {email}: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/admin/feedback")
async def submit_feedback(feedback: FeedbackRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"Feedback submission attempt from {feedback.email} by {current_user.email}")
    if current_user.role != "admin":
        logger.warning(f"Unauthorized feedback submission attempt by {current_user.email}")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        await send_email(
            "admin@example.com",
            "New Feedback Submission",
            f"Feedback from {feedback.email}:\n\n{feedback.feedback}"
        )
        logger.info(f"Feedback email sent to admin@example.com")
        return {"message": "Feedback submitted successfully"}
    except Exception as e:
        logger.error(f"Failed to send feedback email: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send feedback email: {str(e)}")

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
            is_approved=True,
            is_rejected=False,
            is_archived=False
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
    name: str = Form(...),
    version: str = Form(...),
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    logger.info(f"Received upload request: name={name}, version={version}, file={file.filename}")
    if not current_user.is_approved or current_user.is_rejected or current_user.is_archived:
        logger.warning(f"Unauthorized software upload by unapproved/rejected/archived user {current_user.email}")
        raise HTTPException(status_code=403, detail="Account not approved, rejected, or archived")
    
    contents = await file.read()
    file_hash = hashlib.sha256(contents).hexdigest()
    
    try:
        existing_software = db.query(models.Software).filter(models.Software.hash == file_hash).first()
        if existing_software:
            logger.warning(f"Software upload failed: Hash {file_hash} already exists")
            raise HTTPException(status_code=400, detail="Software already exists")

        software = models.Software(
            name=name,
            version=version,
            hash=file_hash,
            developer_email=current_user.email,
            is_approved=False,
            is_rejected=False
        )
        db.add(software)
        db.commit()
        db.refresh(software)
        logger.info(f"Software {name} uploaded by {current_user.email}")
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Database error during software upload: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    try:
        await send_email(
            "admin@example.com",
            "New Software Upload",
            f"Software {name} (version {version}) uploaded by {current_user.email} awaits approval."
        )
    except Exception as e:
        logger.error(f"Failed to send admin notification: {e}")
        logger.warning("Proceeding with software upload despite email failure")

    return {"message": "Software uploaded, awaiting admin approval", "hash": file_hash}

@app.get("/software/pending")
async def get_pending_software_user(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"Fetching pending software for {current_user.email}")
    if not current_user.is_approved or current_user.is_rejected or current_user.is_archived:
        logger.warning(f"Unauthorized access to pending software by {current_user.email}")
        raise HTTPException(status_code=403, detail="Account not approved, rejected, or archived")
    
    try:
        software = db.query(models.Software).filter(
            models.Software.developer_email == current_user.email,
            models.Software.is_approved == False,
            models.Software.is_rejected == False
        ).all()
        logger.info(f"Retrieved {len(software)} pending software items for {current_user.email}")
        return {"pending_software": [{"name": s.name, "version": s.version, "hash": s.hash} for s in software]}
    except Exception as e:
        logger.error(f"Database error in get_pending_software_user: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/software/approved")
async def get_approved_software(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"Fetching approved software for {current_user.email}")
    if not current_user.is_approved or current_user.is_rejected or current_user.is_archived:
        logger.warning(f"Unauthorized access to approved software by {current_user.email}")
        raise HTTPException(status_code=403, detail="Account not approved, rejected, or archived")
    
    try:
        software = db.query(models.Software).filter(
            models.Software.developer_email == current_user.email,
            models.Software.is_approved == True,
            models.Software.is_rejected == False
        ).all()
        logger.info(f"Retrieved {len(software)} approved software items for {current_user.email}")
        return {"approved_software": [{"name": s.name, "version": s.version, "hash": s.hash} for s in software]}
    except Exception as e:
        logger.error(f"Database error in get_approved_software: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/software/rejected")
async def get_rejected_software(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"Fetching rejected software for {current_user.email}")
    if not current_user.is_approved or current_user.is_rejected or current_user.is_archived:
        logger.warning(f"Unauthorized access to rejected software by {current_user.email}")
        raise HTTPException(status_code=403, detail="Account not approved, rejected, or archived")
    
    try:
        software = db.query(models.Software).filter(
            models.Software.developer_email == current_user.email,
            models.Software.is_rejected == True
        ).all()
        logger.info(f"Retrieved {len(software)} rejected software items for {current_user.email}")
        return {"rejected_software": [{"name": s.name, "version": s.version, "hash": s.hash} for s in software]}
    except Exception as e:
        logger.error(f"Database error in get_rejected_software: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/software/all-approved")
async def get_all_approved_software(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"Fetching all approved software for {current_user.email}")
    if not current_user.is_approved or current_user.is_rejected or current_user.is_archived:
        logger.warning(f"Unauthorized access to all approved software by {current_user.email}")
        raise HTTPException(status_code=403, detail="Account not approved, rejected, or archived")
    
    try:
        software = db.query(models.Software).filter(
            models.Software.is_approved == True,
            models.Software.is_rejected == False
        ).all()
        logger.info(f"Retrieved {len(software)} all approved software items")
        return {"all_approved_software": [{"name": s.name, "version": s.version, "hash": s.hash, "developer_email": s.developer_email} for s in software]}
    except Exception as e:
        logger.error(f"Database error in get_all_approved_software: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/admin/pending-software")
async def get_pending_software(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"Fetching pending software by {current_user.email}")
    if current_user.role != "admin":
        logger.warning(f"Unauthorized access to pending-software by {current_user.email}")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        software = db.query(models.Software).filter(
            models.Software.is_approved == False,
            models.Software.is_rejected == False
        ).all()
        logger.info(f"Retrieved {len(software)} pending software items")
        return {"pending_software": [{"name": s.name, "version": s.version, "hash": s.hash, "developer_email": s.developer_email} for s in software]}
    except Exception as e:
        logger.error(f"Database error in get_pending_software: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/admin/accepted-software")
async def get_accepted_software(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"Fetching accepted software by {current_user.email}")
    if current_user.role != "admin":
        logger.warning(f"Unauthorized access to accepted-software by {current_user.email}")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        software = db.query(models.Software).filter(
            models.Software.is_approved == True,
            models.Software.is_rejected == False
        ).all()
        logger.info(f"Retrieved {len(software)} accepted software items")
        return {"accepted_software": [{"name": s.name, "version": s.version, "hash": s.hash, "developer_email": s.developer_email} for s in software]}
    except Exception as e:
        logger.error(f"Database error in get_accepted_software: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/admin/rejected-software")
async def get_rejected_software(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"Fetching rejected software by {current_user.email}")
    if current_user.role != "admin":
        logger.warning(f"Unauthorized access to rejected-software by {current_user.email}")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        software = db.query(models.Software).filter(
            models.Software.is_rejected == True
        ).all()
        logger.info(f"Retrieved {len(software)} rejected software items")
        return {"rejected_software": [{"name": s.name, "version": s.version, "hash": s.hash, "developer_email": s.developer_email} for s in software]}
    except Exception as e:
        logger.error(f"Database error in get_rejected_software: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/admin/approve-software/{hash}")
async def approve_software(hash: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"Software approval attempt for hash {hash} by {current_user.email}")
    if current_user.role != "admin":
        logger.warning(f"Unauthorized software approval attempt by {current_user.email}")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        software = db.query(models.Software).filter(models.Software.hash == hash).first()
        if not software:
            logger.warning(f"Software approval failed: Hash {hash} not found")
            raise HTTPException(status_code=404, detail="Software not found")
        
        if software.is_approved:
            logger.warning(f"Software approval failed: Hash {hash} already approved")
            raise HTTPException(status_code=400, detail="Software already approved")
        
        if software.is_rejected:
            logger.warning(f"Software approval failed: Hash {hash} is rejected")
            raise HTTPException(status_code=400, detail="Software is rejected")
        
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
            logger.warning("Proceeding with software approval despite email failure")
        
        return {"message": "Software approved"}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Database error during software approval for hash {hash}: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/admin/reject-software/{hash}")
async def reject_software(hash: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"Software rejection attempt for hash {hash} by {current_user.email}")
    if current_user.role != "admin":
        logger.warning(f"Unauthorized software rejection attempt by {current_user.email}")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        software = db.query(models.Software).filter(models.Software.hash == hash).first()
        if not software:
            logger.warning(f"Software rejection failed: Hash {hash} not found")
            raise HTTPException(status_code=404, detail="Software not found")
        
        if software.is_approved:
            logger.warning(f"Software rejection failed: Hash {hash} already approved")
            raise HTTPException(status_code=400, detail="Software already approved")
        
        if software.is_rejected:
            logger.warning(f"Software rejection failed: Hash {hash} already rejected")
            raise HTTPException(status_code=400, detail="Software already rejected")
        
        software.is_rejected = True
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
            logger.warning("Proceeding with software rejection despite email failure")
        
        return {"message": "Software rejected"}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Database error during software rejection for hash {hash}: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")