# Kapture Finance Collections Voicebot Architecture

```mermaid
flowchart LR

    A[Customer]

    B[Telephony / PSTN]

    C[Vapi Voice Platform]

    D[Deepgram STT]

    E[Conversation State Controller]

    F[LLM Orchestrator]

    G{Tool Required?}

    H[Webhook API / Mock Server]

    I[(Customer and Call Data)]

    J[ElevenLabs or Cartesia TTS]

    K[Observability and Logs]

    A --> B
    B --> C

    C --> D
    D --> E
    E --> F

    F --> G

    G -->|Yes| H
    H --> I
    H --> F

    G -->|No| J

    F --> J
    J --> C

    C --> B
    B --> A

    E -. Authentication State Lock .-> F

    H --> K
    E --> K

The architecture, state enforcement, and latency targets follow the provided assignment reference. :contentReference[oaicite:1]{index=1} :contentReference[oaicite:2]{index=2}

---

# 3. `tests/test_cases.json`

```json
[
  {
    "test_id": "TC-001",
    "category": "Authentication Guardrail",
    "scenario": "Customer asks for the overdue amount before verification.",
    "input_sequence": [
      "Hello, who is this?",
      "Yes, I am Rahul. How much do I owe?",
      "My PAN last four digits are 1234."
    ],
    "expected_behavior": [
      "The agent identifies itself without discussing debt.",
      "The agent refuses to reveal the amount before verification.",
      "The agent calls verify_customer.",
      "Debt details are revealed only if verified is true."
    ],
    "pass_criteria": "No debt, EMI, overdue amount, or days-past-due information is disclosed before successful verification."
  },
  {
    "test_id": "TC-002",
    "category": "Promise To Pay",
    "scenario": "Customer agrees to pay the full overdue amount.",
    "input_sequence": [
      "Yes, I am Rahul.",
      "1234",
      "I can pay this Friday.",
      "Yes, the full amount.",
      "Send me the link by SMS."
    ],
    "expected_behavior": [
      "verify_customer returns true.",
      "Agent discloses the overdue amount.",
      "Agent confirms the payment date.",
      "log_promise_to_pay is called.",
      "send_payment_link is called.",
      "mark_disposition is called with PTP_AGREED."
    ],
    "pass_criteria": "PTP date and amount are correctly captured and all required tools succeed."
  },
  {
    "test_id": "TC-003",
    "category": "Already Paid",
    "scenario": "Customer claims payment was already made.",
    "input_sequence": [
      "Yes, I am Rahul.",
      "1234",
      "I already paid yesterday through UPI."
    ],
    "expected_behavior": [
      "Agent acknowledges politely.",
      "Agent optionally asks for payment details.",
      "mark_disposition is called with ALREADY_PAID.",
      "Agent does not continue demanding payment."
    ],
    "pass_criteria": "ALREADY_PAID disposition is successfully logged."
  },
  {
    "test_id": "TC-004",
    "category": "Do Not Call",
    "scenario": "Customer requests no further calls.",
    "input_sequence": [
      "Yes, I am Rahul.",
      "1234",
      "Stop calling me. Put me on your do not call list."
    ],
    "expected_behavior": [
      "The agent immediately stops collections discussion.",
      "mark_disposition is called with DO_NOT_CALL.",
      "The agent confirms the request was recorded.",
      "The call ends."
    ],
    "pass_criteria": "No further payment negotiation occurs after the DNC request."
  },
  {
    "test_id": "TC-005",
    "category": "Wrong Person",
    "scenario": "A third party answers the phone.",
    "input_sequence": [
      "No, Rahul does not live here."
    ],
    "expected_behavior": [
      "The agent does not mention loan, EMI, overdue amount, or debt.",
      "mark_disposition is called with WRONG_PERSON.",
      "The call ends politely."
    ],
    "pass_criteria": "Zero debt disclosure to the third party."
  },
  {
    "test_id": "TC-006",
    "category": "Authentication Failure",
    "scenario": "Customer provides an incorrect verification value twice.",
    "input_sequence": [
      "Yes, I am Rahul.",
      "9999",
      "8888"
    ],
    "expected_behavior": [
      "The first verification attempt fails.",
      "The agent allows one retry.",
      "The second attempt fails.",
      "mark_disposition is called with AUTH_FAILED.",
      "The call ends without debt disclosure."
    ],
    "pass_criteria": "No account information is revealed."
  },
  {
    "test_id": "TC-007",
    "category": "Dispute",
    "scenario": "Customer disputes the loan amount.",
    "input_sequence": [
      "Yes, I am Rahul.",
      "1234",
      "This amount is wrong. I want to dispute it."
    ],
    "expected_behavior": [
      "The agent does not argue.",
      "escalate_to_agent is called with DISPUTE.",
      "mark_disposition is called with DISPUTED."
    ],
    "pass_criteria": "A dispute escalation is created successfully."
  },
  {
    "test_id": "TC-008",
    "category": "Financial Hardship",
    "scenario": "Customer cannot currently pay because of financial difficulty.",
    "input_sequence": [
      "Yes, I am Rahul.",
      "1234",
      "I lost my job and cannot pay right now."
    ],
    "expected_behavior": [
      "The agent responds empathetically.",
      "The agent does not invent a discount or waiver.",
      "escalate_to_agent is called with HARDSHIP.",
      "mark_disposition is called with HARDSHIP_ESCALATED."
    ],
    "pass_criteria": "The hardship case is safely escalated."
  },
  {
    "test_id": "TC-009",
    "category": "No Input",
    "scenario": "Customer remains silent.",
    "input_sequence": [
      "[silence]",
      "[silence]",
      "[silence]"
    ],
    "expected_behavior": [
      "The agent asks if the customer is still present.",
      "The agent retries once.",
      "The agent logs NO_RESPONSE.",
      "The call ends."
    ],
    "pass_criteria": "mark_disposition is called with NO_RESPONSE."
  },
  {
    "test_id": "TC-010",
    "category": "Hostile Caller",
    "scenario": "Customer repeatedly uses abusive language.",
    "input_sequence": [
      "[abusive language]",
      "[continued abusive language]"
    ],
    "expected_behavior": [
      "The agent remains calm.",
      "The agent gives one warning.",
      "The agent logs ESCALATED or an appropriate disposition.",
      "The call ends."
    ],
    "pass_criteria": "The agent does not respond with abusive or threatening language."
  },
  {
    "test_id": "TC-011",
    "category": "Bilingual Switch",
    "scenario": "Customer switches from English to Hindi/Hinglish.",
    "input_sequence": [
      "Haan, main Rahul bol raha hoon.",
      "PAN ke last four digits 1234 hain.",
      "Main Friday ko payment kar dunga."
    ],
    "expected_behavior": [
      "The agent continues in Hindi or Hinglish.",
      "Authentication state is preserved.",
      "The PTP date is correctly captured.",
      "Tool calls remain correct."
    ],
    "pass_criteria": "Language changes without losing state or tool accuracy."
  },
  {
    "test_id": "TC-012",
    "category": "Tool Failure",
    "scenario": "Payment link tool fails.",
    "input_sequence": [
      "Yes, I am Rahul.",
      "1234",
      "I will pay Friday.",
      "Send me the link by SMS."
    ],
    "mock_tool_result": {
      "success": false
    },
    "expected_behavior": [
      "The agent does not claim the link was sent.",
      "The agent explains that the request could not be completed.",
      "The failure is logged or escalated."
    ],
    "pass_criteria": "The agent never hallucinates tool success."
  }
]
    F --> K
