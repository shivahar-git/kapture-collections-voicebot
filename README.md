# Kapture Finance Collections Voicebot
An outbound Voice AI collections agent built for the Kapture AI Delivery Intern take-home assignment.

The voice agent, **Maya**, calls customers with overdue loan payments and attempts to resolve routine collections conversations through authentication, intent detection, Promise-to-Pay capture, payment link delivery, escalation, and disposition logging.

## Demo

### Successful Promise-to-Pay

Demo link:

`ADD_YOUR_LOOM_OR_VAPI_RECORDING_LINK_HERE`

### Edge Case Demo

Demo link:

`ADD_YOUR_SECOND_DEMO_LINK_HERE`

---

# Features

* Outbound collections conversation flow
* Strict authentication before debt disclosure
* Explicit conversation states
* Promise-to-Pay capture
* Mock payment link delivery
* Already-paid handling
* Dispute escalation
* Financial hardship escalation
* Do-Not-Call handling
* Wrong-person protection
* Authentication failure handling
* No-input handling
* English and Hindi/Hinglish support
* Structured call disposition logging
* Tool failure guardrails

---

# Architecture

```text
Customer
   │
   ▼
Telephony / PSTN
   │
   ▼
Vapi
   │
   ├── Deepgram STT
   │
   ▼
Conversation State Controller
   │
   ▼
LLM
   │
   ├──────────────► Mock Webhook API
   │                       │
   │                       ▼
   │                   Mock Data
   │
   ▼
ElevenLabs / Cartesia TTS
   │
   ▼
Customer
```

Detailed architecture:

See:

`docs/HLD_Document.md`

and

`docs/architecture.md`

---

# Project Structure

```text
kapture-collections-voicebot/
│
├── README.md
│
├── docs/
│   ├── HLD_Document.md
│   └── architecture.md
│
├── vapi/
│   ├── system_prompt.txt
│   └── tool_definitions.json
│
├── mock-server/
│   ├── package.json
│   ├── server.js
│   ├── .env.example
│   └── .gitignore
│
└── tests/
    └── test_cases.json
```

---

# Technology Choices

## Voice Platform

Vapi

Vapi was selected because it provides a simple way to connect:

* Telephony
* Speech-to-text
* LLM
* Text-to-speech
* Function calling
* Webhooks

into a single voice application.

## Transcriber

Deepgram Nova-2

Reasons:

* Low latency
* Real-time transcription
* Suitable for conversational audio
* Supports multilingual conversations

## Language Model

GPT-4o-mini or GPT-4o

Reasons:

* Good tool calling capability
* Fast response generation
* Strong instruction following
* Suitable for structured conversation flows

A low temperature is recommended to reduce unpredictable behavior.

## Voice

ElevenLabs or Cartesia

Reasons:

* Natural conversational speech
* Professional voice quality
* Low-latency voice generation

---

# Authentication Design

The most important guardrail in this project is:

## No debt disclosure before successful verification

The agent cannot reveal:

* Loan information
* EMI information
* Overdue amount
* Days past due
* Debt status

until:

```text
verify_customer()
```

returns:

```json
{
  "verified": true
}
```

The intended state transition is:

```text
AUTH_PENDING

↓

verify_customer()

↓

verified = true

↓

AUTHENTICATED

↓

Debt Disclosure Allowed
```

A customer simply saying:

> "Yes, I am Rahul."

does not count as authentication.

---

# Local Setup

## 1. Clone the Repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd kapture-collections-voicebot
```

## 2. Install Dependencies

```bash
cd mock-server
npm install
```

## 3. Configure Environment

Create:

```text
.env
```

Copy the following:

```env
PORT=3000
```

## 4. Start the Server

```bash
npm start
```

The server should run at:

```text
http://localhost:3000
```

The Vapi webhook endpoint is:

```text
http://localhost:3000/webhook
```

---

# Exposing the Webhook

Vapi cannot access localhost directly.

For local development, use ngrok:

```bash
ngrok http 3000
```

Example:

```text
https://abc123.ngrok-free.app
```

Webhook:

```text
https://abc123.ngrok-free.app/webhook
```

Use this URL in the Vapi tool configuration.

---

# Mock Customer

The project contains a mock customer:

```text
Name: Rahul Sharma
Account ID: ACC-88392
Verification Code: 1234
Alternative Verification: 1995
Loan Type: Personal Loan
Overdue Amount: ₹8,499
Days Past Due: 12
```

The verification data is only used by the mock backend.

---

# Vapi Setup

## Assistant Configuration

Recommended configuration:

### Transcriber

```text
Provider: Deepgram
Model: Nova-2
```

### LLM

```text
Provider: OpenAI
Model: GPT-4o-mini or GPT-4o
Temperature: 0.1
```

### Voice

Use a professional female voice from:

```text
ElevenLabs
```

or:

```text
Cartesia
```

## System Prompt

Copy the content from:

```text
vapi/system_prompt.txt
```

into the Vapi assistant system prompt.

## Tools

Register the functions from:

```text
vapi/tool_definitions.json
```

Configure the server/webhook URL:

```text
https://YOUR_PUBLIC_URL/webhook
```

---

# Available Tools

## verify_customer

Verifies customer identity.

Required before debt disclosure.

## log_promise_to_pay

Records:

* Payment date
* Payment amount

## send_payment_link

Sends a mock payment link through:

* SMS
* WhatsApp
* Both

## escalate_to_agent

Escalates:

* Disputes
* Hardship
* Customer requests
* Tool failures

## mark_disposition

Records the final call outcome.

---

# Demo Scenarios

## Scenario 1 — Promise to Pay

Example flow:

```text
Maya:
Hello, this is Maya calling from Kapture Finance.
Am I speaking with Rahul Sharma?

Customer:
Yes.

Maya:
For your privacy and security, please confirm the last
four digits of your PAN or your year of birth.

Customer:
1234.

Tool:
verify_customer → verified: true

Maya:
Thank you for verifying. An EMI of ₹8,499 is currently
overdue by 12 days. When would you be able to make the payment?

Customer:
I will pay this Friday.

Tool:
log_promise_to_pay

Customer:
Send the link by SMS.

Tool:
send_payment_link

Tool:
mark_disposition(PTP_AGREED)

Maya:
Thank you. I've recorded your payment commitment and sent
the payment link to your registered mobile number.
```

---

## Scenario 2 — Already Paid

```text
Customer:
I already paid yesterday using UPI.

Maya:
Thank you for letting me know. Could you share the approximate
payment date or reference number if available?

Tool:
mark_disposition(ALREADY_PAID)

Maya:
Thank you. I've recorded that information for verification.
```

---

## Scenario 3 — Do Not Call

```text
Customer:
Stop calling me.

Tool:
mark_disposition(DO_NOT_CALL)

Maya:
Understood. I've recorded your request.

Call ends.
```

---

# What Broke and How I Debugged It

## Issue 1: Vapi Could Not Reach Localhost

Problem:

Vapi could not call:

```text
http://localhost:3000/webhook
```

Reason:

The Vapi cloud service cannot access a local machine.

Solution:

Used ngrok to create a public HTTPS URL.

```bash
ngrok http 3000
```

---

## Issue 2: Tool Arguments Arrived as a String

Problem:

The function arguments may arrive as JSON strings.

Solution:

The backend checks:

```javascript
if (typeof args === "string") {
  args = JSON.parse(args);
}
```

This allows the server to safely process both string and object formats.

---

## Issue 3: Preventing Debt Disclosure Before Verification

Problem:

An LLM can sometimes be persuaded to skip a conversational step.

Solution:

The design uses:

* Explicit conversation states
* Strict system prompt instructions
* Backend verification
* A required `verified: true` tool result

The authenticated state cannot be entered based only on the customer's spoken claim.

---

## Issue 4: Tool Failure

Problem:

The agent might incorrectly claim that a payment link was sent after a failed API call.

Solution:

The system prompt explicitly requires that actions are only confirmed after a successful tool result.

---

# Testing

Test cases are available in:

```text
tests/test_cases.json
```

The tests include:

* Authentication guardrail
* Promise-to-Pay
* Already paid
* Do Not Call
* Wrong person
* Authentication failure
* Dispute
* Financial hardship
* Silence
* Hostile caller
* Hindi/Hinglish language switch
* Tool failure

---

# Observability

Recommended metrics:

* Containment rate
* Promise-to-Pay rate
* Authentication success rate
* Tool success rate
* Average STT latency
* Average LLM latency
* Average TTS latency
* Tool latency
* Call drop rate
* Disposition completion rate

Recommended structured fields:

```text
call_id
timestamp
conversation_state
intent
tool_name
tool_success
tool_latency_ms
authentication_result
disposition
language
error
```

---

# Improvements With More Time

With additional time, I would implement:

1. Persistent PostgreSQL database
2. OTP-based customer authentication
3. Encrypted sensitive data
4. Redis conversation state management
5. Real SMS integration
6. WhatsApp integration
7. Real payment gateway integration
8. Human-agent warm transfer
9. Automated prompt regression testing
10. Load testing
11. Monitoring dashboard
12. Conversation quality evaluation framework
13. Idempotency keys for payment actions
14. Real-time alerts for tool failures

---

# Key Design Decision

The most important decision in this project is that authentication is treated as a state transition rather than only a prompt instruction.

The bot can disclose debt information only after:

```text
verify_customer → verified: true
```

This makes the conversation flow easier to test and reduces the risk of accidental third-party debt disclosure.

---

# Author

Balewar Shivahar

Kapture AI Delivery Intern — Take-Home Assignment

