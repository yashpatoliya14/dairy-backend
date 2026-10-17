import {
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import { Distributor } from './distributor.entity.js';

@Entity({ tableName: 'settings' })
@Unique({ properties: ['distributor'] })
export class Settings {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  sid!: string;

  @Property({
    fieldName: 'default_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  defaultPrice!: number;

  @Property({
    fieldName: 'default_liters',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  defaultLiters!: number;

  @ManyToOne(() => Distributor, { fieldName: 'did', nullable: true })
  distributor?: Distributor;

  @Property({ type: 'boolean', fieldName: 'dark_mode', default: false })
  darkMode = false;

  @Property({ type: 'boolean', fieldName: 'light_mode', default: true })
  lightMode = true;
}
