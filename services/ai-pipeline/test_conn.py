import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as redis

async def check():
    print("Checking redis...")
    r = redis.Redis.from_url('redis://localhost:6379')
    try:
        await asyncio.wait_for(r.ping(), timeout=2)
        print("Redis OK")
    except Exception as e:
        print(f"Redis failed: {e}")

    print("Checking mongo...")
    client = AsyncIOMotorClient("mongodb://sarwar345aabb_db_user:hT1yc66Yc0zn5Um4@ac-d2cmqs9-shard-00-00.2vqcadm.mongodb.net:27017,ac-d2cmqs9-shard-00-01.2vqcadm.mongodb.net:27017,ac-d2cmqs9-shard-00-02.2vqcadm.mongodb.net:27017/vocaply?ssl=true&replicaSet=atlas-uc035p-shard-0&authSource=admin&appName=Cluster0", serverSelectionTimeoutMS=2000)
    try:
        await client.admin.command('ping')
        print("Mongo OK")
    except Exception as e:
        print(f"Mongo failed: {e}")

asyncio.run(check())
