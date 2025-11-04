from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import timedelta
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from src.services.auth import AuthService
from src.core.permissions import get_current_user, get_current_active_user
from src.core.database import get_db_session
from src.schemas.user import UserRole
from src.repositories.user_repository import UserRepository

logger = structlog.get_logger()
router = APIRouter()
security = HTTPBearer()

# 认证相关数据模型
class LoginRequest(BaseModel):
    username: str
    password: str

    # 忽略额外字段（如前端发送的remember_me），确保前后端兼容性
    model_config = {"extra": "ignore"}

class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class UserInfo(BaseModel):
    id: int
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    role: UserRole
    is_active: bool = True

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str

@router.post("/login", response_model=LoginResponse, summary="用户登录")
async def login(
    request: LoginRequest, 
    session: AsyncSession = Depends(get_db_session)
):
    """
    用户登录接口
    
    返回访问令牌和刷新令牌
    """
    # 使用数据库验证用户身份
    authenticated_user = await AuthService.authenticate_user(
        session, request.username, request.password
    )
    
    if not authenticated_user:
        logger.warning("Failed login attempt", username=request.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 创建访问令牌
    access_token_expires = timedelta(minutes=30)  # 30分钟
    access_token = AuthService.create_access_token(
        data={"sub": authenticated_user.username},
        expires_delta=access_token_expires
    )
    
    # 创建刷新令牌
    refresh_token = AuthService.create_refresh_token(
        data={"sub": authenticated_user.username}
    )
    
    # 构建用户信息
    user_info = {
        "id": authenticated_user.id,
        "username": authenticated_user.username,
        "email": authenticated_user.email,
        "full_name": authenticated_user.full_name,
        "role": authenticated_user.role,
        "is_active": authenticated_user.is_active
    }
    
    logger.info("User logged in successfully",
                username=request.username,
                user_id=authenticated_user.id)
    
    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=1800,  # 30分钟
        user=user_info
    )

@router.post("/refresh", response_model=LoginResponse, summary="刷新访问令牌")
async def refresh_token(
    request: RefreshTokenRequest,
    session: AsyncSession = Depends(get_db_session)
):
    """
    刷新访问令牌
    
    使用刷新令牌获取新的访问令牌
    """
    try:
        # 验证刷新令牌
        payload = AuthService.verify_token(request.refresh_token, "refresh")
        username = payload.get("sub")
        
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="无效的刷新令牌"
            )
        
        # 从数据库获取用户信息
        user_repo = UserRepository(session)
        user = await user_repo.get_user_by_username(username)
        
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户不存在或已被禁用"
            )
        
        # 创建新的访问令牌
        access_token_expires = timedelta(minutes=30)
        new_access_token = AuthService.create_access_token(
            data={"sub": username},
            expires_delta=access_token_expires
        )
        
        # 创建新的刷新令牌
        new_refresh_token = AuthService.create_refresh_token(
            data={"sub": username}
        )
        
        # 构建用户信息
        user_info = {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active
        }
        
        logger.info("Token refreshed successfully", username=username)
        
        return LoginResponse(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            expires_in=1800,
            user=user_info
        )
        
    except Exception as e:
        logger.error("Token refresh failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="刷新令牌无效或已过期"
        )

@router.post("/logout", summary="用户登出")
async def logout(current_user: dict = Depends(get_current_active_user)):
    """
    用户登出接口
    
    在实际应用中，这里应该将token加入黑名单
    """
    logger.info("User logged out", 
                username=current_user["username"], 
                user_id=current_user["id"])
    
    return {"message": "登出成功"}

@router.get("/me", response_model=UserInfo, summary="获取当前用户信息")
async def get_current_user_info(current_user: dict = Depends(get_current_active_user)):
    """
    获取当前登录用户信息
    """
    return UserInfo(**current_user)

@router.put("/change-password", summary="修改密码")
async def change_password(
    request: ChangePasswordRequest,
    current_user: dict = Depends(get_current_active_user)
):
    """
    修改当前用户密码
    """
    # 验证新密码确认
    if request.new_password != request.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码和确认密码不匹配"
        )
    
    # 验证当前密码
    user_data = TEMP_USERS.get(current_user["username"])
    if not user_data or user_data["password"] != request.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前密码错误"
        )
    
    # 更新密码（在实际应用中应该哈希存储）
    user_data["password"] = request.new_password
    
    logger.info("Password changed successfully", 
                username=current_user["username"],
                user_id=current_user["id"])
    
    return {"message": "密码修改成功"}

@router.get("/verify", summary="验证令牌")
async def verify_token(current_user: dict = Depends(get_current_user)):
    """
    验证访问令牌是否有效
    """
    return {
        "valid": True,
        "user": {
            "id": current_user["id"],
            "username": current_user["username"],
            "role": current_user["role"]
        }
    }