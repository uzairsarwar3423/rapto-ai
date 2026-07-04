import pytest
import json
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

from src.models.date_models import DateParseRequest, DateResolutionStatus
from src.services.date_parser import parse_date, batch_parse_dates
from src.services.openai_client import OpenAIClient
from src.models.common import AICallResult, TaskType, CostRecord, ModelTier

FIXTURES_DIR = Path(__file__).parent / "fixtures"

@pytest.fixture
def resolution_cases():
    with open(FIXTURES_DIR / "date_resolution_cases.json", "r") as f:
        return json.load(f)

@pytest.fixture
def edge_cases():
    with open(FIXTURES_DIR / "date_edge_cases.json", "r") as f:
        return json.load(f)

@pytest.fixture
def mock_openai_client():
    client = AsyncMock(spec=OpenAIClient)
    return client

@pytest.mark.asyncio
async def test_date_parser_resolution_cases(resolution_cases, mock_openai_client):
    for case in resolution_cases:
        req = DateParseRequest(
            raw_expression=case["expression"],
            meeting_datetime_utc=datetime.fromisoformat(case["meeting_date"].replace('Z', '+00:00')),
            team_timezone=case["timezone"]
        )
        
        # Ensure Layer 3 isn't called for these standard cases
        mock_openai_client.generate_structured.reset_mock()
        
        result = await parse_date(req, mock_openai_client)
        
        assert result.status == DateResolutionStatus(case["expected_status"]), f"Failed on {case['expression']}"
        if case["expected_status"] == "RESOLVED":
            expected_utc = datetime.fromisoformat(case["expected_utc"].replace('Z', '+00:00'))
            assert result.resolved_datetime_utc == expected_utc, f"Failed on {case['expression']}"
            assert result.layer_used == 2
        elif case["expected_status"] in ("AMBIGUOUS", "SPRINT_RELATIVE"):
            assert result.layer_used == 1
        else:
            assert result.layer_used == 2
            
        assert mock_openai_client.generate_structured.call_count == 0, f"Layer 3 unexpectedly called for {case['expression']}"

@pytest.mark.asyncio
async def test_date_parser_layer_3_fallback(mock_openai_client):
    req = DateParseRequest(
        raw_expression="sometime before the team offsite",
        meeting_datetime_utc=datetime(2026, 6, 8, 9, 0, tzinfo=timezone.utc),
        team_timezone="UTC"
    )
    
    # Mock model response
    mock_response = AsyncMock()
    mock_response.data.is_ambiguous = False
    mock_response.data.is_sprint_relative = False
    mock_response.data.resolved_date = "2026-06-15"
    mock_response.data.confidence = 0.85
    mock_response.data.resolution_note = "Resolved via model"
    
    mock_openai_client.generate_structured.return_value = mock_response
    
    result = await parse_date(req, mock_openai_client)
    
    assert result.status == DateResolutionStatus.RESOLVED
    assert result.layer_used == 3
    assert result.confidence == 0.85 # Min of 0.90 and 0.85
    assert result.resolved_datetime_utc == datetime(2026, 6, 15, 18, 0, tzinfo=timezone.utc)
    mock_openai_client.generate_structured.assert_called_once()

@pytest.mark.asyncio
async def test_batch_parse_dates(mock_openai_client):
    reqs = [
        DateParseRequest(raw_expression="ASAP", meeting_datetime_utc=datetime(2026, 6, 8, 9, tzinfo=timezone.utc), team_timezone="UTC"),
        DateParseRequest(raw_expression="tomorrow", meeting_datetime_utc=datetime(2026, 6, 8, 9, tzinfo=timezone.utc), team_timezone="UTC"),
    ]
    
    results = await batch_parse_dates(reqs, mock_openai_client)
    assert len(results) == 2
    assert results[0].status == DateResolutionStatus.AMBIGUOUS
    assert results[1].status == DateResolutionStatus.RESOLVED
    assert mock_openai_client.generate_structured.call_count == 0
