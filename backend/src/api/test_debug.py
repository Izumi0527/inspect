"""
临时测试端点，用于诊断 422 错误
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.database import get_db_session
from src.core.permissions import require_permission, get_current_active_user

router = APIRouter()

# 测试1：只有权限依赖
@router.get("/test/permission-only")
async def test_permission_only(
    current_user: dict = Depends(require_permission("inspections:read"))
):
    return {"message": "Permission check passed", "user": current_user}

# 测试2：只有数据库依赖
@router.get("/test/db-only")
async def test_db_only(
    db: AsyncSession = Depends(get_db_session)
):
    return {"message": "Database dependency passed"}

# 测试3：两个依赖都有（和 inspection 端点一样）
@router.get("/test/both-deps")
async def test_both_deps(
    current_user: dict = Depends(require_permission("inspections:read")),
    db: AsyncSession = Depends(get_db_session)
):
    return {"message": "Both dependencies passed", "user": current_user}

# 测试4：改变依赖顺序（先 db 后权限）
@router.get("/test/reversed-deps")
async def test_reversed_deps(
    db: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(require_permission("inspections:read"))
):
    return {"message": "Reversed dependencies passed", "user": current_user}

# 测试5：使用简单的权限依赖（不通过 require_permission）
@router.get("/test/simple-permission")
async def test_simple_permission(
    current_user: dict = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_session)
):
    return {"message": "Simple permission passed", "user": current_user}
