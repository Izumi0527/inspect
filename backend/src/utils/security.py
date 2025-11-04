"""
安全工具类
"""
import secrets
import string
import hashlib
from passlib.context import CryptContext
from passlib.hash import bcrypt


# 密码加密上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_password_hash(password: str) -> str:
    """生成密码哈希"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)


def generate_random_password(length: int = 12) -> str:
    """生成随机密码"""
    # 确保包含各种字符类型
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    
    # 至少包含一个大写字母、小写字母、数字和特殊字符
    password = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$%^&*")
    ]
    
    # 填充剩余长度
    for _ in range(length - 4):
        password.append(secrets.choice(alphabet))
    
    # 随机打乱
    secrets.SystemRandom().shuffle(password)
    
    return ''.join(password)


def verify_password_strength(password: str) -> bool:
    """验证密码强度"""
    if len(password) < 8:
        return False
    
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    has_special = any(c in '!@#$%^&*()_+-=[]{}|;:,.<>?' for c in password)
    
    return all([has_upper, has_lower, has_digit, has_special])


def generate_secure_token(length: int = 32) -> str:
    """生成安全令牌"""
    return secrets.token_urlsafe(length)


def hash_string(text: str, salt: str = "") -> str:
    """计算字符串哈希值"""
    return hashlib.sha256((text + salt).encode()).hexdigest()