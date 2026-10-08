import { Entity, Enum, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

export enum UserRole {
  DISTRIBUTOR = 'distributor',
  USER = 'user',
  ADMIN = 'admin',
}

@Entity({ tableName: 'users' })
export class User {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  uid!: string;

  @Property({ type: 'string', nullable: true })
  name?: string;

  @Property({ type: 'string', unique: true })
  email!: string;

  @Property({ type: 'string', fieldName: 'password_hash', hidden: true })
  passwordHash!: string;

  @Enum(() => UserRole)
  role: UserRole = UserRole.USER;

  @Property({
    type: 'string',
    fieldName: 'phone_number',
    unique: true,
    nullable: true,
  })
  phoneNumber?: string;
}
