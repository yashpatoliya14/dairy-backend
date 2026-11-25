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

@Entity({ tableName: 'payment_entries' })
@Unique({ properties: ['customer', 'year', 'month'] })
@Index({ properties: ['distributor', 'year', 'month'] })
@Index({ properties: ['customer', 'year', 'month'] })
export class PaymentEntry {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  pid!: string;

  @ManyToOne(() => Customer, { fieldName: 'cid' })
  customer!: Customer;

  @ManyToOne(() => Distributor, { fieldName: 'did' })
  distributor!: Distributor;

  @ManyToOne(() => User, { fieldName: 'uid' })
  user!: User;

  @Property({ type: 'integer' })
  year!: number;

  @Property({ type: 'integer' })
  month!: number;

  @Property({ type: 'decimal', precision: 12, scale: 2, fieldName: 'bill_amount' })
  billAmount!: number;

  @Property({ type: 'decimal', precision: 12, scale: 2, fieldName: 'received_amount' })
  receivedAmount!: number;

  @Property({ type: 'string', nullable: true })
  note?: string;

  @Property({ type: 'date', fieldName: 'received_date' })
  receivedDate!: Date;

  @Property({ type: 'datetime', onCreate: () => new Date(), fieldName: 'created_at' })
  createdAt: Date = new Date();

  @Property({ type: 'datetime', onUpdate: () => new Date(), fieldName: 'updated_at' })
  updatedAt: Date = new Date();
}
