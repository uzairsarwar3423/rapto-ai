import axios from 'axios';

async function run() {
  const mockCleanedTranscript = [
    {
      turn_id: "1",
      speaker_name: "Uzair Sarwar",
      speaker_user_id: "u1",
      start_time: 16,
      end_time: 25,
      cleaned_text: "Hi Ahmed. Let's start sprint planning meeting. This meeting is to define our backlog priorities.",
      original_text: "ہائے احمد لیسٹارڈ سپرنٹ پلاننگ میٹنگ کا مطلب یہ ہے کہ میٹنگ کے پیچھے بہترین وکیفی کے لئے میٹنگ کے پیچھے بہترین وکیفی پیچھے بہترین.",
      filler_words_removed: 0,
      was_modified: false,
      was_modified_suspiciously: false,
      uncertain: false,
      confidence_detail: { uncertain: false, reason: "none" }
    },
    {
      turn_id: "2",
      speaker_name: "Uzair Sarwar",
      speaker_user_id: "u1",
      start_time: 41,
      end_time: 141,
      cleaned_text: "Sounds good. Before we start, I reviewed the backlog yesterday. I think the authentication meeting, transcription, and the dashboard should be our highest priorities. Agree. Let's officially decide. The authentication meeting, transcription, and dashboard will be in the Sprint file. We will move AI analytics to the next sprint.",
      original_text: "Sounds good. Before we start, I reviewed the backlog yesterday. I think the authentication meeting, transcription, and the dashboard should be our highest priorities. Agree. Let's officially decide. The authentication meeting, transcription, and dashboard will be in the Sprint file. We will move AI analytics to the next sprint.",
      filler_words_removed: 0,
      was_modified: false,
      was_modified_suspiciously: false,
      uncertain: false,
      confidence_detail: { uncertain: false, reason: "none" }
    },
    {
      turn_id: "3",
      speaker_name: "Ahmed",
      speaker_user_id: "u2",
      start_time: 141,
      end_time: 176,
      cleaned_text: "Authentication is almost ready. I only need to finish Google OAuth integration.",
      original_text: "Authentication is almost ready. I only need to finish Google OAuth integration.",
      filler_words_removed: 0,
      was_modified: false,
      was_modified_suspiciously: false,
      uncertain: false,
      confidence_detail: { uncertain: false, reason: "none" }
    },
    {
      turn_id: "4",
      speaker_name: "Uzair Sarwar",
      speaker_user_id: "u1",
      start_time: 176,
      end_time: 197,
      cleaned_text: "Great. Can you complete Google OAuth by Wednesday evening?",
      original_text: "Great. Can you complete Google OAuth by Wednesday evening?",
      filler_words_removed: 0,
      was_modified: false,
      was_modified_suspiciously: false,
      uncertain: false,
      confidence_detail: { uncertain: false, reason: "none" }
    },
    {
      turn_id: "5",
      speaker_name: "Ahmed",
      speaker_user_id: "u2",
      start_time: 197,
      end_time: 233,
      cleaned_text: "Yes, I will finish Google before Wednesday 6pm.",
      original_text: "Yes, I will finish Google before Wednesday 6pm.",
      filler_words_removed: 0,
      was_modified: false,
      was_modified_suspiciously: false,
      uncertain: false,
      confidence_detail: { uncertain: false, reason: "none" }
    },
    {
      turn_id: "6",
      speaker_name: "Uzair Sarwar",
      speaker_user_id: "u1",
      start_time: 233,
      end_time: 261,
      cleaned_text: "I will handle the meeting summary pipeline and integrate the cleanup service with recall AI transcripts.",
      original_text: "I will handle the meeting summary pipeline and integrate the cleanup service with recall AI transcripts.",
      filler_words_removed: 0,
      was_modified: false,
      was_modified_suspiciously: false,
      uncertain: false,
      confidence_detail: { uncertain: false, reason: "none" }
    },
    {
      turn_id: "7",
      speaker_name: "Ahmed",
      speaker_user_id: "u2",
      start_time: 261,
      end_time: 392,
      cleaned_text: "When do you think that will be ready? I will complete it by Thursday afternoon. We also need paddle subscriptions tested before that.",
      original_text: "When do you think that will be ready? I will complete it by Thursday afternoon. We also need paddle subscriptions tested before that.",
      filler_words_removed: 0,
      was_modified: false,
      was_modified_suspiciously: false,
      uncertain: false,
      confidence_detail: { uncertain: false, reason: "none" }
    },
    {
      turn_id: "8",
      speaker_name: "Uzair Sarwar",
      speaker_user_id: "u1",
      start_time: 392,
      end_time: 421,
      cleaned_text: "Good point. I will test all subscription plans after the backend deployment on Friday.",
      original_text: "Good point. I will test all subscription plans after the backend deployment on Friday.",
      filler_words_removed: 0,
      was_modified: false,
      was_modified_suspiciously: false,
      uncertain: false,
      confidence_detail: { uncertain: false, reason: "none" }
    },
    {
      turn_id: "9",
      speaker_name: "Ahmed",
      speaker_user_id: "u2",
      start_time: 421,
      end_time: 447,
      cleaned_text: "Yeah.",
      original_text: "एक पड़ा है ना करते हैं ना करते हैं ना करते ہیں نا کرتے ہیں نا کرتے نا کرتے ہیں.",
      filler_words_removed: 0,
      was_modified: false,
      was_modified_suspiciously: false,
      uncertain: false,
      confidence_detail: { uncertain: false, reason: "none" }
    },
    {
      turn_id: "10",
      speaker_name: "Uzair Sarwar",
      speaker_user_id: "u1",
      start_time: 447,
      end_time: 474,
      cleaned_text: "Yes, that's currently blocking end time testing.",
      original_text: "Yes, that's currently blocking end time testing.",
      filler_words_removed: 0,
      was_modified: false,
      was_modified_suspiciously: false,
      uncertain: false,
      confidence_detail: { uncertain: false, reason: "none" }
    },
    {
      turn_id: "11",
      speaker_name: "Ahmed",
      speaker_user_id: "u2",
      start_time: 474,
      end_time: 510,
      cleaned_text: "Another list is OpenAI API. If transcript length increases, our monthly cost may exceed the current.",
      original_text: "Another list is OpenAI API. If transcript length increases, our monthly cost may exceed the current.",
      filler_words_removed: 0,
      was_modified: false,
      was_modified_suspiciously: false,
      uncertain: false,
      confidence_detail: { uncertain: false, reason: "none" }
    },
    {
      turn_id: "12",
      speaker_name: "Uzair Sarwar",
      speaker_user_id: "u1",
      start_time: 510,
      end_time: 536,
      cleaned_text: "Agreed. We need to token user this sprint before changing mode.",
      original_text: "Agreed. We need to token user this sprint before changing mode.",
      filler_words_removed: 0,
      was_modified: false,
      was_modified_suspiciously: false,
      uncertain: false,
      confidence_detail: { uncertain: false, reason: "none" }
    },
    {
      turn_id: "13",
      speaker_name: "Ahmed",
      speaker_user_id: "u2",
      start_time: 536,
      end_time: 569,
      cleaned_text: "Dashboard UI is almost complete. But the commitment space is pending.",
      original_text: "Dashboard UI is almost complete. But the commitment space is pending.",
      filler_words_removed: 0,
      was_modified: false,
      was_modified_suspiciously: false,
      uncertain: false,
      confidence_detail: { uncertain: false, reason: "none" }
    },
    {
      turn_id: "14",
      speaker_name: "Uzair Sarwar",
      speaker_user_id: "u1",
      start_time: 569,
      end_time: 595,
      cleaned_text: "That's okay. We will move the commitment dashboard to subnet 6.",
      original_text: "That's okay. We will move the commitment dashboard to subnet 6.",
      filler_words_removed: 0,
      was_modified: false,
      was_modified_suspiciously: false,
      uncertain: false,
      confidence_detail: { uncertain: false, reason: "none" }
    },
    {
      turn_id: "15",
      speaker_name: "Ahmed",
      speaker_user_id: "u2",
      start_time: 595,
      end_time: 620,
      cleaned_text: "I also prepare API documentation after finishing.",
      original_text: "I also prepare API documentation after finishing.",
      filler_words_removed: 0,
      was_modified: false,
      was_modified_suspiciously: false,
      uncertain: false,
      confidence_detail: { uncertain: false, reason: "none" }
    },
    {
      turn_id: "16",
      speaker_name: "Uzair Sarwar",
      speaker_user_id: "u1",
      start_time: 620,
      end_time: 650,
      cleaned_text: "Perfect. Please share it with me before Friday evening.",
      original_text: "Perfect. Please share it with me before Friday evening.",
      filler_words_removed: 0,
      was_modified: false,
      was_modified_suspiciously: false,
      uncertain: false,
      confidence_detail: { uncertain: false, reason: "none" }
    },
    {
      turn_id: "17",
      speaker_name: "Ahmed",
      speaker_user_id: "u2",
      start_time: 650,
      end_time: 660,
      cleaned_text: "Sure, I will do that.",
      original_text: "Sure, I will do that.",
      filler_words_removed: 0,
      was_modified: false,
      was_modified_suspiciously: false,
      uncertain: false,
      confidence_detail: { uncertain: false, reason: "none" }
    }
  ];

  const requestPayload = {
    meeting_id: "test-meeting-1",
    team_id: "test-team-1",
    meeting_date: new Date().toISOString(),
    meeting_title: "Sprint Planning",
    cleaned_transcript: mockCleanedTranscript,
    participants: [
      { name: "Uzair Sarwar", email: "uzair@example.com", user_id: "u1", speaker_tag: "Uzair Sarwar" },
      { name: "Ahmed", email: "ahmed@example.com", user_id: "u2", speaker_tag: "Ahmed" }
    ],
    meeting_duration_seconds: 660,
    team_timezone: "Asia/Karachi"
  };

  try {
    const response = await axios.post("http://localhost:8001/api/v1/extract", requestPayload, {
      headers: {
        'X-Internal-Service-Key': "4367a6fe791992e8f2c250ed4bde9592f4e9fa10599acbc1b12de52d7de8e668"
      }
    });
    
    console.log("Status:", response.status);
    console.log("Commitments:", JSON.stringify(response.data.result.commitments, null, 2));
    console.log("Action Items:", JSON.stringify(response.data.result.action_items, null, 2));
    console.log("Decisions:", JSON.stringify(response.data.result.decisions, null, 2));
  } catch (err: any) {
    if (err.response) {
      console.error("Error Response:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error("Error:", err.message);
    }
  }
}

run();
