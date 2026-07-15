import asyncio
import sys
from datetime import datetime, timezone
import json
import logging
from pprint import pprint

from src.models.extraction_models import ExtractRequest
from src.models.cleanup_models import CleanedTranscriptTurn, ParticipantInfo
from src.services.extraction.extractor import extract
from src.services.openai_client import OpenAIClient
from src.config.settings import get_settings

logging.basicConfig(level=logging.INFO)

async def main():
    transcript_data = [
        # Intro and Decisions
        ("Uzair Sarwar", 0.0, 10.0, "Hi Zain. Thanks for joining the weekly architecture sync. Let's start with the database migration."),
        ("Zain Sarwar", 10.0, 20.0, "Right. So I looked into the options and I think we should go with PostgreSQL instead of MongoDB. It fits our relational data better."),
        ("Uzair Sarwar", 20.0, 30.0, "I completely agree. We've decided to officially migrate to PostgreSQL for the core application data."),
        
        # Blocker
        ("Zain Sarwar", 30.0, 40.0, "However, I can't move forward with the schema design right now. I'm completely blocked by the DevOps team because they haven't provisioned the staging servers yet."),
        
        # Pure Action Item (assigned, not explicitly accepted by the person in transcript)
        ("Uzair Sarwar", 40.0, 50.0, "Understood. Ali, I need you to escalate the server issue to the DevOps lead immediately and get those servers provisioned by tomorrow."),
        
        # Let's add a pure Action item for a third party
        ("Uzair Sarwar", 50.0, 60.0, "Also, we need John to review the new API documentation once it's done. Please assign that to him."),
        
        # Pure Commitment
        ("Zain Sarwar", 60.0, 70.0, "Okay. I will write the data migration scripts this weekend."),
        
        # "We should" anti-pattern (Should NOT be extracted)
        ("Uzair Sarwar", 70.0, 80.0, "Great. We should also probably think about updating the cache invalidation logic at some point."),
        
        # Compound Commitment
        ("Sarah Ahmed", 80.0, 90.0, "I will handle the cache invalidation update, rewrite the Redis configurations, and deploy the new caching layer by next Wednesday."),
        
        # Accepted Assignment -> Becomes Commitment (instead of Action Item)
        ("Uzair Sarwar", 90.0, 100.0, "Zain, can you also update the frontend to support the new login flow?"),
        ("Zain Sarwar", 100.0, 110.0, "Yes, I'll definitely have the frontend login flow updated before Friday EOD."),
    ]
    
    transcript = []
    for i, (speaker, start, end, text) in enumerate(transcript_data):
        transcript.append(CleanedTranscriptTurn(
            turn_id=f"turn_{i}",
            cleaned_text=text,
            original_text=text,
            speaker_name=speaker,
            start_time=start,
            end_time=end,
        ))
    
    participants = [
        ParticipantInfo(speaker_tag="Uzair Sarwar", name="Uzair Sarwar", is_registered=True, user_id="u1"),
        ParticipantInfo(speaker_tag="Zain Sarwar", name="Zain Sarwar", is_registered=True, user_id="u2"),
        ParticipantInfo(speaker_tag="Sarah Ahmed", name="Sarah Ahmed", is_registered=True, user_id="u3"),
        ParticipantInfo(speaker_tag="Ali", name="Ali", is_registered=False, user_id=None)
    ]
    
    payload = ExtractRequest(
        meeting_id="m1",
        team_id="t1",
        meeting_date=datetime.now(timezone.utc),
        meeting_title="Prioritization Sync",
        cleaned_transcript=transcript,
        participants=participants,
        meeting_duration_seconds=90.0,
        team_timezone="UTC"
    )
    
    # get ai client
    ai_client = OpenAIClient(get_settings())
    
    print("Running extraction...")
    result = await extract(payload, ai_client)
    print("Done!")
    
    with open("test_out.json", "w") as f:
        f.write(result.model_dump_json(indent=2))

if __name__ == "__main__":
    asyncio.run(main())
