import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { randomUUID } from 'node:crypto';
import { Distributor } from '../entities/distributor.entity.js';
import { Settings } from '../entities/settings.entity.js';
import { User } from '../entities/user.entity.js';

const DEFAULT_LITERS = 1;
const DEFAULT_PRICE = 0;

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Settings)
    private readonly settings: EntityRepository<Settings>,
    @InjectRepository(Distributor)
    private readonly distributors: EntityRepository<Distributor>,
    @InjectRepository(User)
    private readonly users: EntityRepository<User>,
  ) {}

  async get(userId: string) {
    const distributor = await this.distributorFor(userId);
    const settings = await this.settingsFor(distributor);
    return this.serialize(settings);
  }

  async update(
    userId: string,
    values: { defaultLiters?: number; defaultPrice?: number },
  ) {
    const distributor = await this.distributorFor(userId);
    const settings = await this.settingsFor(distributor);
    if (values.defaultLiters !== undefined)
      settings.defaultLiters = values.defaultLiters;
    if (values.defaultPrice !== undefined)
      settings.defaultPrice = values.defaultPrice;
    await this.settings.getEntityManager().flush();
    return this.serialize(settings);
  }

  async valuesFor(userId: string) {
    const distributor = await this.distributorFor(userId);
    return this.settingsFor(distributor);
  }

  private async settingsFor(distributor: Distributor) {
    const existing = await this.settings.findOne({ distributor });
    if (existing) return existing;
    const created = this.settings.create({
      sid: randomUUID(),
      distributor,
      defaultLiters: DEFAULT_LITERS,
      defaultPrice: DEFAULT_PRICE,
      darkMode: false,
      lightMode: true,
    });
    this.settings.getEntityManager().persist(created);
    await this.settings.getEntityManager().flush();
    return created;
  }

  private async distributorFor(userId: string) {
    const user = await this.users.findOne({ uid: userId });
    const distributor = user ? await this.distributors.findOne({ user }) : null;
    if (!distributor)
      throw new NotFoundException('Distributor account not found');
    return distributor;
  }

  private serialize(settings: Settings) {
    return {
      defaultLiters: settings.defaultLiters,
      defaultPrice: settings.defaultPrice,
    };
  }
}
