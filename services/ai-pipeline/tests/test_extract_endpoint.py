import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_extract_endpoint_success(client: AsyncClient, auth_headers, mock_openai_client):
    from src.models.common import AICallResult, CostRecord, ModelTier, TaskType
    from src.models.extraction_models import ExtractionResponse, ExtractedCommitment
    
    mock_openai_client.generate_structured.return_value = AICallResult(
        data=ExtractionResponse(
            commitments=[ExtractedCommitment(text="I will do this task", owner_name="User", confidence=0.9)],
            summary="A short meeting summary"
        ),
        cost=CostRecord(input_tokens=10, output_tokens=10, model_tier=ModelTier.MINI, model_name="test", estimated_cost_usd=0.01),
        latency_ms=100.0,
        retry_count=0,
        task_type=TaskType.EXTRACTION,
        model_name="test"
    )
    
    payload = {
        "meeting_id": "m1",
        "team_id": "t1",
        "meeting_date": "2026-06-09T09:00:00Z",
        "meeting_title": "Test",
        "meeting_duration_seconds": 1800,
        "team_timezone": "UTC",
        "participants": [{"name": "User", "email": "user@test.com", "user_id": "u1", "speaker_tag": "Speaker 1"}],
        "cleaned_transcript": [
            {
                "turn_id": "t1", "speaker_name": "User", "speaker_user_id": "u1", 
                "start_time": 0.0, "end_time": 5.0, "cleaned_text": "I will do this task", 
                "original_text": "I will do this task", "filler_words_removed": 0, "was_modified": False, 
                "was_modified_suspiciously": False, "uncertain": False, "confidence_detail": {"uncertain": False, "reason": "none"}
            }
        ]
    }
    
    response = await client.post("/api/v1/extract", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["result"]["chunks_total"] == 1
    assert data["result"]["summary"] == "A short meeting summary"

@pytest.mark.asyncio
async def test_extract_endpoint_unauthorized(client: AsyncClient):
    response = await client.post("/api/v1/extract", json={})
    assert response.status_code == 401
