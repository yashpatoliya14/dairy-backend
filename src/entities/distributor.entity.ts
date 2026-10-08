import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { User } from './user.entity.js';

@Entity({ tableName: 'distributors' })
export class Distributor {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  did!: string;

  @Property({ type: 'string', fieldName: 'dairy_name' })
  dairyName!: string;

  @ManyToOne(() => User, { fieldName: 'uid' })
  user!: User;
}
