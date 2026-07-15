import pytest
from src.models.extraction_models import ParsedCommitment, ParsedActionItem
from src.services.extraction.deduplicator import deduplicate_commitments_and_action_items, has_acceptance_phrases

def test_has_acceptance_phrases():
    assert has_acceptance_phrases("Yes, I will do this") == True
    assert has_acceptance_phrases("I'll handle it by Friday") == True
    assert has_acceptance_phrases("Sure, I can handle that") == True
    assert has_acceptance_phrases("Update the API docs") == False
    assert has_acceptance_phrases("Please review the PR") == False

def create_parsed_commitment(text: str, owner_name: str) -> ParsedCommitment:
    return ParsedCommitment(
        text=text,
        owner_name=owner_name,
        confidence=0.9,
        normalized_text=text.lower(),
        dedup_key=text.lower().replace(" ", "_")
    )

def create_parsed_action_item(text: str, assignee_name: str, priority="MEDIUM") -> ParsedActionItem:
    return ParsedActionItem(
        text=text,
        assignee_name=assignee_name,
        priority=priority,
        confidence=0.9,
        dedup_key=text.lower().replace(" ", "_")
    )

def test_assigned_task_plus_accepted():
    # Case 1: Assigned task + accepted -> Commitment only
    c1 = create_parsed_commitment("update API documentation and send it", "Zain")
    a1 = create_parsed_action_item("update API documentation and send it", "Zain")
    
    comms, actions = deduplicate_commitments_and_action_items([c1], [a1])
    assert len(comms) == 1
    assert len(actions) == 0
    assert comms[0].text == "update API documentation and send it"

def test_assigned_task_without_response():
    # Case 2: Assigned task without response -> Action Item only
    a1 = create_parsed_action_item("Update the frontend components", "Alice")
    
    comms, actions = deduplicate_commitments_and_action_items([], [a1])
    assert len(comms) == 0
    assert len(actions) == 1
    assert actions[0].text == "Update the frontend components"

def test_self_commitment():
    # Case 3: Self commitment -> Commitment only
    # E.g., The LLM only extracted an Action Item, but the text contains acceptance phrases
    a1 = create_parsed_action_item("I will refactor the database schema", "Bob")
    
    comms, actions = deduplicate_commitments_and_action_items([], [a1])
    assert len(actions) == 0
    assert len(comms) == 1
    assert comms[0].owner_name == "Bob"
    assert comms[0].text == "I will refactor the database schema"

def test_same_task_different_wording():
    # Case 4: Same task with different wording -> Deduplicate correctly
    # Above threshold (default 0.85).
    # "fix the login page bug" vs "fix the login page bugs" -> highly similar
    c1 = create_parsed_commitment("fix the login page bug", "Charlie")
    a1 = create_parsed_action_item("Fix the login page bugs", "Charlie")
    
    comms, actions = deduplicate_commitments_and_action_items([c1], [a1])
    assert len(comms) == 1
    assert len(actions) == 0

    # Below threshold -> keep both (assuming no acceptance phrases in action item)
    c2 = create_parsed_commitment("write tests for the login page", "Charlie")
    a2 = create_parsed_action_item("Deploy the login page to staging", "Charlie")
    
    comms2, actions2 = deduplicate_commitments_and_action_items([c2], [a2])
    assert len(comms2) == 1
    assert len(actions2) == 1
