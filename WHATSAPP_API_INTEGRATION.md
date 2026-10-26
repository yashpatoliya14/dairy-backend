# 📱 WhatsApp Business API — Integration & Deployment Guide for Milk Management

> **Target Audience:** Owner / Backend Developer & AI Coding Agent  
> **Project:** Milk Management System (`dairy-backend`)  
> **Repository:** `https://github.com/yashpatoliya14/dairy-backend`  
> **Live Deployment:** `https://dairy-backend-eemp.onrender.com`  
> **Tech Stack:** NestJS + TypeScript + MikroORM + PostgreSQL (Supabase) + Axios

---

# 🚨 PHASE 1: IMMEDIATE ACTION FOR REPO OWNER (DO THIS FIRST)

> [!IMPORTANT]
> **To the Owner / AI Agent:**  
> Before we can connect WhatsApp in Meta's Developer Dashboard, Meta requires a **live, responding webhook endpoint** (`GET /whatsapp/webhook`).  
> Since you have GitHub owner & Render deploy access, please complete **Step 1 through Step 5 below**, deploy to Render, and confirm. Once deployed, the webhook can be verified on Meta Dashboard immediately.

---

### Step 1: Install Axios

Open terminal in `backend/` folder:

```bash
cd backend
npm install axios
```

---

### Step 2: Create the WhatsApp Module Files

Create the following 3 files inside `backend/src/whatsapp/`:

#### File 1: `backend/src/whatsapp/whatsapp.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface SendTextMessageDto {
  to: string; // Customer phone: "919876543210" (country code + number, no +)
  message: string;
}

export interface SendTemplateMessageDto {
  to: string;
  templateName: string;
  languageCode?: string; // Default: "en_US"
  bodyParameters?: string[];
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
    const accessToken =
      this.configService.getOrThrow<string>('WHATSAPP_ACCESS_TOKEN');
    this.phoneNumberId = this.configService.getOrThrow<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    this.wabaId = this.configService.getOrThrow<string>(
      'WHATSAPP_BUSINESS_ACCOUNT_ID',
    );

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
  async sendTextMessage(
    dto: SendTextMessageDto,
  ): Promise<{ messageId: string }> {
    const { data } = await this.httpClient.post(
      `/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: dto.to,
        type: 'text',
        text: {
          preview_url: false,
          body: dto.message,
        },
      },
    );

    const messageId = data.messages[0].id;
    this.logger.log(`Text message sent to ${dto.to} | ID: ${messageId}`);
    return { messageId };
  }

  /**
   * Send an approved template message to a customer.
   * ✅ Works anytime — no 24-hour window restriction.
   */
  async sendTemplateMessage(
    dto: SendTemplateMessageDto,
  ): Promise<{ messageId: string }> {
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

    const { data } = await this.httpClient.post(
      `/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: dto.to,
        type: 'template',
        template: {
          name: dto.templateName,
          language: { code: dto.languageCode || 'en_US' },
          ...(components.length > 0 && { components }),
        },
      },
    );

    const messageId = data.messages[0].id;
    this.logger.log(
      `Template "${dto.templateName}" sent to ${dto.to} | ID: ${messageId}`,
    );
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
        const errMsg =
          error.response?.data?.error?.message || error.message;
        result.failed++;
        result.details.push({
          phone: customer.phone,
          status: 'failed',
          error: errMsg,
        });
        this.logger.error(
          `Failed to send to ${customer.phone}: ${errMsg}`,
        );
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
   */
  async sendImageMessage(
    to: string,
    imageUrl: string,
    caption?: string,
  ): Promise<{ messageId: string }> {
    const { data } = await this.httpClient.post(
      `/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'image',
        image: {
          link: imageUrl,
          ...(caption && { caption }),
        },
      },
    );

    const messageId = data.messages[0].id;
    this.logger.log(`Image sent to ${to} | ID: ${messageId}`);
    return { messageId };
  }

  /**
   * Send a document (PDF invoice, etc.) to a customer.
   */
  async sendDocumentMessage(
    to: string,
    documentUrl: string,
    filename: string,
    caption?: string,
  ): Promise<{ messageId: string }> {
    const { data } = await this.httpClient.post(
      `/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'document',
        document: {
          link: documentUrl,
          filename,
          ...(caption && { caption }),
        },
      },
    );

    const messageId = data.messages[0].id;
    this.logger.log(
      `Document "${filename}" sent to ${to} | ID: ${messageId}`,
    );
    return { messageId };
  }

  /**
   * List all message templates on the account.
   */
  async listTemplates(): Promise<any[]> {
    const { data } = await this.httpClient.get(
      `/${this.wabaId}/message_templates`,
    );
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
   * Meta sends a GET request with hub.mode, hub.verify_token, hub.challenge.
   */
  verifyWebhook(
    mode: string,
    token: string,
    challenge: string,
  ): string | null {
    const verifyToken = this.configService.getOrThrow<string>(
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    );

    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Webhook verified successfully ✅');
      return challenge;
    }

    this.logger.warn('Webhook verification failed ❌');
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

    this.logger.log(
      `📩 Incoming ${type} message from ${name} (${from})`,
    );

    if (type === 'text') {
      this.logger.log(`   Text: "${message.text.body}"`);
      // TODO: Process incoming message (save to DB, auto-reply, etc.)
    }

    // Auto-mark as read
    this.markMessageAsRead(message.id).catch(() => {});
  }

  private handleStatusUpdate(status: any): void {
    this.logger.log(
      `📊 Message ${status.id} → ${status.status} (to: ${status.recipient_id})`,
    );
    // TODO: Update message delivery status in database
  }
}
```

---

#### File 2: `backend/src/whatsapp/whatsapp.controller.ts`

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
} from '@nestjs/common';
import * as WA from './whatsapp.service.js';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WA.WhatsappService) {}

  // ─────────────────────────────────────────────
  // WEBHOOK ENDPOINTS (called by Meta)
  // ─────────────────────────────────────────────

  /**
   * GET /whatsapp/webhook
   * Meta calls this ONCE during setup to verify your endpoint.
   * It sends hub.mode, hub.verify_token, hub.challenge as query params.
   * Returns the challenge if token matches.
   */
  @Get('/webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const result = this.whatsappService.verifyWebhook(
      mode,
      token,
      challenge,
    );
    if (result) {
      return result;
    }
    throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
  }

  /**
   * POST /whatsapp/webhook
   * Meta delivers ALL webhook events here — incoming messages,
   * delivery status updates, template status changes, etc.
   */
  @Post('/webhook')
  @HttpCode(200)
  handleWebhook(@Body() body: any): string {
    this.whatsappService.processWebhookPayload(body);
    return 'EVENT_RECEIVED';
  }

  // ─────────────────────────────────────────────
  // MESSAGING ENDPOINTS (for Admin Panel)
  // ─────────────────────────────────────────────

  /**
   * POST /whatsapp/send-text
   * Send a text message to a single customer.
   * Body: { "to": "919876543210", "message": "Hello!" }
   */
  @Post('/send-text')
  async sendText(@Body() dto: WA.SendTextMessageDto) {
    return this.whatsappService.sendTextMessage(dto);
  }

  /**
   * POST /whatsapp/send-template
   * Send an approved template message to a single customer.
   * Body: {
   *   "to": "919876543210",
   *   "templateName": "hello_world",
   *   "languageCode": "en_US",
   *   "bodyParameters": ["Ramesh"]
   * }
   */
  @Post('/send-template')
  async sendTemplate(@Body() dto: WA.SendTemplateMessageDto) {
    return this.whatsappService.sendTemplateMessage(dto);
  }

  /**
   * POST /whatsapp/send-bulk
   * Send a template message to multiple customers at once.
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
   * List all message templates on the WhatsApp Business account.
   */
  @Get('/templates')
  async listTemplates() {
    return this.whatsappService.listTemplates();
  }
}
```

---

#### File 3: `backend/src/whatsapp/whatsapp.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service.js';
import { WhatsappController } from './whatsapp.controller.js';

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService], // Export so Customer/Order modules can inject it
})
export class WhatsappModule {}
```

---

### Step 3: Register `WhatsappModule` in `backend/src/app.module.ts`

Import and add `WhatsappModule` to `imports`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { Customer } from './entities/customer.entity.js';
import { Distributor } from './entities/distributor.entity.js';
import { Settings } from './entities/settings.entity.js';
import { User } from './entities/user.entity.js';
import { CustomersModule } from './customers/customers.module.js';
import { DistributorsModule } from './distributors/distributors.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { WhatsappModule } from './whatsapp/whatsapp.module.js'; // 👈 ADD THIS

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        clientUrl: configService.getOrThrow<string>('DATABASE_URL'),
        entities: [User, Distributor, Customer, Settings],
      }),
    }),
    UsersModule,
    AuthModule,
    DistributorsModule,
    CustomersModule,
    SettingsModule,
    WhatsappModule, // 👈 ADD THIS
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

---

### Step 4: Configure Environment Variables on Render

Go to **[Render Dashboard](https://dashboard.render.com/)** ➔ Select Service **`dairy-backend-eemp`** ➔ **Environment** tab ➔ Add these variables:

| Key | Value |
|---|---|
| `WHATSAPP_API_VERSION` | `v21.0` |
| `WHATSAPP_API_URL` | `https://graph.facebook.com/v21.0` |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | `2473183253205958` |
| `WHATSAPP_PHONE_NUMBER_ID` | `1307155675822696` |
| `WHATSAPP_ACCESS_TOKEN` | `EAAzw1veo958BSvlSfcjWKIE5tv3zh3tkBmMOvcrBbaPXRxdnDLUMEe7lW6Qi9AMcpntZAPgv3f4hHTIVHPBF4BaxVVRfQ2jYMPCSKjewTF8y5bx5Ry7n31jfZADHchje9XGD6NGBgBkLWhDmQv9tvMXbhabFCTfSIcMSBJHJATCISHrAaov0ZCuP3ol1h2WMo2w0wppnlrocbNSRwaxmWdIxg6PGyQLhaVdSfLdzXtk3TfgdeuDuzl734mD0e2bHP65K79RdM950LIIdTOf` |
| `WHATSAPP_APP_ID` | `3642505789241247` |
| `WHATSAPP_APP_SECRET` | *(Get from Meta Dashboard: Settings → Basic → App Secret)* |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | `48c24a6eb8489621c4e9a22933d477dd19c4f37d2513d7ec` |
| `WHATSAPP_PHONE_NUMBER` | `919104152524` |

---

### Step 5: Commit, Push & Deploy

In your terminal:

```bash
git add .
git commit -m "feat: add WhatsApp Business API module, webhook endpoints, and integration docs"
git push origin master
```

Render will detect the commit on `master` and automatically trigger a build & deploy.

---

### Step 6: Wake Up Server & Verify Live Webhook

Because Render's free tier spins down on inactivity, wake it up before clicking verify in Meta:

1. **Wake up server:** Open `https://dairy-backend-eemp.onrender.com/` in your browser until it responds.
2. **Test webhook verification:** Open this in your browser:
   ```
   https://dairy-backend-eemp.onrender.com/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=48c24a6eb8489621c4e9a22933d477dd19c4f37d2513d7ec&hub.challenge=test12345
   ```
   **Expected result:** The page displays `test12345`. This proves the webhook is live!

👉 **Tell the team owner/admin:** *"Backend deployed and webhook is verified! You can now complete the Meta Dashboard setup."*

---

# 🌐 PHASE 2: CONFIGURE META DASHBOARD (AFTER DEPLOY)

Once Phase 1 is deployed on Render, fill this in the Meta Developer Dashboard:

1. Open **[Meta Developer Dashboard](https://developers.facebook.com/apps/3642505789241247)**
2. Go to **WhatsApp** ➔ **Configuration** (or **Use cases** ➔ **Customize** ➔ **Configuration**)
3. Under **Webhook**, enter:
   - **Callback URL:** `https://dairy-backend-eemp.onrender.com/whatsapp/webhook`
   - **Verify Token:** `48c24a6eb8489621c4e9a22933d477dd19c4f37d2513d7ec`
4. Click **Verify and Save** ✅
5. Under **Webhook fields**, click **Manage** and subscribe to:
   - ✅ **`messages`** (Incoming customer messages & message delivery status updates)
   - ✅ **`message_template_status_update`** (Notifies when templates are approved/rejected)

---

# 📖 PHASE 3: WHATSAPP CLOUD API INTEGRATION & USAGE GUIDE

---

## 1. Credentials Reference

| Property | Value | Description |
|---|---|---|
| **WhatsApp Business Account ID (WABA ID)** | `2473183253205958` | Your WhatsApp Business Account identifier (Haresh's Milk) |
| **Phone Number ID** | `1307155675822696` | ID of the registered WhatsApp phone number |
| **Permanent Access Token** | `EAAzw1veo958BSvlSfcjWKIE5tv3zh3tkBmMOvcrBbaPXRxdnDLUMEe7lW6Qi9AMcpntZAPgv3f4hHTIVHPBF4BaxVVRfQ2jYMPCSKjewTF8y5bx5Ry7n31jfZADHchje9XGD6NGBgBkLWhDmQv9tvMXbhabFCTfSIcMSBJHJATCISHrAaov0ZCuP3ol1h2WMo2w0wppnlrocbNSRwaxmWdIxg6PGyQLhaVdSfLdzXtk3TfgdeuDuzl734mD0e2bHP65K79RdM950LIIdTOf` | Permanent System User Token |
| **App ID** | `3642505789241247` | Your Meta App ID |
| **App Secret** | *(Meta Dashboard ➔ Settings ➔ Basic ➔ App Secret)* | Used for webhook payload signature validation |
| **Webhook Verify Token** | `48c24a6eb8489621c4e9a22933d477dd19c4f37d2513d7ec` | Secret token to authenticate Meta's webhook challenge |
| **Registered Business Phone** | `+91 9104152524` | The number sending messages |
| **API Version** | `v21.0` | Graph API Version |
| **API Base URL** | `https://graph.facebook.com/v21.0` | Base endpoint |

---

## 2. Key WhatsApp Rules: 24-Hour Window & Templates

- **Free-form Text Messages:** Can **only** be sent within **24 hours** after a customer sends a message to your WhatsApp number.
- **Template Messages:** Can be sent **anytime** to **any customer** (no 24-hour window restriction). This is what we use for milk order alerts, delivery updates, and monthly payment reminders.
- **Templates must be approved by Meta:** You create the template text once, Meta approves it (usually within 5 minutes), and then you can trigger it with dynamic parameters.

---

## 3. How to Send Messages via Backend API

### A. Send Plain Text (within 24h window)

```http
POST https://dairy-backend-eemp.onrender.com/whatsapp/send-text
Content-Type: application/json

{
  "to": "919876543210",
  "message": "Hello! Your milk delivery for tomorrow is confirmed. 🥛"
}
```

### B. Send Template Message (Anytime)

Send pre-approved template `hello_world`:

```http
POST https://dairy-backend-eemp.onrender.com/whatsapp/send-template
Content-Type: application/json

{
  "to": "919876543210",
  "templateName": "hello_world",
  "languageCode": "en_US"
}
```

Send customized template with parameters (e.g. customer name):

```http
POST https://dairy-backend-eemp.onrender.com/whatsapp/send-template
Content-Type: application/json

{
  "to": "919876543210",
  "templateName": "milk_delivery_update",
  "languageCode": "en_US",
  "bodyParameters": ["Ramesh", "Cow Milk 1L", "06:30 AM", "60"]
}
```

### C. Send Bulk Messages to Customer List

```http
POST https://dairy-backend-eemp.onrender.com/whatsapp/send-bulk
Content-Type: application/json

{
  "templateName": "milk_delivery_update",
  "languageCode": "en_US",
  "customers": [
    { "phone": "919876543210", "name": "Ramesh" },
    { "phone": "919876543211", "name": "Suresh" },
    { "phone": "919876543212", "name": "Pooja" }
  ]
}
```

**Phone Number Format:**  
- ✅ `919876543210` (Country code + 10 digits, no `+`, no spaces, no dashes)  
- ❌ `+919876543210`  
- ❌ `09876543210`  
- ❌ `9876543210`

---

## 4. Message Templates for Milk Delivery App

You can create these templates in **[WhatsApp Manager ➔ Message Templates](https://business.facebook.com/wa/manage/message-templates/)**:

### 1. Milk Bill Update (`dairy_milk_bill_update`)
- **Category:** `UTILITY`
- **Language:** `English (US)` (`en_US`)
- **Body (16 words, counting each variable as one word):**
  ```text
  Hi {{1}}, your milk bill for {{2}} is ready. Quantity: {{3}}. Rate: ₹{{4}}/L. Total due: ₹{{5}}.
  ```
- **Variable samples:**
  1. `Ramesh`
  2. `23 Oct 2026` or `October 2026`
  3. `2.0 L`
  4. `60.00`
  5. `120.00`
- Configure `WHATSAPP_MILK_BILL_TEMPLATE_NAME=dairy_milk_bill_update`.
- This is a transactional bill update; Meta makes the final category decision.

### 2. Daily Delivery Notification (`milk_delivery_update`)
- **Category:** `UTILITY`
- **Header:** `🥛 Milk Delivery Update`
- **Body:**
  ```text
  Hi {{1}},

  Your daily milk delivery for {{2}} is scheduled for {{3}}.
  Quantity: {{4}}
  Total: ₹{{5}}

  Thank you for choosing us!
  ```
- **Footer:** `Milk Management App`

### 3. Monthly Payment Reminder (`milk_payment_reminder`)
- **Category:** `UTILITY`
- **Header:** `💳 Monthly Milk Bill Reminder`
- **Body:**
  ```text
  Hi {{1}},

  Your milk subscription bill for the month of {{2}} is ₹{{3}}.
  Due date: {{4}}.

  Please clear the dues to continue seamless morning deliveries.
  ```
- **Footer:** `Milk Management App`

### 3. Payment Received (`milk_payment_received`)
- **Category:** `UTILITY`
- **Header:** `✅ Payment Received`
- **Body:**
  ```text
  Hi {{1}},

  We have received your payment of ₹{{2}} for invoice #{{3}}.
  Thank you for your timely payment!
  ```

---

## 5. Webhook Handling: Incoming Messages & Delivery Status

When a customer sends a message or a message's status changes, Meta sends a POST request to:  
`POST https://dairy-backend-eemp.onrender.com/whatsapp/webhook`

### Message Status Lifecycle

Every sent message triggers status callbacks:
```text
sent ➔ delivered ➔ read
```
- `sent`: Message has left Meta servers
- `delivered`: Message arrived on the customer's device
- `read`: Customer opened the message (blue double ticks ✓✓)

### Incoming Customer Message Payload Structure

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
                "id": "wamid.HBgLMTY1MDM4...",
                "timestamp": "1749416383",
                "type": "text",
                "text": {
                  "body": "Please deliver 2 packets tomorrow."
                }
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

The `WhatsappService.processWebhookPayload()` handles and logs incoming messages and status events automatically.

---

## 6. Rate Limits & Best Practices

1. **New Phone Numbers:** Start with Tier 1 (1,000 unique customers per 24 hours).
2. **Bulk Sending:** Always use a minimum 100ms pause between messages (built into `sendBulkTemplateMessages()`).
3. **Quality Rating:** Meta monitors customer feedback. If customers block or report your number, your tier is downgraded. Always provide useful notifications and respect opt-outs.
4. **Permanent Token:** Keep the System User Token in `.env` only — do not expose it in client-side code.

---

## 7. Troubleshooting

| Error Code | Meaning | Fix |
|---|---|---|
| `131030` | Recipient phone number not in allowed list | App is in Development mode; add number as test recipient in Meta Dashboard, or publish app |
| `131047` | Re-engagement message (outside 24h window) | Customer has not messaged in 24 hours; send a template message instead of text |
| `131026` | Message undeliverable | Customer does not have an active WhatsApp account on this phone number |
| `132000` | Template does not exist or not approved | Check template name spelling and verify status is APPROVED in WhatsApp Manager |
| `100` | Invalid parameter | Ensure phone number has country code with no `+` (e.g., `919876543210`) |
| `190` | Invalid or expired token | Check `WHATSAPP_ACCESS_TOKEN` in Render Environment settings |

---

## 8. Quick Summary for Your Team

```
┌────────────────────────────────────────────────────────┐
│ 1. Owner copies code in Phase 1 & pushes to GitHub     │
│ 2. Owner sets environment variables in Render          │
│ 3. Owner wakes up Render & confirms test URL works     │
│ 4. Team fills Callback URL & Verify Token on Meta      │
│ 5. Done! You can now send & receive WhatsApp messages  │
└────────────────────────────────────────────────────────┘
```
