from typing import List, Dict
from src.models.extraction_models import ExtractedRisk, ParsedRisk

def parse_risk(raw: ExtractedRisk) -> ParsedRisk:
    text_normalized = raw.text.lower().strip()
    dedup_key = text_normalized[:80]
    
    raised_by = raw.raised_by.title() if raw.raised_by else None
    
    dump = raw.model_dump()
    dump['raised_by'] = raised_by
    
    return ParsedRisk(
        **dump,
        text_normalized=text_normalized,
        dedup_key=dedup_key
    )

def dedup_risks(risks: List[ParsedRisk]) -> List[ParsedRisk]:
    deduped: Dict[str, ParsedRisk] = {}
    for risk in risks:
        if risk.dedup_key not in deduped:
            deduped[risk.dedup_key] = risk
        else:
            existing = deduped[risk.dedup_key]
            if risk.confidence > existing.confidence:
                deduped[risk.dedup_key] = risk
    return list(deduped.values())
