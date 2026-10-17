import {
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import { Customer } from './customer.entity.js';
import { Distributor } from './distributor.entity.js';
import { User } from './user.entity.js';

@Entity({ tableName: 'milk_entries' })
@Unique({ properties: ['customer', 'entryDate'] })
export class MilkEntry {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  eid!: string;

  @ManyToOne(() => Customer, { fieldName: 'cid' })
  customer!: Customer;

  @ManyToOne(() => Distributor, { fieldName: 'did' })
  distributor!: Distributor;

  @ManyToOne(() => User, { fieldName: 'uid' })
  user!: User;

  @Property({ type: 'date', fieldName: 'entry_date' })
  entryDate!: Date;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  liters!: number;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  price!: number;

  @Property({ type: 'decimal', precision: 12, scale: 2 })
  total!: number;
}
