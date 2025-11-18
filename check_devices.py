import asyncio
import asyncpg

CONN_STR = "postgresql://inspect_dev:dev_password_2024@localhost:5433/inspect_system_dev"

async def main():
    conn = await asyncpg.connect(CONN_STR)
    rows = await conn.fetch('SELECT id, name, ip_address FROM devices ORDER BY id')
    print('devices:', rows)
    await conn.close()

asyncio.run(main())
