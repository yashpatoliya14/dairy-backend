# 📱 WhatsApp Business API — Integration Guide for Milk Management App

> **Author:** Admin  
> **Date:** 13 October 2026  
> **Project:** Milk Management Admin Panel  
> **Backend Stack:** NestJS + TypeScript + PostgreSQL (Supabase)

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. API Credentials & Configuration](#2-api-credentials--configuration)
- [3. How to Find Your App Secret](#3-how-to-find-your-app-secret)
- [4. Environment Setup (.env)](#4-environment-setup-env)
- [5. Install Required Packages](#5-install-required-packages)
- [6. API Base URL & Authentication](#6-api-base-url--authentication)
- [7. Send a Text Message to a Customer](#7-send-a-text-message-to-a-customer)
- [8. Send a Template Message to a Customer](#8-send-a-template-message-to-a-customer)
- [9. Send Messages to Bulk Customer List](#9-send-messages-to-bulk-customer-list)
- [10. Message Templates — Create & Manage](#10-message-templates--create--manage)
- [11. Webhook Setup — Receive Incoming Messages](#11-webhook-setup--receive-incoming-messages)
- [12. NestJS Service — Complete Implementation](#12-nestjs-service--complete-implementation)
- [13. NestJS Controller — API Endpoints](#13-nestjs-controller--api-endpoints)
- [14. NestJS Module](#14-nestjs-module)
- [15. Message Status & Delivery Tracking](#15-message-status--delivery-tracking)
- [16. Media Messages (Images, Documents, etc.)](#16-media-messages-images-documents-etc)
- [17. Rate Limits & Best Practices](#17-rate-limits--best-practices)
- [18. Troubleshooting](#18-troubleshooting)
- [19. Useful Links](#19-useful-links)

---

## 1. Overview

We use the **WhatsApp Business Cloud API** (hosted by Meta) to send notifications, delivery updates, and promotional messages to our milk delivery customers directly on WhatsApp.

**What we can do:**
- ✅ Send text messages to customers (within 24-hour window)
- ✅ Send template messages to customers (anytime — no 24-hour restriction)
- ✅ Send bulk messages to customer lists
- ✅ Send media (images, PDFs, documents)
- ✅ Receive incoming messages via webhooks
- ✅ Track message delivery status (sent, delivered, read)

**Key Concept — The 24-Hour Customer Service Window:**
> When a customer messages your WhatsApp Business number, a **24-hour window** opens.  
> During this window, you can send **free-form text messages** (no template needed).  
> **Outside this window**, you can ONLY send **pre-approved template messages** (which Meta reviews and approves).  
> For our Milk Management app, we'll mostly use **template messages** for proactive notifications.

---

## 2. API Credentials & Configuration

> [!CAUTION]
> **NEVER commit these credentials to Git.** Store them in `.env` only. The `.env` file is already in `.gitignore`.

| Property | Value | Description |
|---|---|---|
| **WhatsApp Business Account ID (WABA ID)** | `956649247030355` | Your WhatsApp Business Account identifier |
| **Phone Number ID** | `1307155675822696` | The ID of your registered WhatsApp phone number |
| **Permanent Access Token** | `EAAzw1veo958BSvlSfcjWKIE5tv3zh3tkBmMOvcrBbaPXRxdnDLUMEe7lW6Qi9AMcpntZAPgv3f4hHTIVHPBF4BaxVVRfQ2jYMPCSKjewTF8y5bx5Ry7n31jfZADHchje9XGD6NGBgBkLWhDmQv9tvMXbhabFCTfSIcMSBJHJATCISHrAaov0ZCuP3ol1h2WMo2w0wppnlrocbNSRwaxmWdIxg6PGyQLhaVdSfLdzXtk3TfgdeuDuzl734mD0e2bHP65K79RdM950LIIdTOf` | System User access token (never share publicly) |
| **App ID** | `3642505789241247` | Your Meta App ID |
| **App Secret** | ⚠️ **See [Section 3](#3-how-to-find-your-app-secret) below** | Required for webhook signature verification |
| **Webhook Verify Token** | `48c24a6eb8489621c4e9a22933d477dd19c4f37d2513d7ec` | A secret string we chose — used to verify webhook setup |
| **Registered Phone Number** | `+91 9104152524` | The WhatsApp number we send messages FROM |
| **API Version** | `v21.0` | Current Graph API version (update periodically) |
| **API Base URL** | `https://graph.facebook.com/v21.0` | Base URL for all API calls |

---

## 3. How to Find Your App Secret

The **App Secret** is required for **verifying webhook signatures** (to confirm payloads actually come from Meta). Here's how to get it:

### Step-by-step:

1. Go to **[Meta Developer Dashboard](https://developers.facebook.com/apps/)**
2. Click on your app: **App ID `3642505789241247`**
3. In the left sidebar, go to **Settings** → **Basic**
4. You'll see **App Secret** — click **"Show"** and enter your password
5. Copy the App Secret value
6. Add it to your `.env` file as `WHATSAPP_APP_SECRET=your_app_secret_here`

> [!IMPORTANT]
> The App Secret is like a password for your app. **Never expose it in frontend code or public repositories.**

---

## 4. Environment Setup (.env)

Add these variables to your `backend/.env` file:

```env
# ============================================
# WhatsApp Business API Configuration
# ============================================
WHATSAPP_API_VERSION=v21.0
WHATSAPP_API_URL=https://graph.facebook.com/v21.0
WHATSAPP_BUSINESS_ACCOUNT_ID=956649247030355
WHATSAPP_PHONE_NUMBER_ID=1307155675822696
WHATSAPP_ACCESS_TOKEN=EAAzw1veo958BSvlSfcjWKIE5tv3zh3tkBmMOvcrBbaPXRxdnDLUMEe7lW6Qi9AMcpntZAPgv3f4hHTIVHPBF4BaxVVRfQ2jYMPCSKjewTF8y5bx5Ry7n31jfZADHchje9XGD6NGBgBkLWhDmQv9tvMXbhabFCTfSIcMSBJHJATCISHrAaov0ZCuP3ol1h2WMo2w0wppnlrocbNSRwaxmWdIxg6PGyQLhaVdSfLdzXtk3TfgdeuDuzl734mD0e2bHP65K79RdM950LIIdTOf
WHATSAPP_APP_ID=3642505789241247
WHATSAPP_APP_SECRET=PASTE_YOUR_APP_SECRET_HERE
WHATSAPP_WEBHOOK_VERIFY_TOKEN=48c24a6eb8489621c4e9a22933d477dd19c4f37d2513d7ec
WHATSAPP_PHONE_NUMBER=919104152524
```

Update `backend/.env.example` to include placeholder versions (no real values):

```env
# WhatsApp Business API
WHATSAPP_API_VERSION=v21.0
WHATSAPP_API_URL=https://graph.facebook.com/v21.0
WHATSAPP_BUSINESS_ACCOUNT_ID=your_waba_id
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_permanent_access_token
WHATSAPP_APP_ID=your_app_id
WHATSAPP_APP_SECRET=your_app_secret
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token
WHATSAPP_PHONE_NUMBER=your_phone_with_country_code
```

---

## 5. Install Required Packages

```bash
cd backend
npm install axios
```

> We use `axios` for HTTP calls to the WhatsApp Cloud API. The NestJS `@nestjs/config` is already installed for reading `.env` values.

---

## 6. API Base URL & Authentication

All WhatsApp Cloud API calls go to:

```
https://graph.facebook.com/{API_VERSION}/{ENDPOINT}
```

**Authentication:** Every request must include the access token in the `Authorization` header:

```
Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
```

**Example — Test your connection (cURL):**

```bash
curl -X GET "https://graph.facebook.com/v21.0/1307155675822696" \
  -H "Authorization: Bearer EAAzw1veo958BSvlSfcjWKIE5tv3zh3tkBmMOvcrBbaPXRxdnDLUMEe7lW6Qi9AMcpntZAPgv3f4hHTIVHPBF4BaxVVRfQ2jYMPCSKjewTF8y5bx5Ry7n31jfZADHchje9XGD6NGBgBkLWhDmQv9tvMXbhabFCTfSIcMSBJHJATCISHrAaov0ZCuP3ol1h2WMo2w0wppnlrocbNSRwaxmWdIxg6PGyQLhaVdSfLdzXtk3TfgdeuDuzl734mD0e2bHP65K79RdM950LIIdTOf"
```

If successful, you'll get your phone number details back. ✅

---

## 7. Send a Text Message to a Customer

> [!NOTE]
> Text messages can **only** be sent within the **24-hour customer service window** (after the customer messages you first).

### API Endpoint

```
POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages
```

### Request Headers

```
Authorization: Bearer {ACCESS_TOKEN}
Content-Type: application/json
```

### Request Body

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "919876543210",
  "type": "text",
  "text": {
    "preview_url": false,
    "body": "Hello! Your milk delivery for tomorrow is confirmed. 🥛"
  }
}
```

### cURL Example

```bash
curl -X POST "https://graph.facebook.com/v21.0/1307155675822696/messages" \
  -H "Authorization: Bearer EAAzw1veo958BSvlSfcjWKIE5tv3zh3tkBmMOvcrBbaPXRxdnDLUMEe7lW6Qi9AMcpntZAPgv3f4hHTIVHPBF4BaxVVRfQ2jYMPCSKjewTF8y5bx5Ry7n31jfZADHchje9XGD6NGBgBkLWhDmQv9tvMXbhabFCTfSIcMSBJHJATCISHrAaov0ZCuP3ol1h2WMo2w0wppnlrocbNSRwaxmWdIxg6PGyQLhaVdSfLdzXtk3TfgdeuDuzl734mD0e2bHP65K79RdM950LIIdTOf" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "recipient_type": "individual",
    "to": "919876543210",
    "type": "text",
    "text": {
      "preview_url": false,
      "body": "Hello! Your milk delivery for tomorrow is confirmed. 🥛"
    }
  }'
```

### Success Response

```json
{
  "messaging_product": "whatsapp",
  "contacts": [
    {
      "input": "919876543210",
      "wa_id": "919876543210"
    }
  ],
  "messages": [
    {
      "id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRB..."
    }
  ]
}
```

---

## 8. Send a Template Message to a Customer

> [!IMPORTANT]
> Template messages can be sent **anytime** — no 24-hour window restriction. This is the primary method for our Milk Management app (delivery notifications, payment reminders, etc.). Templates must be **approved by Meta** before use.

### API Endpoint

```
POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages
```

### Example: Send `hello_world` template (pre-approved default)

```json
{
  "messaging_product": "whatsapp",
  "to": "919876543210",
  "type": "template",
  "template": {
    "name": "hello_world",
    "language": {
      "code": "en_US"
    }
  }
}
```

### Example: Send custom template with parameters

Suppose you create a template called `delivery_update` with body:  
`"Hi {{1}}, your {{2}} delivery is scheduled for {{3}} at {{4}}."`

```json
{
  "messaging_product": "whatsapp",
  "to": "919876543210",
  "type": "template",
  "template": {
    "name": "delivery_update",
    "language": {
      "code": "en_US"
    },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Ramesh" },
          { "type": "text", "text": "Cow Milk (1 Litre)" },
          { "type": "text", "text": "14 Oct 2026" },
          { "type": "text", "text": "6:30 AM" }
        ]
      }
    ]
  }
}
```

### cURL Example

```bash
curl -X POST "https://graph.facebook.com/v21.0/1307155675822696/messages" \
  -H "Authorization: Bearer EAAzw1veo958BSvlSfcjWKIE5tv3zh3tkBmMOvcrBbaPXRxdnDLUMEe7lW6Qi9AMcpntZAPgv3f4hHTIVHPBF4BaxVVRfQ2jYMPCSKjewTF8y5bx5Ry7n31jfZADHchje9XGD6NGBgBkLWhDmQv9tvMXbhabFCTfSIcMSBJHJATCISHrAaov0ZCuP3ol1h2WMo2w0wppnlrocbNSRwaxmWdIxg6PGyQLhaVdSfLdzXtk3TfgdeuDuzl734mD0e2bHP65K79RdM950LIIdTOf" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "919876543210",
    "type": "template",
    "template": {
      "name": "hello_world",
      "language": { "code": "en_US" }
    }
  }'
```

---

## 9. Send Messages to Bulk Customer List

> [!WARNING]
> WhatsApp does **NOT** have a bulk messaging API endpoint. You must send **one message per API call**, looping through your customer list. Always add a **delay between calls** to avoid rate limiting.

### Strategy for Bulk Messaging

```
For each customer in customer_list:
   1. Send template message to customer.phone
   2. Wait 100ms (to respect rate limits)
   3. Log success/failure
```

### TypeScript Example — Bulk Send

```typescript
import axios from 'axios';

interface Customer {
  name: string;
  phone: string;  // Format: "919876543210" (country code + number, no + sign)
}

async function sendBulkTemplateMessages(
  customers: Customer[],
  templateName: string,
): Promise<void> {
  const API_URL = process.env.WHATSAPP_API_URL;
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

  const results = { success: 0, failed: 0, errors: [] as string[] };

  for (const customer of customers) {
    try {
      const response = await axios.post(
        `${API_URL}/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: customer.phone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en_US' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: customer.name },
                ],
              },
            ],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
        },
      );

      console.log(`✅ Sent to ${customer.name} (${customer.phone}): ${response.data.messages[0].id}`);
      results.success++;
    } catch (error: any) {
      const errMsg = error.response?.data?.error?.message || error.message;
      console.error(`❌ Failed for ${customer.name} (${customer.phone}): ${errMsg}`);
      results.failed++;
      results.errors.push(`${customer.phone}: ${errMsg}`);
    }

    // Rate limit delay — wait 100ms between messages
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`\n📊 Bulk Send Summary: ${results.success} sent, ${results.failed} failed`);
}
```

### Phone Number Format Rules

| ✅ Correct | ❌ Wrong |
|---|---|
| `919876543210` | `+919876543210` |
| `919876543210` | `09876543210` |
| `919876543210` | `9876543210` |

> Always use **country code + number** without `+`, spaces, or dashes.

---

## 10. Message Templates — Create & Manage

### List All Templates

```bash
curl -X GET "https://graph.facebook.com/v21.0/956649247030355/message_templates" \
  -H "Authorization: Bearer EAAzw1veo958BSvlSfcjWKIE5tv3zh3tkBmMOvcrBbaPXRxdnDLUMEe7lW6Qi9AMcpntZAPgv3f4hHTIVHPBF4BaxVVRfQ2jYMPCSKjewTF8y5bx5Ry7n31jfZADHchje9XGD6NGBgBkLWhDmQv9tvMXbhabFCTfSIcMSBJHJATCISHrAaov0ZCuP3ol1h2WMo2w0wppnlrocbNSRwaxmWdIxg6PGyQLhaVdSfLdzXtk3TfgdeuDuzl734mD0e2bHP65K79RdM950LIIdTOf"
```

### Create a New Template (via API)

```bash
curl -X POST "https://graph.facebook.com/v21.0/956649247030355/message_templates" \
  -H "Authorization: Bearer EAAzw1veo958BSvlSfcjWKIE5tv3zh3tkBmMOvcrBbaPXRxdnDLUMEe7lW6Qi9AMcpntZAPgv3f4hHTIVHPBF4BaxVVRfQ2jYMPCSKjewTF8y5bx5Ry7n31jfZADHchje9XGD6NGBgBkLWhDmQv9tvMXbhabFCTfSIcMSBJHJATCISHrAaov0ZCuP3ol1h2WMo2w0wppnlrocbNSRwaxmWdIxg6PGyQLhaVdSfLdzXtk3TfgdeuDuzl734mD0e2bHP65K79RdM950LIIdTOf" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "milk_delivery_update",
    "language": "en_US",
    "category": "UTILITY",
    "components": [
      {
        "type": "HEADER",
        "format": "TEXT",
        "text": "🥛 Milk Delivery Update"
      },
      {
        "type": "BODY",
        "text": "Hi {{1}},\n\nYour {{2}} delivery is scheduled for {{3}}.\n\nQuantity: {{4}}\nAmount: ₹{{5}}\n\nThank you for choosing us!",
        "example": {
          "body_text": [
            ["Ramesh", "Cow Milk", "14 Oct 2026, 6:30 AM", "1 Litre", "60"]
          ]
        }
      },
      {
        "type": "FOOTER",
        "text": "Milk Management App"
      }
    ]
  }'
```

### Suggested Templates for Milk Management App

| Template Name | Category | Purpose |
|---|---|---|
| `milk_delivery_update` | UTILITY | Daily delivery notification |
| `milk_payment_reminder` | UTILITY | Monthly payment due reminder |
| `milk_payment_received` | UTILITY | Payment confirmation |
| `milk_delivery_missed` | UTILITY | Notify if delivery was missed |
| `milk_subscription_update` | UTILITY | Subscription plan changes |
| `milk_welcome_customer` | MARKETING | Welcome new customer |
| `milk_offer_promotion` | MARKETING | Festival / seasonal offers |

### Template Status Lifecycle

```
PENDING  →  APPROVED  →  (active & usable)
   ↘                         ↘
   REJECTED              PAUSED (low quality)
                              ↘
                           DISABLED (very low quality)
```

> Templates typically get approved within **minutes to 24 hours**. You can only send templates with **APPROVED** status.

---

## 11. Webhook Setup — Receive Incoming Messages

Webhooks let you **receive messages from customers** and **track delivery status** of sent messages.

### How Webhooks Work

```
Customer sends WhatsApp msg → Meta servers → Your webhook URL → Your NestJS app
```

### Step 1: Create Webhook Endpoint in NestJS

Your server needs **two endpoints** on the same route:

| Method | Purpose |
|---|---|
| `GET /whatsapp/webhook` | **Verification** — Meta calls this once during setup to verify your endpoint |
| `POST /whatsapp/webhook` | **Payload delivery** — Meta sends all webhook events here |

### Step 2: Configure in Meta Dashboard

1. Go to [Meta App Dashboard](https://developers.facebook.com/apps/3642505789241247)
2. Navigate to **WhatsApp** → **Configuration** (or **Use cases** → **Customize** → **Configuration**)
3. Under **Webhook**:
   - **Callback URL:** `https://dairy-backend-eemp.onrender.com/whatsapp/webhook`
   - **Verify Token:** `48c24a6eb8489621c4e9a22933d477dd19c4f37d2513d7ec`
4. Click **Verify and Save**
5. Subscribe to fields: **`messages`** (required), and optionally: `message_template_status_update`, `account_alerts`

> [!IMPORTANT]
> Your webhook URL **must be HTTPS** and publicly accessible. During development, use **[ngrok](https://ngrok.com/)** to tunnel your local server:
> ```bash
> ngrok http 3000
> ```
> Then use the ngrok HTTPS URL as your Callback URL (e.g., `https://abc123.ngrok.io/webhook/whatsapp`).

### Step 3: Webhook Verify Token

We generated this secure token for our project:

```
48c24a6eb8489621c4e9a22933d477dd19c4f37d2513d7ec
```

This must match **exactly** in:
- Your `.env` file → `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- Meta Dashboard → Webhook Configuration → **Verify Token** field

### Webhook Payload Examples

**Incoming text message from customer:**
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "956649247030355",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "919104152524",
              "phone_number_id": "1307155675822696"
            },
            "contacts": [
              {
                "profile": { "name": "Customer Name" },
                "wa_id": "919876543210"
              }
            ],
            "messages": [
              {
                "from": "919876543210",
                "id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgA...",
                "timestamp": "1697218800",
                "type": "text",
                "text": { "body": "I want to pause delivery tomorrow" }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

**Message status update (delivered/read):**
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "956649247030355",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "919104152524",
              "phone_number_id": "1307155675822696"
            },
            "statuses": [
              {
                "id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgA...",
                "status": "delivered",
                "timestamp": "1697218900",
                "recipient_id": "919876543210"
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

### Webhook Signature Verification (Security)

Meta signs every webhook payload with your **App Secret**. Always verify signatures in production:

```typescript
import * as crypto from 'crypto';

function verifyWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string,
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(payload)
    .digest('hex');

  return `sha256=${expectedSignature}` === signature;
}

// Usage in controller:
// const signature = req.headers['x-hub-signature-256'];
// const isValid = verifyWebhookSignature(rawBody, signature, process.env.WHATSAPP_APP_SECRET);
```

---

## 12. NestJS Service — Complete Implementation

Create file: `backend/src/whatsapp/whatsapp.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface SendTextMessageDto {
  to: string;        // Customer phone: "919876543210"
  message: string;   // Message body text
}

export interface SendTemplateMessageDto {
  to: string;          // Customer phone: "919876543210"
  templateName: string;
  languageCode?: string;  // Default: "en_US"
  bodyParameters?: string[];  // Template variable values
}

export interface BulkMessageResult {
  total: number;
  success: number;
  failed: number;
  details: Array<{
    phone: string;
    status: 'sent' | 'failed';
    messageId?: string;
    error?: string;
  }>;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly httpClient: AxiosInstance;
  private readonly phoneNumberId: string;
  private readonly wabaId: string;

  constructor(private configService: ConfigService) {
    const apiUrl = this.configService.getOrThrow<string>('WHATSAPP_API_URL');
    const accessToken = this.configService.getOrThrow<string>('WHATSAPP_ACCESS_TOKEN');
    this.phoneNumberId = this.configService.getOrThrow<string>('WHATSAPP_PHONE_NUMBER_ID');
    this.wabaId = this.configService.getOrThrow<string>('WHATSAPP_BUSINESS_ACCOUNT_ID');

    this.httpClient = axios.create({
      baseURL: apiUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Send a plain text message to a customer.
   * ⚠️ Only works within the 24-hour customer service window.
   */
  async sendTextMessage(dto: SendTextMessageDto): Promise<{ messageId: string }> {
    const { data } = await this.httpClient.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: dto.to,
      type: 'text',
      text: {
        preview_url: false,
        body: dto.message,
      },
    });

    const messageId = data.messages[0].id;
    this.logger.log(`Text message sent to ${dto.to} | ID: ${messageId}`);
    return { messageId };
  }

  /**
   * Send a template message to a customer.
   * ✅ Works anytime — no 24-hour window restriction.
   */
  async sendTemplateMessage(dto: SendTemplateMessageDto): Promise<{ messageId: string }> {
    const components: any[] = [];

    if (dto.bodyParameters && dto.bodyParameters.length > 0) {
      components.push({
        type: 'body',
        parameters: dto.bodyParameters.map((text) => ({
          type: 'text',
          text,
        })),
      });
    }

    const { data } = await this.httpClient.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: dto.to,
      type: 'template',
      template: {
        name: dto.templateName,
        language: { code: dto.languageCode || 'en_US' },
        ...(components.length > 0 && { components }),
      },
    });

    const messageId = data.messages[0].id;
    this.logger.log(`Template "${dto.templateName}" sent to ${dto.to} | ID: ${messageId}`);
    return { messageId };
  }

  /**
   * Send a template message to multiple customers (bulk).
   * Adds a 100ms delay between messages to respect rate limits.
   */
  async sendBulkTemplateMessages(
    customers: Array<{ phone: string; name: string }>,
    templateName: string,
    languageCode?: string,
  ): Promise<BulkMessageResult> {
    const result: BulkMessageResult = {
      total: customers.length,
      success: 0,
      failed: 0,
      details: [],
    };

    for (const customer of customers) {
      try {
        const { messageId } = await this.sendTemplateMessage({
          to: customer.phone,
          templateName,
          languageCode,
          bodyParameters: [customer.name],
        });

        result.success++;
        result.details.push({
          phone: customer.phone,
          status: 'sent',
          messageId,
        });
      } catch (error: any) {
        const errMsg = error.response?.data?.error?.message || error.message;
        result.failed++;
        result.details.push({
          phone: customer.phone,
          status: 'failed',
          error: errMsg,
        });
        this.logger.error(`Failed to send to ${customer.phone}: ${errMsg}`);
      }

      // Rate limit: wait 100ms between messages
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.logger.log(
      `Bulk send complete: ${result.success}/${result.total} sent, ${result.failed} failed`,
    );
    return result;
  }

  /**
   * Send an image message to a customer.
   * ⚠️ Only works within the 24-hour customer service window.
   */
  async sendImageMessage(
    to: string,
    imageUrl: string,
    caption?: string,
  ): Promise<{ messageId: string }> {
    const { data } = await this.httpClient.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: {
        link: imageUrl,
        ...(caption && { caption }),
      },
    });

    const messageId = data.messages[0].id;
    this.logger.log(`Image sent to ${to} | ID: ${messageId}`);
    return { messageId };
  }

  /**
   * Send a document (PDF, etc.) to a customer.
   * ⚠️ Only works within the 24-hour customer service window.
   */
  async sendDocumentMessage(
    to: string,
    documentUrl: string,
    filename: string,
    caption?: string,
  ): Promise<{ messageId: string }> {
    const { data } = await this.httpClient.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'document',
      document: {
        link: documentUrl,
        filename,
        ...(caption && { caption }),
      },
    });

    const messageId = data.messages[0].id;
    this.logger.log(`Document "${filename}" sent to ${to} | ID: ${messageId}`);
    return { messageId };
  }

  /**
   * List all message templates on the account.
   */
  async listTemplates(): Promise<any[]> {
    const { data } = await this.httpClient.get(`/${this.wabaId}/message_templates`);
    return data.data;
  }

  /**
   * Mark an incoming message as read (shows blue ticks ✓✓).
   */
  async markMessageAsRead(messageId: string): Promise<void> {
    await this.httpClient.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
    this.logger.log(`Message ${messageId} marked as read`);
  }

  /**
   * Verify the webhook token during initial Meta verification handshake.
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = this.configService.getOrThrow<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Webhook verified successfully');
      return challenge;
    }

    this.logger.warn('Webhook verification failed');
    return null;
  }

  /**
   * Process incoming webhook payload from Meta.
   */
  processWebhookPayload(payload: any): void {
    if (payload.object !== 'whatsapp_business_account') {
      return;
    }

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;

        // Handle incoming messages
        if (value.messages) {
          for (const message of value.messages) {
            this.handleIncomingMessage(message, value.contacts?.[0]);
          }
        }

        // Handle message status updates (sent, delivered, read)
        if (value.statuses) {
          for (const status of value.statuses) {
            this.handleStatusUpdate(status);
          }
        }
      }
    }
  }

  private handleIncomingMessage(message: any, contact: any): void {
    const from = message.from;
    const name = contact?.profile?.name || 'Unknown';
    const type = message.type;

    this.logger.log(`📩 Incoming ${type} message from ${name} (${from})`);

    if (type === 'text') {
      this.logger.log(`   Text: "${message.text.body}"`);
      // TODO: Process the message — save to DB, auto-reply, etc.
    }

    // Auto-mark as read
    this.markMessageAsRead(message.id).catch(() => {});
  }

  private handleStatusUpdate(status: any): void {
    this.logger.log(
      `📊 Message ${status.id} → ${status.status} (to: ${status.recipient_id})`,
    );
    // TODO: Update message status in your DB
  }
}
```

---

## 13. NestJS Controller — API Endpoints

Create file: `backend/src/whatsapp/whatsapp.controller.ts`

```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  WhatsappService,
  SendTextMessageDto,
  SendTemplateMessageDto,
} from './whatsapp.service.js';
import { Request } from 'express';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  // ─────────────────────────────────────────────
  // WEBHOOK ENDPOINTS
  // ─────────────────────────────────────────────

  /**
   * GET /webhook/whatsapp — Meta calls this to verify your webhook endpoint.
   * This happens once when you configure the webhook in the Meta Dashboard.
   */
  @Get('/webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const result = this.whatsappService.verifyWebhook(mode, token, challenge);
    if (result) {
      return result;
    }
    throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
  }

  /**
   * POST /webhook/whatsapp — Meta delivers webhook events here.
   * Incoming messages, status updates, etc.
   */
  @Post('/webhook')
  @HttpCode(200)
  handleWebhook(@Body() body: any, @Req() req: Request): string {
    // TODO: In production, verify the X-Hub-Signature-256 header
    // using your App Secret (see Section 11 — Webhook Signature Verification)
    this.whatsappService.processWebhookPayload(body);
    return 'EVENT_RECEIVED';
  }

  // ─────────────────────────────────────────────
  // MESSAGING ENDPOINTS (for your Admin Panel)
  // ─────────────────────────────────────────────

  /**
   * POST /whatsapp/send-text
   * Send a text message to a customer.
   *
   * Body: { "to": "919876543210", "message": "Hello!" }
   */
  @Post('/send-text')
  async sendText(@Body() dto: SendTextMessageDto) {
    return this.whatsappService.sendTextMessage(dto);
  }

  /**
   * POST /whatsapp/send-template
   * Send a template message to a customer.
   *
   * Body: {
   *   "to": "919876543210",
   *   "templateName": "hello_world",
   *   "languageCode": "en_US",
   *   "bodyParameters": ["Ramesh"]
   * }
   */
  @Post('/send-template')
  async sendTemplate(@Body() dto: SendTemplateMessageDto) {
    return this.whatsappService.sendTemplateMessage(dto);
  }

  /**
   * POST /whatsapp/send-bulk
   * Send a template message to multiple customers.
   *
   * Body: {
   *   "customers": [
   *     { "phone": "919876543210", "name": "Ramesh" },
   *     { "phone": "919876543211", "name": "Suresh" }
   *   ],
   *   "templateName": "delivery_update",
   *   "languageCode": "en_US"
   * }
   */
  @Post('/send-bulk')
  async sendBulk(
    @Body()
    body: {
      customers: Array<{ phone: string; name: string }>;
      templateName: string;
      languageCode?: string;
    },
  ) {
    return this.whatsappService.sendBulkTemplateMessages(
      body.customers,
      body.templateName,
      body.languageCode,
    );
  }

  /**
   * GET /whatsapp/templates
   * List all message templates on the account.
   */
  @Get('/templates')
  async listTemplates() {
    return this.whatsappService.listTemplates();
  }
}
```

---

## 14. NestJS Module

Create file: `backend/src/whatsapp/whatsapp.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service.js';
import { WhatsappController } from './whatsapp.controller.js';

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService],  // Export so other modules can inject WhatsappService
})
export class WhatsappModule {}
```

**Register in `app.module.ts`:**

```typescript
import { WhatsappModule } from './whatsapp/whatsapp.module.js';

@Module({
  imports: [
    // ... existing modules
    WhatsappModule,
  ],
})
export class AppModule {}
```

---

## 15. Message Status & Delivery Tracking

Every message goes through these status stages:

```
sent → delivered → read
```

| Status | Meaning |
|---|---|
| `sent` | Message accepted by WhatsApp servers |
| `delivered` | Message delivered to customer's device |
| `read` | Customer opened/read the message (blue ticks ✓✓) |
| `failed` | Message failed to send — check error for reason |

You receive these status updates via **webhooks** (see Section 11).

---

## 16. Media Messages (Images, Documents, etc.)

### Supported Media Types

| Type | Formats | Max Size |
|---|---|---|
| `image` | JPEG, PNG | 5 MB |
| `video` | MP4, 3GPP | 16 MB |
| `audio` | AAC, MP3, OGG, AMR | 16 MB |
| `document` | PDF, DOC, DOCX, XLS, PPT, TXT | 100 MB |
| `sticker` | WEBP | 100 KB (static), 500 KB (animated) |

### Send Image Example (cURL)

```bash
curl -X POST "https://graph.facebook.com/v21.0/1307155675822696/messages" \
  -H "Authorization: Bearer EAAzw1veo958BSvlSfcjWKIE5tv3zh3tkBmMOvcrBbaPXRxdnDLUMEe7lW6Qi9AMcpntZAPgv3f4hHTIVHPBF4BaxVVRfQ2jYMPCSKjewTF8y5bx5Ry7n31jfZADHchje9XGD6NGBgBkLWhDmQv9tvMXbhabFCTfSIcMSBJHJATCISHrAaov0ZCuP3ol1h2WMo2w0wppnlrocbNSRwaxmWdIxg6PGyQLhaVdSfLdzXtk3TfgdeuDuzl734mD0e2bHP65K79RdM950LIIdTOf" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "recipient_type": "individual",
    "to": "919876543210",
    "type": "image",
    "image": {
      "link": "https://your-server.com/invoices/invoice-oct-2026.png",
      "caption": "Your milk invoice for October 2026 🧾"
    }
  }'
```

### Send PDF Invoice

```bash
curl -X POST "https://graph.facebook.com/v21.0/1307155675822696/messages" \
  -H "Authorization: Bearer EAAzw1veo958BSvlSfcjWKIE5tv3zh3tkBmMOvcrBbaPXRxdnDLUMEe7lW6Qi9AMcpntZAPgv3f4hHTIVHPBF4BaxVVRfQ2jYMPCSKjewTF8y5bx5Ry7n31jfZADHchje9XGD6NGBgBkLWhDmQv9tvMXbhabFCTfSIcMSBJHJATCISHrAaov0ZCuP3ol1h2WMo2w0wppnlrocbNSRwaxmWdIxg6PGyQLhaVdSfLdzXtk3TfgdeuDuzl734mD0e2bHP65K79RdM950LIIdTOf" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "recipient_type": "individual",
    "to": "919876543210",
    "type": "document",
    "document": {
      "link": "https://your-server.com/invoices/invoice-oct-2026.pdf",
      "filename": "Milk_Invoice_October_2026.pdf",
      "caption": "Your monthly milk invoice"
    }
  }'
```

---

## 17. Rate Limits & Best Practices

### Rate Limits

| Tier | Messages per second | How to reach |
|---|---|---|
| **Tier 1 (new)** | ~80 msg/s | Default for new accounts |
| **Tier 2** | ~250 msg/s | High quality + volume |
| **Tier 3** | ~500 msg/s | Consistent high quality |
| **Tier 4** | ~1000 msg/s | Enterprise level |

### Messaging Limits (per 24-hour rolling window)

| Tier | Unique customers/day |
|---|---|
| **Unverified business** | 250 |
| **Tier 1** | 1,000 |
| **Tier 2** | 10,000 |
| **Tier 3** | 100,000 |
| **Tier 4** | Unlimited |

> [!TIP]
> To increase your tier: complete **Business Verification** in Meta Business Settings, maintain high message quality (low block/report rate), and gradually increase volume.

### Best Practices

1. **Always use template messages** for proactive outreach (delivery notifications, payment reminders)
2. **Format phone numbers correctly** — country code + number, no `+` or spaces: `919876543210`
3. **Handle errors gracefully** — retry on 5xx errors, don't retry on 4xx (fix the issue first)
4. **Add delays in bulk sends** — 100ms minimum between messages
5. **Verify webhook signatures** in production using your App Secret
6. **Monitor message quality** — high block/report rates will reduce your messaging tier
7. **Never store access tokens in code** — always use environment variables

---

## 18. Troubleshooting

### Common Errors

| Error Code | Message | Fix |
|---|---|---|
| `131030` | Recipient phone number not in allowed list | In Dev mode, add recipient to test numbers in Meta Dashboard |
| `131047` | Re-engagement message (outside 24h window) | Use a template message instead of text |
| `131026` | Message undeliverable | Customer hasn't registered WhatsApp with this number |
| `131031` | Account has been locked | Contact Meta support |
| `131051` | Unsupported message type | Check your payload structure |
| `131009` | Parameter missing or invalid | Verify all required fields in your request |
| `368` | Temporarily blocked for policies violation | Wait 24h, review Meta's commerce policies |
| `100` | Invalid parameter | Check phone number format, template name, etc. |

### Quick Diagnostic Commands

**Check phone number status:**
```bash
curl -X GET "https://graph.facebook.com/v21.0/1307155675822696" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Check business account status:**
```bash
curl -X GET "https://graph.facebook.com/v21.0/956649247030355" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Check token permissions:**
```bash
curl -X GET "https://graph.facebook.com/v21.0/me?access_token=YOUR_ACCESS_TOKEN"
```

---

## 19. Useful Links

| Resource | URL |
|---|---|
| **Meta Developer Dashboard** | https://developers.facebook.com/apps/3642505789241247 |
| **Meta Business Settings** | https://business.facebook.com/settings/ |
| **WhatsApp Manager** | https://business.facebook.com/wa/manage/home/ |
| **Message Template Manager** | https://business.facebook.com/wa/manage/message-templates/ |
| **Cloud API Docs** | https://developers.facebook.com/docs/whatsapp/cloud-api |
| **Template API Reference** | https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates |
| **Webhook Reference** | https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks |
| **Pricing** | https://developers.facebook.com/docs/whatsapp/pricing |
| **Phone Number Formatting** | https://developers.facebook.com/docs/whatsapp/cloud-api/reference/phone-numbers |
| **Error Codes Reference** | https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes |
| **Business Verification** | https://www.facebook.com/business/help/2058515294227817 |
| **ngrok (for local webhook testing)** | https://ngrok.com/ |

---

## Quick Start Checklist

- [ ] Copy credentials to `backend/.env` (Section 4)
- [ ] Find and add **App Secret** (Section 3)
- [ ] Install `axios` package (Section 5)
- [ ] Test API connection with cURL (Section 6)
- [ ] Create WhatsApp module files (Sections 12-14)
- [ ] Register `WhatsappModule` in `app.module.ts` (Section 14)
- [ ] Create message templates in Meta Dashboard (Section 10)
- [ ] Send a test template message (Section 8)
- [ ] Set up ngrok for webhook testing (Section 11)
- [ ] Configure webhook in Meta Dashboard (Section 11)
- [ ] Test incoming message handling

---

> **Questions?** Check the [WhatsApp Cloud API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api) or ask the project admin.
