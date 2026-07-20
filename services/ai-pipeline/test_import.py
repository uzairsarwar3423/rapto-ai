import sys
import os

print("Starting import trace...")

try:
    print("1. import src.config.logging")
    import src.config.logging
    print("2. import src.config.settings")
    import src.config.settings
    print("3. import src.db.mongo_client")
    import src.db.mongo_client
    print("4. import src.db.redis_client")
    import src.db.redis_client
    print("5. import src.middleware.error_handler")
    import src.middleware.error_handler
    print("6. import src.services.cleanup.confidence_flagger")
    import src.services.cleanup.confidence_flagger
    print("7. import src.middleware.request_id")
    import src.middleware.request_id
    print("8. import src.middleware.request_logger")
    import src.middleware.request_logger
    print("9. import src.models.exceptions")
    import src.models.exceptions
    print("10. import src.services.openai_client")
    import src.services.openai_client
    print("11. import src.api.routes.health")
    import src.api.routes.health
    print("12. import src.api.routes.cleanup")
    import src.api.routes.cleanup
    print("13. import src.api.routes.extract")
    import src.api.routes.extract
    print("14. import src.api.routes.resolve")
    import src.api.routes.resolve
    print("15. ALL IMPORTS OK")
    
    print("16. import src.api.main")
    import src.api.main
    print("17. Call create_app")
    app = src.api.main.create_app()
    print("18. App created")
except Exception as e:
    print(f"Exception: {e}")
