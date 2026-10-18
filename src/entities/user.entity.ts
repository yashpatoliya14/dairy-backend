import {
  Entity,
  Enum,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';

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

  @Property({ type: 'string', default: 'Dairy' })
  firstName = 'Dairy';

  @Property({ type: 'string', default: 'Owner' })
  lastName = 'Owner';

  @Property({ type: 'string', unique: true })
  email!: string;

  @Property({ type: 'string', fieldName: 'password_hash', hidden: true })
  passwordHash!: string;

  @Property({ type: 'boolean', fieldName: 'email_verified', default: true })
  emailVerified = true;

  @Property({
    type: 'string',
    fieldName: 'verification_code_hash',
    nullable: true,
    hidden: true,
  })
  verificationCodeHash?: string;

  @Property({
    type: 'date',
    fieldName: 'verification_expires_at',
    nullable: true,
    hidden: true,
  })
  verificationExpiresAt?: Date;

  @Property({
    type: 'string',
    fieldName: 'reset_code_hash',
    nullable: true,
    hidden: true,
  })
  resetCodeHash?: string;

  @Property({
    type: 'date',
    fieldName: 'reset_expires_at',
    nullable: true,
    hidden: true,
  })
  resetExpiresAt?: Date;

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
