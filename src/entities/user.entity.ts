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

  @Property({ nullable: true })
  name?: string;

  @Property({ unique: true })
  email!: string;

  @Property({ fieldName: 'password_hash', hidden: true })
  passwordHash!: string;

  @Enum(() => UserRole)
  role: UserRole = UserRole.USER;

  @Property({ fieldName: 'phone_number', unique: true, nullable: true })
  phoneNumber?: string;
}
