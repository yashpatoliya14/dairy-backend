import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'settings' })
export class Settings {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  sid!: string;

  @Property({ fieldName: 'default_price', type: 'decimal', precision: 10, scale: 2 })
  defaultPrice!: number;

  @Property({ fieldName: 'default_liters', type: 'decimal', precision: 10, scale: 2 })
  defaultLiters!: number;

  @Property({ fieldName: 'dark_mode', default: false })
  darkMode = false;

  @Property({ fieldName: 'light_mode', default: true })
  lightMode = true;
}
