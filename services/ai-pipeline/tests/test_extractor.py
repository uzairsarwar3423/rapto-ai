import pytest
from datetime import datetime
from src.models.extraction_models import (
    ExtractRequest, ExtractionResultWithMeta, PartialExtractionFailure, ExtractionResponse,
    ExtractedCommitment
)
from src.models.cleanup_models import CleanedTranscriptTurn, ParticipantInfo
from src.models.common import AICallResult, CostRecord, ModelTier, TaskType
from src.services.extraction.extractor import extract

@pytest.fixture
def basic_request():
    return ExtractRequest(
        meeting_id="m1",
        team_id="t1",
        meeting_date=datetime.now(),
        meeting_title="Test",
        meeting_duration_seconds=1800,
        team_timezone="UTC",
        participants=[ParticipantInfo(name="User", email="user@test.com", user_id="u1", speaker_tag="Speaker 1")],
        cleaned_transcript=[
            CleanedTranscriptTurn(
                turn_id="t1", speaker_name="User", speaker_user_id="u1", 
                start_time=0.0, end_time=5.0, cleaned_text="I will do this task", 
                original_text="I will do this task", filler_words_removed=0, was_modified=False, 
                was_modified_suspiciously=False, uncertain=False, confidence_detail={"uncertain": False, "reason": "none"}
            )
        ]
    )

@pytest.mark.asyncio
async def test_extract_short_single_chunk(mock_openai_client, basic_request):
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
    
    result = await extract(basic_request, mock_openai_client)
    
    assert isinstance(result, ExtractionResultWithMeta)
    assert result.chunks_total == 1
    assert result.chunks_succeeded == 1
    assert len(result.commitments) == 1
    assert result.summary == "A short meeting summary"
    assert result.summary_scope.value == "FULL"
    mock_openai_client.generate_structured.assert_called_once()
