import {
  Entity,
  Enum,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import { Distributor } from './distributor.entity.js';
import { User } from './user.entity.js';

export enum NotificationChannel {
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
}

@Entity({ tableName: 'customers' })
@Unique({ properties: ['distributor', 'uniqueNumber'] })
export class Customer {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  cid!: string;

  @ManyToOne(() => Distributor, { fieldName: 'did' })
  distributor!: Distributor;

  @ManyToOne(() => User, { fieldName: 'uid' })
  user!: User;

  @Property({ type: 'string' })
  name!: string;

  @Property({ type: 'string', fieldName: 'unique_number' })
  uniqueNumber!: string;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  liters!: number;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  price!: number;

  @Property({ type: 'string', fieldName: 'phone_number', nullable: true })
  phoneNumber?: string;

  @Enum(() => NotificationChannel)
  @Property({
    fieldName: 'notification_channel',
    default: NotificationChannel.WHATSAPP,
  })
  notificationChannel: NotificationChannel = NotificationChannel.WHATSAPP;
}
