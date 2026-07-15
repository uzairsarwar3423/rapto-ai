import difflib
from typing import List, Tuple
import structlog

from src.models.extraction_models import ParsedCommitment, ParsedActionItem

log = structlog.get_logger(__name__)

def string_similarity(a: str, b: str) -> float:
    """Calculate similarity between two strings using difflib."""
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()

def has_acceptance_phrases(text: str) -> bool:
    """Check if the text contains phrases indicating self-commitment or explicit acceptance."""
    text_lower = text.lower()
    acceptance_phrases = [
        "will", "i'll", "yes", "can", "handle it", 
        "i can handle", "agreed to", "commits to", "promises to",
        "will handle", "will do"
    ]
    # To avoid matching generic usage of 'can' or 'will' in long descriptions,
    # we could just look for exact substring matches of common phrases.
    # Let's refine the phrases to be safer:
    safe_phrases = [
        "i will", "i'll", "yes, i can", "i'll handle it", "i can handle",
        "agreed to", "commits to", "promises to", "will handle", "will do",
        "yes, i will", "yes, i'll"
    ]
    return any(p in text_lower for p in safe_phrases)

def deduplicate_commitments_and_action_items(
    commitments: List[ParsedCommitment],
    action_items: List[ParsedActionItem],
    similarity_threshold: float = 0.85
) -> Tuple[List[ParsedCommitment], List[ParsedActionItem]]:
    """
    Resolves duplicates between Commitments and Action Items.
    Commitments have higher priority. If an Action Item maps to a Commitment,
    it is removed. Also handles self-commitments by converting accepted Action Items.
    """
    final_action_items = []
    final_commitments = list(commitments)
    
    for ai in action_items:
        is_duplicate = False
        
        # Rule 3: If same task exists in both arrays, keep Commitment, delete Action Item
        for comm in final_commitments:
            if ai.assignee_name.strip().lower() == comm.owner_name.strip().lower():
                # Compare text similarity
                sim = string_similarity(ai.text, comm.text)
                if sim >= similarity_threshold:
                    log.info(
                        "deduplicator_removed_action_item",
                        reason="duplicate_of_commitment",
                        action_item_text=ai.text,
                        commitment_text=comm.text,
                        similarity=sim
                    )
                    is_duplicate = True
                    break
        
        if is_duplicate:
            continue
            
        # Industry standard: An assigned task remains an Action Item even if accepted.
        # We only deduplicate if the exact same task is in both arrays (Rule 3).
        if not is_duplicate:
            final_action_items.append(ai)
            
    return final_commitments, final_action_items
