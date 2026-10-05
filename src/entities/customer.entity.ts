import { Entity, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import { Distributor } from './distributor.entity.js';
import { User } from './user.entity.js';

@Entity({ tableName: 'customers' })
@Unique({ properties: ['distributor', 'uniqueNumber'] })
export class Customer {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  cid!: string;

  @ManyToOne(() => Distributor, { fieldName: 'did' })
  distributor!: Distributor;

  @ManyToOne(() => User, { fieldName: 'uid' })
  user!: User;

  @Property()
  name!: string;

  @Property({ fieldName: 'unique_number' })
  uniqueNumber!: string;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  liters!: number;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  price!: number;
}
