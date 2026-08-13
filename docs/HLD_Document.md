# High-Level Design

## 1. Overview

### Project Name

Kapture Finance Collections Voicebot

### Voice Agent

Maya

### Objective

The objective of this project is to design and implement an automated outbound Voice AI collections agent for Kapture Finance.

The agent calls customers with overdue loan payments, verifies their identity before disclosing confidential information, understands their intent, records payment commitments, sends payment links, and escalates complex cases when required.

The design prioritizes:

* Customer privacy
* Authentication before debt disclosure
* Fair and respectful communication
* Low response latency
* Reliable tool execution
* Complete call disposition logging
* Safe escalation for disputes and hardship cases

### Example Customer Context

| Field         | Value         |
| ------------- | ------------- |
| Customer      | Rahul Sharma  |
| Account ID    | ACC-88392     |
| Loan Type     | Personal Loan |
| Overdue EMI   | ₹8,499        |
| Days Past Due | 12            |

All account information is confidential until successful identity verification.

---

# 2. System Architecture

The voicebot uses the following pipeline:

Customer Phone

↓

Telephony / PSTN

↓

Vapi Voice Platform

↓

Speech-to-Text

↓

Conversation State Controller

↓

LLM Orchestrator

↓

Tool / Webhook Layer

↓

Text-to-Speech

↓

Customer

The main components are:

## Telephony

The telephony layer places or receives the phone call and streams audio to the voice platform.

## Vapi

Vapi acts as the voice orchestration layer and coordinates:

* Audio streaming
* Speech-to-text
* LLM interaction
* Function calling
* Text-to-speech
* Call lifecycle events

## Speech-to-Text

Deepgram Nova-2 is used for real-time transcription.

The transcriber should support English and Hindi/Hinglish conversations.

## Conversation State Controller

The state controller is responsible for enforcing conversation transitions.

Authentication is not based only on instructions in the LLM prompt.

The authenticated state is entered only after the backend tool returns:

```json
{
  "verified": true
}
```

## LLM Orchestrator

The LLM handles:

* Intent recognition
* Entity extraction
* Conversation generation
* Tool selection
* Conversation flow

A low temperature is preferred to make responses predictable and compliant.

## Webhook / Tool Server

The backend provides mock APIs for:

* Customer verification
* Promise-to-Pay logging
* Payment link delivery
* Human escalation
* Call disposition logging

## Text-to-Speech

ElevenLabs or Cartesia converts the generated response into natural voice output.

---

# 3. Architecture Diagram

See:

`docs/architecture.md`

The system follows this logical flow:

```text
Customer
   │
   ▼
Telephony / PSTN
   │
   ▼
Vapi
   │
   ├──────────────► Deepgram STT
   │                     │
   │                     ▼
   │              Conversation State
   │                     │
   │                     ▼
   │                  LLM
   │                     │
   │             Tool Required?
   │              /         \
   │            Yes          No
   │             │            │
   ▼             ▼            ▼
Customer ◄── TTS ◄── Webhook / API
                     │
                     ▼
                  Mock DB
```

---

# 4. Latency Budget

The target end-to-end response latency is less than approximately 1.2 seconds.

| Component                   | Target Latency |
| --------------------------- | -------------: |
| Telephony / Network         |     150–200 ms |
| Speech-to-Text              |        ~200 ms |
| LLM First Response          |        ~400 ms |
| Text-to-Speech              |        ~300 ms |
| Additional Network Overhead |        ~100 ms |
| Target Total                |  < 1.2 seconds |

Tool calls may add additional latency depending on the operation.

For frequently used tools, the backend should respond quickly and avoid unnecessary database operations.

---

# 5. Conversation State Machine

The voicebot uses explicit conversation states.

```text
INIT
 │
 ▼
CONFIRM_PERSON
 │
 ├── Wrong Person ───────────────► END
 │
 ▼
AUTH_PENDING
 │
 ├── Verification Failed ────────► AUTH_RETRY
 │                                     │
 │                                     └── Failed Again ─► END
 │
 └── verify_customer = true
                │
                ▼
          AUTHENTICATED
                │
                ▼
           DISCLOSURE
                │
                ▼
           NEGOTIATION
       ┌────────┼─────────┬───────────┬──────────┐
       ▼        ▼         ▼           ▼          ▼
    WILL_PAY ALREADY_PAID HARDSHIP  DISPUTE     DNC
       │        │         │           │          │
       ▼        ▼         ▼           ▼          ▼
      PTP   DISPOSITION ESCALATE    ESCALATE   DISPOSITION
       │                  │           │          │
       └──────────────┬───┴───────────┴──────────┘
                      ▼
                    END
```

## Authentication Lock

The following is a mandatory transition:

```text
AUTH_PENDING
      │
      ▼
verify_customer()
      │
      ├── verified: false → remain unauthenticated
      │
      └── verified: true
              │
              ▼
         AUTHENTICATED
```

The bot must never enter the authenticated state because:

* The customer knows the target name
* The customer claims to be Rahul
* The customer requests account details
* The customer pressures the bot to skip verification

Only the backend verification result can unlock account disclosure.

---

# 6. Intents and Entities

| Intent                | Description                         | Entities                        |
| --------------------- | ----------------------------------- | ------------------------------- |
| Confirm Identity      | Customer confirms target identity   | Name                            |
| Promise To Pay        | Customer agrees to make payment     | PTP date, amount                |
| Cannot Pay / Hardship | Customer cannot currently pay       | Hardship reason                 |
| Already Paid          | Customer says payment was made      | Date, payment method, reference |
| Dispute Debt          | Customer disputes loan or amount    | Dispute reason                  |
| Wrong Person          | Another person answered             | Relationship / availability     |
| Callback Request      | Customer requests another call time | Preferred callback time         |
| Do Not Call           | Customer requests no further calls  | DNC request                     |
| Hostile               | Customer becomes abusive            | Abuse level                     |
| No Response           | Silence or voicemail                | Timeout count                   |

## Important Extracted Entities

### PTP Date

Normalized to:

```text
YYYY-MM-DD
```

Example:

```text
Friday
```

becomes the confirmed upcoming Friday date after clarification.

### PTP Amount

Example:

```text
8499
```

### Verification Code

Used only by the verification backend.

Verification data should not be stored in normal conversation logs.

---

# 7. Tool and API Design

## 7.1 verify_customer

Purpose:

Verify customer identity before disclosing account information.

### Input

```json
{
  "account_id": "ACC-88392",
  "verification_code": "1234"
}
```

### Output

```json
{
  "verified": true,
  "message": "Identity verified successfully."
}
```

Security rule:

The LLM should only use the verification result to determine whether it may proceed.

---

## 7.2 log_promise_to_pay

Purpose:

Record a confirmed customer payment commitment.

### Input

```json
{
  "account_id": "ACC-88392",
  "ptp_date": "2026-08-14",
  "amount": 8499
}
```

### Output

```json
{
  "success": true,
  "ptp_id": "PTP-123456",
  "confirmed_date": "2026-08-14",
  "confirmed_amount": 8499
}
```

---

## 7.3 send_payment_link

Purpose:

Send a mock payment link to the registered mobile number.

### Input

```json
{
  "account_id": "ACC-88392",
  "channel": "SMS"
}
```

### Output

```json
{
  "success": true,
  "message": "Payment link successfully sent."
}
```

---

## 7.4 escalate_to_agent

Purpose:

Escalate a dispute, hardship request, or unresolved case.

### Input

```json
{
  "account_id": "ACC-88392",
  "reason": "DISPUTE",
  "notes": "Customer disputes the outstanding amount."
}
```

### Output

```json
{
  "success": true,
  "escalation_id": "ESC-123456",
  "status": "ESCALATION_CREATED"
}
```

---

## 7.5 mark_disposition

Purpose:

Record the final outcome of the call.

### Input

```json
{
  "account_id": "ACC-88392",
  "status": "PTP_AGREED",
  "notes": "Customer promised to pay full amount on Friday."
}
```

Possible statuses:

```text
PTP_AGREED
ALREADY_PAID
DISPUTED
HARDSHIP_ESCALATED
WRONG_PERSON
DO_NOT_CALL
NO_RESPONSE
AUTH_FAILED
CALLBACK_REQUESTED
ESCALATED
```

---

# 8. Authentication and Data Safety

## Authentication Process

The bot follows this sequence:

1. Confirm whether the target customer is speaking.
2. Ask for a verification value.
3. Call `verify_customer`.
4. Wait for the backend result.
5. Reveal account information only if:

```text
verified = true
```

## Third-Party Protection

If another person answers:

The bot must not mention:

* Loan
* EMI
* Overdue payment
* Amount
* Debt
* Days past due

The bot may only ask whether Rahul Sharma is available.

## Sensitive Logging

Sensitive values should be masked.

Example:

```text
Rahul S****
ACC-****
Verification: [REDACTED]
```

Raw verification codes should not be stored in application logs.

---

# 9. Guardrails and Compliance

The voicebot follows these behavioral rules.

## Required Behavior

The bot must:

* Identify itself as Maya.
* Identify Kapture Finance.
* Verify identity before debt disclosure.
* Maintain a respectful tone.
* Avoid threats and harassment.
* Handle Do-Not-Call requests immediately.
* Escalate disputes instead of arguing.
* Avoid inventing discounts or settlements.
* Confirm tool actions only after successful tool results.

## Hallucination Prevention

The model must not invent:

* Payment confirmations
* Payment links
* Discounts
* Waivers
* Settlements
* Legal actions
* Penalties
* Callback confirmations
* Account details

Tool results are the source of truth.

---

# 10. Edge Cases

| Scenario             | Bot Behavior                                           |
| -------------------- | ------------------------------------------------------ |
| Already Paid         | Capture optional payment details and mark ALREADY_PAID |
| Dispute              | Escalate to human resolution team                      |
| Hardship             | Show empathy and escalate                              |
| Do Not Call          | Immediately log DNC and end                            |
| Wrong Person         | Do not disclose debt and end                           |
| Verification Failure | Allow one retry and then end                           |
| Silence              | Two prompts, then NO_RESPONSE                          |
| Voicemail            | Do not disclose debt; end with appropriate disposition |
| Abusive Caller       | Give one warning, then end if behavior continues       |
| Tool Failure         | Do not claim success; escalate or log failure          |
| Language Switch      | Continue in Hindi/Hinglish while preserving state      |

---

# 11. Escalation Strategy

The call should be escalated when:

* The customer disputes the account.
* The customer reports financial hardship.
* The customer requests a human agent.
* A required tool repeatedly fails.
* The conversation cannot be safely resolved.

The escalation flow is:

```text
Customer Issue
      │
      ▼
escalate_to_agent
      │
      ▼
mark_disposition
      │
      ▼
Polite Closing
```

---

# 12. Call Disposition

Every completed call should attempt to log an outcome.

Examples:

```text
PTP_AGREED
ALREADY_PAID
DISPUTED
HARDSHIP_ESCALATED
WRONG_PERSON
DO_NOT_CALL
NO_RESPONSE
AUTH_FAILED
CALLBACK_REQUESTED
ESCALATED
```

This allows downstream teams to understand the result of every call.

---

# 13. Observability

Each call should generate structured logs.

## Recommended Fields

```text
call_id
timestamp
conversation_state
detected_intent
tool_name
tool_success
tool_latency_ms
authentication_result
disposition
language
error_message
```

## Metrics

### Containment Rate

Percentage of calls resolved without a human agent.

```text
Resolved without escalation
────────────────────────── × 100
Total completed calls
```

### Promise-to-Pay Rate

Percentage of authenticated conversations that result in a valid PTP.

### Authentication Success Rate

```text
Successful authentications
────────────────────────── × 100
Authentication attempts
```

### Tool Success Rate

Measures successful webhook execution.

### Average Response Latency

Tracks:

* STT latency
* LLM latency
* Tool latency
* TTS latency

### Call Drop Rate

Percentage of calls terminated unexpectedly.

### Disposition Completion Rate

Percentage of completed calls that have a valid disposition.

---

# 14. Failure Handling

## Tool Failure

If a tool fails:

1. Do not pretend the action succeeded.
2. Inform the customer briefly.
3. Attempt safe fallback.
4. Escalate when appropriate.
5. Log the final disposition.

## Network Failure

The system should:

* Record the error.
* Preserve the current conversation state if possible.
* Avoid duplicate payment commitments.
* Avoid sending duplicate payment links.

## Duplicate Tool Calls

In a production system, payment and PTP tools should use idempotency keys.

Example:

```text
call_id + tool_name + action_timestamp
```

This prevents accidental duplicate actions.

---

# 15. Bilingual Support

The bot begins in English.

If the customer switches to Hindi or Hinglish, the bot should continue in that language.

Example:

Customer:

```text
Haan, main Rahul bol raha hoon.
```

Maya:

```text
Thank you. Security ke liye, account ki details discuss karne se pehle mujhe aapki identity verify karni hogi.
```

The language can change, but the conversation state must remain unchanged.

---

# 16. Future Improvements

With additional time, the following improvements could be implemented:

* Real customer database
* Encrypted verification
* OTP-based authentication
* Persistent database
* Redis-based conversation state
* Production payment gateway
* Real SMS and WhatsApp integration
* Automated evaluation framework
* Load testing
* Prompt regression tests
* Real-time monitoring dashboard
* Human-agent warm transfer
* Automated call scheduling based on customer availability

---

# 17. Conclusion

This design provides a working foundation for a compliant collections voicebot.

The most important architectural decision is that debt disclosure is protected by a strict authentication gate.

The LLM cannot independently decide to reveal debt information. The transition to the authenticated state depends on the backend verification result.

This reduces the risk of third-party disclosure and makes the system easier to test, debug, and improve.
