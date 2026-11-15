import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { Distributor } from '../entities/distributor.entity.js';
import { Customer } from '../entities/customer.entity.js';
import { User } from '../entities/user.entity.js';

export interface CustomerFilterQuery {
  distributorId?: string;
  distributorName?: string;
  search?: string;
  status?: 'active' | 'inactive' | 'all';
}

@Injectable()
export class DistributorsService {
  constructor(
    @InjectRepository(Distributor)
    private readonly distributors: EntityRepository<Distributor>,
    @InjectRepository(Customer)
    private readonly customers: EntityRepository<Customer>,
    @InjectRepository(User)
    private readonly users: EntityRepository<User>,
  ) {}

  async listDistributors(search?: string) {
    const where: Record<string, any> = {};
    const term = search?.trim();
    if (term) {
      where.$or = [
        { dairyName: { $ilike: `%${term}%` } },
        { did: { $ilike: `%${term}%` } },
      ];
    }

    const distList = await this.distributors.find(where, {
      populate: ['user'],
      orderBy: { dairyName: 'ASC' },
    });

    const allCustomers = await this.customers.find({}, {
      fields: ['cid', 'distributor', 'isActive'],
    });

    const countsByDistributor = new Map<string, { total: number; active: number }>();
    for (const cust of allCustomers) {
      const did = typeof cust.distributor === 'string'
        ? cust.distributor
        : (cust.distributor as any)?.did ?? (cust.distributor as any)?.id;
      if (!did) continue;
      const current = countsByDistributor.get(did) ?? { total: 0, active: 0 };
      current.total += 1;
      if (cust.isActive !== false) {
        current.active += 1;
      }
      countsByDistributor.set(did, current);
    }

    return distList.map((d) => {
      const stats = countsByDistributor.get(d.did) ?? { total: 0, active: 0 };
      const u = d.user;
      return {
        did: d.did,
        dairyName: d.dairyName,
        isActive: d.isActive !== false,
        user: {
          uid: u?.uid ?? '',
          name: u?.name || `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || 'Dairy Owner',
          email: u?.email ?? '',
          phoneNumber: u?.phoneNumber ?? '',
          isActive: u?.isActive !== false,
        },
        customerCount: stats.total,
        activeCustomerCount: stats.active,
      };
    });
  }

  async updateStatus(did: string, isActive: boolean) {
    const distributor = await this.distributors.findOne({ did }, { populate: ['user'] });
    if (!distributor) {
      throw new NotFoundException(`Distributor with ID ${did} not found`);
    }

    distributor.isActive = isActive;
    if (distributor.user) {
      distributor.user.isActive = isActive;
    }

    let updatedCustomersCount = 0;
    if (!isActive) {
      // Deactivate all customers belonging to this distributor
      const custs = await this.customers.find({ distributor });
      for (const c of custs) {
        c.isActive = false;
      }
      updatedCustomersCount = custs.length;
    }

    await this.distributors.getEntityManager().flush();

    return {
      success: true,
      did: distributor.did,
      dairyName: distributor.dairyName,
      isActive: distributor.isActive,
      updatedCustomersCount,
      message: isActive
        ? `Distributor "${distributor.dairyName}" has been activated.`
        : `Distributor "${distributor.dairyName}" and all ${updatedCustomersCount} associated customers have been deactivated.`,
    };
  }

  async listCustomers(filter: CustomerFilterQuery) {
    const where: Record<string, any> = {};

    if (filter.distributorId?.trim()) {
      where.distributor = { did: filter.distributorId.trim() };
    }

    if (filter.distributorName?.trim()) {
      where.distributor = {
        ...(where.distributor ?? {}),
        dairyName: { $ilike: `%${filter.distributorName.trim()}%` },
      };
    }

    if (filter.status === 'active') {
      where.isActive = true;
    } else if (filter.status === 'inactive') {
      where.isActive = false;
    }

    const term = filter.search?.trim();
    if (term) {
      where.$or = [
        { name: { $ilike: `%${term}%` } },
        { phoneNumber: { $ilike: `%${term}%` } },
        { uniqueNumber: { $ilike: `%${term}%` } },
      ];
    }

    const customers = await this.customers.find(where, {
      populate: ['distributor'],
      orderBy: { uniqueNumber: 'ASC' },
    });

    customers.sort((a, b) => {
      const numA = Number.parseInt(a.uniqueNumber, 10);
      const numB = Number.parseInt(b.uniqueNumber, 10);
      if (Number.isInteger(numA) && Number.isInteger(numB)) {
        return numA - numB;
      }
      return a.uniqueNumber.localeCompare(b.uniqueNumber);
    });

    return customers.map((c) => ({
      cid: c.cid,
      uniqueNumber: c.uniqueNumber,
      name: c.name,
      phoneNumber: c.phoneNumber ?? '',
      liters: Number(c.liters ?? 0),
      price: Number(c.price ?? 0),
      notificationChannel: c.notificationChannel,
      isActive: c.isActive !== false,
      distributor: {
        did: c.distributor?.did ?? '',
        dairyName: c.distributor?.dairyName ?? 'Unknown',
      },
    }));
  }
}
