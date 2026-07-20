print("Importing extract route...")
try:
    from src.api.routes.extract import router
    print("DONE")
except Exception as e:
    print(e)
