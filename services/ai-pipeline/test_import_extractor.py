print("A. Starting")
try:
    print("B. from src.services.extraction.extractor import extract")
    from src.services.extraction.extractor import extract
    print("C. DONE")
except Exception as e:
    print("Error:", e)
