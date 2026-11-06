"""Idempotently create the chat Mongo indexes (no migration framework for Mongo).

    MONGODB_URL=... CHAT_MONGO_DATABASE=rapto python scripts/ensure_chat_indexes.py

The service also runs this at startup when chat is enabled, and refuses to start if it fails: the idempotency
guarantee (one user message per client_message_id) depends on the partial unique index.
"""

from __future__ import annotations

import asyncio
import os
import sys

from motor.motor_asyncio import AsyncIOMotorClient

from src.repositories.chat_repository import ensure_indexes


async def main() -> int:
    url, db_name = os.environ["MONGODB_URL"], os.environ.get("CHAT_MONGO_DATABASE", "rapto")
    client = AsyncIOMotorClient(url, serverSelectionTimeoutMS=5000)
    try:
        for name in await ensure_indexes(client[db_name]):
            print("ok", name)
    finally:
        client.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
