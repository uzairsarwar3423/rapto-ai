from src.models.extraction_models import ExtractedDecision, ParsedDecision

def parse_decision(raw: ExtractedDecision) -> ParsedDecision:
    text_normalized = raw.text.lower().strip()
    
    return ParsedDecision(
        **raw.model_dump(),
        text_normalized=text_normalized
    )
