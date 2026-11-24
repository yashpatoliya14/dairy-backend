import {
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';
import { User } from './user.entity.js';

@Entity({ tableName: 'distributors' })
export class Distributor {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  did!: string;

  @Property({ type: 'string', fieldName: 'dairy_name' })
  dairyName!: string;

  @Property({ type: 'boolean', fieldName: 'is_active', default: true })
  isActive = true;

  @ManyToOne(() => User, { fieldName: 'uid' })
  user!: User;

  @Property({
    type: 'datetime',
    defaultRaw: 'CURRENT_TIMESTAMP',
    fieldName: 'created_at',
    nullable: true,
  })
  createdAt?: Date = new Date();
}
