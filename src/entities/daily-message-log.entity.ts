import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import { Customer } from './customer.entity.js';
import { Distributor } from './distributor.entity.js';
import { User } from './user.entity.js';

export enum MessageDeliveryStatus {
  NOT_SENT = 'not_sent',
  PENDING = 'pending',
  OPENED_IN_WHATSAPP = 'opened_in_whatsapp',
  SENT = 'sent',
  FAILED = 'failed',
}

@Entity({ tableName: 'daily_message_logs' })
@Unique({ properties: ['distributor', 'customer', 'entryDate'] })
@Index({ properties: ['distributor', 'entryDate'] })
export class DailyMessageLog {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Customer, { fieldName: 'cid' })
  customer!: Customer;

  @ManyToOne(() => Distributor, { fieldName: 'did' })
  distributor!: Distributor;

  @ManyToOne(() => User, { fieldName: 'uid' })
  user!: User;

  @Property({ type: 'date', fieldName: 'entry_date' })
  entryDate!: Date;

  @Property({
    type: 'string',
    fieldName: 'status',
    default: MessageDeliveryStatus.NOT_SENT,
  })
  status: string = MessageDeliveryStatus.NOT_SENT;

  @Property({ type: 'text', fieldName: 'message_content', nullable: true })
  messageContent?: string;

  @Property({ type: 'integer', fieldName: 'attempt_count', default: 0 })
  attemptCount: number = 0;

  @Property({
    type: 'datetime',
    fieldName: 'last_attempted_at',
    nullable: true,
  })
  lastAttemptedAt?: Date;

  @Property({
    type: 'string',
    fieldName: 'provider_message_id',
    nullable: true,
  })
  providerMessageId?: string;

  @Property({ type: 'text', fieldName: 'error_message', nullable: true })
  errorMessage?: string;

  @Property({
    type: 'datetime',
    fieldName: 'created_at',
    defaultRaw: 'CURRENT_TIMESTAMP',
  })
  createdAt?: Date = new Date();

  @Property({
    type: 'datetime',
    fieldName: 'updated_at',
    defaultRaw: 'CURRENT_TIMESTAMP',
    onUpdate: () => new Date(),
  })
  updatedAt?: Date = new Date();
}
