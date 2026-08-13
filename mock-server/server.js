const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ---------------------------------------------
// MOCK CUSTOMER DATABASE
// ---------------------------------------------

const customers = {
  "ACC-88392": {
    customerName: "Rahul Sharma",
    verificationCode: "1234",
    birthYear: "1995",
    loanType: "Personal Loan",
    overdueAmount: 8499,
    daysPastDue: 12,
    phone: "REGISTERED_NUMBER"
  }
};

// ---------------------------------------------
// IN-MEMORY CALL DATA
// ---------------------------------------------

const promisesToPay = [];
const dispositions = [];
const escalations = [];

// ---------------------------------------------
// HEALTH CHECK
// ---------------------------------------------

app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "Kapture Finance Collections Voicebot API"
  });
});

// ---------------------------------------------
// VAPI WEBHOOK
// ---------------------------------------------

app.post("/webhook", (req, res) => {
  try {
    const { message } = req.body;

    console.log("\n==============================");
    console.log("Incoming Vapi webhook:");
    console.log(JSON.stringify(req.body, null, 2));
    console.log("==============================\n");

    if (!message || message.type !== "tool-calls") {
      return res.status(200).json({
        status: "acknowledged"
      });
    }

    const toolCalls = message.toolCalls || [];

    const results = toolCalls.map((toolCall) => {
      const toolName = toolCall.function.name;

      let args = toolCall.function.arguments;

      // Vapi may send arguments as a JSON string
      if (typeof args === "string") {
        try {
          args = JSON.parse(args);
        } catch (error) {
          args = {};
        }
      }

      console.log(`Tool called: ${toolName}`);
      console.log("Arguments:", args);

      let result;

      switch (toolName) {

        // -----------------------------------------
        // VERIFY CUSTOMER
        // -----------------------------------------

        case "verify_customer": {
          const { account_id, verification_code } = args;

          const customer = customers[account_id];

          if (!customer) {
            result = {
              verified: false,
              reason: "ACCOUNT_NOT_FOUND"
            };
            break;
          }

          const code = String(verification_code).trim();

          const isVerified =
            code === customer.verificationCode ||
            code === customer.birthYear;

          result = {
            verified: isVerified
          };

          if (isVerified) {
            result.message = "Identity verified successfully.";
          } else {
            result.message = "Verification failed.";
          }

          break;
        }

        // -----------------------------------------
        // LOG PROMISE TO PAY
        // -----------------------------------------

        case "log_promise_to_pay": {
          const {
            account_id,
            ptp_date,
            amount
          } = args;

          const ptpId = `PTP-${Date.now()}`;

          const record = {
            ptp_id: ptpId,
            account_id,
            ptp_date,
            amount,
            created_at: new Date().toISOString()
          };

          promisesToPay.push(record);

          result = {
            success: true,
            ptp_id: ptpId,
            confirmed_date: ptp_date,
            confirmed_amount: amount
          };

          break;
        }

        // -----------------------------------------
        // SEND PAYMENT LINK
        // -----------------------------------------

        case "send_payment_link": {
          const {
            account_id,
            channel
          } = args;

          result = {
            success: true,
            account_id,
            channel,
            message:
              `Mock payment link successfully sent via ${channel}.`
          };

          break;
        }

        // -----------------------------------------
        // ESCALATE TO HUMAN AGENT
        // -----------------------------------------

        case "escalate_to_agent": {
          const {
            account_id,
            reason,
            notes
          } = args;

          const escalationId = `ESC-${Date.now()}`;

          escalations.push({
            escalation_id: escalationId,
            account_id,
            reason,
            notes,
            created_at: new Date().toISOString()
          });

          result = {
            success: true,
            escalation_id: escalationId,
            status: "ESCALATION_CREATED"
          };

          break;
        }

        // -----------------------------------------
        // MARK CALL DISPOSITION
        // -----------------------------------------

        case "mark_disposition": {
          const {
            account_id,
            status,
            notes
          } = args;

          const disposition = {
            account_id,
            status,
            notes: notes || "",
            timestamp: new Date().toISOString()
          };

          dispositions.push(disposition);

          result = {
            success: true,
            disposition_logged: status
          };

          break;
        }

        // -----------------------------------------
        // UNKNOWN TOOL
        // -----------------------------------------

        default:
          result = {
            success: false,
            error: `Unknown tool: ${toolName}`
          };
      }

      return {
        toolCallId: toolCall.id,
        result: JSON.stringify(result)
      };
    });

    return res.status(200).json({
      results
    });

  } catch (error) {

    console.error("Webhook error:", error);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
});

app.listen(PORT, () => {
  console.log(`
=========================================
Kapture Collections Mock Server Running
Port: ${PORT}

Webhook:
http://localhost:${PORT}/webhook
=========================================
`);
});
