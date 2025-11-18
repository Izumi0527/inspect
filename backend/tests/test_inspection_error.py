import requests
import json

# 尝试不同的密码
passwords_to_try = ["admin123", "password", "admin", "123456", "Admin@123"]

token = None

# 尝试登录
for pwd in passwords_to_try:
    try:
        response = requests.post(
            "http://localhost:8000/api/v1/auth/login",
            json={"username": "admin", "password": pwd}
        )
        if response.status_code == 200:
            data = response.json()
            token = data["data"]["access_token"]
            print(f"[OK] Login successful with password: {pwd}")
            break
    except Exception as e:
        pass

if not token:
    print("[FAILED] Failed to login. Trying without authentication...")
    # 尝试不带 token 访问
    response = requests.get("http://localhost:8000/api/v1/inspection/executions?page=1&page_size=10")
    print(f"\nWithout token - Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
else:
    # 使用 token 测试 inspection 端点
    headers = {"Authorization": f"Bearer {token}"}

    print("\n" + "="*60)
    print("Testing /inspection/executions endpoint with token")
    print("="*60)

    response = requests.get(
        "http://localhost:8000/api/v1/inspection/executions?page=1&page_size=10",
        headers=headers
    )

    print(f"\nStatus Code: {response.status_code}")
    print(f"Headers: {dict(response.headers)}")
    print(f"\nResponse Body:")
    try:
        print(json.dumps(response.json(), indent=2, ensure_ascii=False))
    except:
        print(response.text)
