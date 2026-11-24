import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { Distributor } from '../entities/distributor.entity.js';
import { Customer } from '../entities/customer.entity.js';
import { User } from '../entities/user.entity.js';
import { MilkEntry } from '../entities/milk-entry.entity.js';
import { PaymentEntry } from '../entities/payment-entry.entity.js';

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
    @InjectRepository(MilkEntry)
    private readonly milkEntries: EntityRepository<MilkEntry>,
    @InjectRepository(PaymentEntry)
    private readonly paymentEntries: EntityRepository<PaymentEntry>,
  ) {}

  async listDistributors(
    search?: string,
    status?: 'active' | 'inactive' | 'all',
  ) {
    const where: Record<string, any> = {};
    if (status === 'active') {
      where.isActive = true;
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    const term = search?.trim();
    if (term) {
      where.$or = [
        { dairyName: { $ilike: `%${term}%` } },
        { did: { $ilike: `%${term}%` } },
        { user: { name: { $ilike: `%${term}%` } } },
        { user: { email: { $ilike: `%${term}%` } } },
        { user: { phoneNumber: { $ilike: `%${term}%` } } },
      ];
    }

    const distList = await this.distributors.find(where, {
      populate: ['user'],
      orderBy: { dairyName: 'ASC' },
    });

    const allCustomers = await this.customers.find(
      {},
      {
        fields: ['cid', 'distributor', 'isActive'],
      },
    );

    const countsByDistributor = new Map<
      string,
      { total: number; active: number }
    >();
    for (const cust of allCustomers) {
      const did =
        typeof cust.distributor === 'string'
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
        id: d.did,
        dairyName: d.dairyName,
        isActive: d.isActive !== false,
        createdAt: d.createdAt
          ? d.createdAt instanceof Date
            ? d.createdAt.toISOString()
            : String(d.createdAt)
          : null,
        user: {
          uid: u?.uid ?? '',
          name:
            u?.name ||
            `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() ||
            'Dairy Owner',
          email: u?.email ?? '',
          phoneNumber: u?.phoneNumber ?? '',
          isActive: u?.isActive !== false,
        },
        customerCount: stats.total,
        activeCustomerCount: stats.active,
      };
    });
  }

  async getStats() {
    const [allDistributors, allCustomers, allMilkEntries, allPayments] =
      await Promise.all([
        this.distributors.find({}, { populate: ['user'] }),
        this.customers.find({}),
        this.milkEntries.find(
          {},
          { orderBy: { entryDate: 'DESC' }, limit: 1000 },
        ),
        this.paymentEntries.find(
          {},
          {
            populate: ['customer', 'distributor'],
            orderBy: { receivedDate: 'DESC' },
            limit: 1000,
          },
        ),
      ]);

    const totalDistributors = allDistributors.length;
    const activeDistributors = allDistributors.filter(
      (d) => d.isActive !== false,
    ).length;
    const inactiveDistributors = totalDistributors - activeDistributors;

    const totalCustomers = allCustomers.length;
    const activeCustomers = allCustomers.filter(
      (c) => c.isActive !== false,
    ).length;

    let totalMilkLiters = 0;
    let totalMilkValue = 0;
    for (const entry of allMilkEntries) {
      const l = Number(entry.liters || 0);
      totalMilkLiters += l;
      const total = Number(entry.total ?? -1);
      if (total >= 0) {
        totalMilkValue += total;
      } else {
        totalMilkValue += l * Number(entry.price || 0);
      }
    }

    let totalPaymentsReceived = 0;
    for (const p of allPayments) {
      totalPaymentsReceived += Number(p.receivedAmount || 0);
    }

    totalMilkLiters = Math.round((totalMilkLiters + Number.EPSILON) * 100) / 100;
    totalMilkValue = Math.round((totalMilkValue + Number.EPSILON) * 100) / 100;
    totalPaymentsReceived =
      Math.round((totalPaymentsReceived + Number.EPSILON) * 100) / 100;
    const totalOutstandingAmount = Math.max(
      0,
      Math.round(
        (totalMilkValue - totalPaymentsReceived + Number.EPSILON) * 100,
      ) / 100,
    );

    const recentActivity = allMilkEntries.slice(0, 10).map((e) => ({
      id: e.eid,
      type: 'milk_entry',
      date:
        e.entryDate instanceof Date
          ? e.entryDate.toISOString().slice(0, 10)
          : String(e.entryDate).slice(0, 10),
      liters: Number(e.liters || 0),
      price: Number(e.price || 0),
      total:
        Number(e.total ?? -1) >= 0
          ? Number(e.total)
          : Math.round(
              (Number(e.liters || 0) * Number(e.price || 0) + Number.EPSILON) *
                100,
            ) / 100,
    }));

    return {
      totalDistributors,
      activeDistributors,
      inactiveDistributors,
      totalCustomers,
      activeCustomers,
      totalMilkLiters,
      totalMilkCollection: totalMilkLiters,
      totalMilkValue,
      totalTransactions: allPayments.length,
      totalPaymentsReceived,
      totalOutstandingAmount,
      recentActivity,
    };
  }

  async getDistributorDetails(did: string) {
    const distributor = await this.distributors.findOne(
      { did },
      { populate: ['user'] },
    );
    if (!distributor) {
      throw new NotFoundException(`Distributor with ID ${did} not found`);
    }

    const customers = await this.customers.find(
      { distributor },
      { orderBy: { uniqueNumber: 'ASC' } },
    );
    const milkEntries = await this.milkEntries.find({ distributor });
    const payments = await this.paymentEntries.find({ distributor });

    let totalLiters = 0;
    let totalMilkAmount = 0;
    for (const e of milkEntries) {
      const l = Number(e.liters || 0);
      totalLiters += l;
      const t = Number(e.total ?? -1);
      totalMilkAmount += t >= 0 ? t : l * Number(e.price || 0);
    }

    let totalPaymentsReceived = 0;
    for (const p of payments) {
      totalPaymentsReceived += Number(p.receivedAmount || 0);
    }

    totalLiters = Math.round((totalLiters + Number.EPSILON) * 100) / 100;
    totalMilkAmount = Math.round((totalMilkAmount + Number.EPSILON) * 100) / 100;
    totalPaymentsReceived =
      Math.round((totalPaymentsReceived + Number.EPSILON) * 100) / 100;
    const outstandingBalance =
      Math.round((totalMilkAmount - totalPaymentsReceived + Number.EPSILON) * 100) /
      100;

    const u = distributor.user;

    customers.sort((a, b) => {
      const numA = Number.parseInt(a.uniqueNumber, 10);
      const numB = Number.parseInt(b.uniqueNumber, 10);
      if (Number.isInteger(numA) && Number.isInteger(numB)) return numA - numB;
      return (a.uniqueNumber || '').localeCompare(b.uniqueNumber || '');
    });

    return {
      distributor: {
        did: distributor.did,
        id: distributor.did,
        dairyName: distributor.dairyName,
        isActive: distributor.isActive !== false,
        createdAt:
          distributor.createdAt instanceof Date
            ? distributor.createdAt.toISOString()
            : String(distributor.createdAt || ''),
        user: {
          uid: u?.uid ?? '',
          name:
            u?.name ||
            `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() ||
            'Dairy Owner',
          email: u?.email ?? '',
          phoneNumber: u?.phoneNumber ?? '',
          isActive: u?.isActive !== false,
        },
      },
      overview: {
        totalCustomers: customers.length,
        activeCustomers: customers.filter((c) => c.isActive !== false).length,
        totalMilkLiters: totalLiters,
        totalMilkAmount,
        totalPaymentsReceived,
        outstandingBalance,
      },
      customers: customers.map((c) => ({
        cid: c.cid,
        id: c.cid,
        uniqueNumber: c.uniqueNumber,
        name: c.name,
        phoneNumber: c.phoneNumber ?? '',
        liters: Number(c.liters ?? 0),
        price: Number(c.price ?? 0),
        isActive: c.isActive !== false,
        notificationChannel: c.notificationChannel,
      })),
    };
  }

  async getCustomerDetails(cid: string) {
    const customer = await this.customers.findOne(
      { cid },
      { populate: ['distributor', 'distributor.user'] },
    );
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${cid} not found`);
    }

    const milkEntries = await this.milkEntries.find(
      { customer },
      { orderBy: { entryDate: 'DESC' } },
    );
    const payments = await this.paymentEntries.find(
      { customer },
      { orderBy: [{ year: 'DESC' }, { month: 'DESC' }] },
    );

    let totalLiters = 0;
    let totalBilled = 0;
    const monthlyGroups = new Map<
      string,
      { liters: number; billed: number; paid: number; entries: number }
    >();

    for (const e of milkEntries) {
      const l = Number(e.liters || 0);
      const price = Number(e.price || customer.price || 0);
      const entryTotal =
        Number(e.total ?? -1) >= 0
          ? Number(e.total)
          : Math.round((l * price + Number.EPSILON) * 100) / 100;
      totalLiters += l;
      totalBilled += entryTotal;

      const dateStr =
        e.entryDate instanceof Date
          ? e.entryDate.toISOString()
          : String(e.entryDate);
      const ym = dateStr.slice(0, 7);
      const cur = monthlyGroups.get(ym) ?? {
        liters: 0,
        billed: 0,
        paid: 0,
        entries: 0,
      };
      cur.liters += l;
      cur.billed += entryTotal;
      cur.entries += 1;
      monthlyGroups.set(ym, cur);
    }

    let totalPaid = 0;
    for (const p of payments) {
      const paid = Number(p.receivedAmount || 0);
      totalPaid += paid;
      const ym = `${p.year}-${String(p.month).padStart(2, '0')}`;
      const cur = monthlyGroups.get(ym) ?? {
        liters: 0,
        billed: 0,
        paid: 0,
        entries: 0,
      };
      cur.paid += paid;
      monthlyGroups.set(ym, cur);
    }

    totalLiters = Math.round((totalLiters + Number.EPSILON) * 100) / 100;
    totalBilled = Math.round((totalBilled + Number.EPSILON) * 100) / 100;
    totalPaid = Math.round((totalPaid + Number.EPSILON) * 100) / 100;
    const outstandingBalance =
      Math.round((totalBilled - totalPaid + Number.EPSILON) * 100) / 100;

    const monthlyBills = Array.from(monthlyGroups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([period, data]) => ({
        period,
        liters: Math.round((data.liters + Number.EPSILON) * 100) / 100,
        billedAmount: Math.round((data.billed + Number.EPSILON) * 100) / 100,
        paidAmount: Math.round((data.paid + Number.EPSILON) * 100) / 100,
        dueAmount: Math.max(
          0,
          Math.round((data.billed - data.paid + Number.EPSILON) * 100) / 100,
        ),
        status:
          data.paid >= data.billed
            ? 'Paid'
            : data.paid > 0
              ? 'Partial'
              : 'Pending',
        entriesCount: data.entries,
      }));

    const dist = customer.distributor;
    const owner = dist?.user;

    return {
      customer: {
        cid: customer.cid,
        id: customer.cid,
        name: customer.name,
        uniqueNumber: customer.uniqueNumber,
        phoneNumber: customer.phoneNumber ?? '',
        liters: Number(customer.liters ?? 0),
        price: Number(customer.price ?? 0),
        notificationChannel: customer.notificationChannel,
        isActive: customer.isActive !== false,
      },
      distributor: {
        did: dist?.did ?? '',
        id: dist?.did ?? '',
        dairyName: dist?.dairyName ?? 'Unknown Dairy',
        ownerName:
          owner?.name ||
          `${owner?.firstName ?? ''} ${owner?.lastName ?? ''}`.trim() ||
          'Dairy Owner',
        ownerEmail: owner?.email ?? '',
        ownerPhone: owner?.phoneNumber ?? '',
      },
      summary: {
        totalLiters,
        totalBilled,
        totalPaid,
        outstandingBalance,
      },
      milkEntries: milkEntries.map((e) => {
        const l = Number(e.liters || 0);
        const p = Number(e.price || customer.price || 0);
        const dateStr =
          e.entryDate instanceof Date
            ? e.entryDate.toISOString().slice(0, 10)
            : String(e.entryDate).slice(0, 10);
        return {
          id: e.eid,
          eid: e.eid,
          entryDate: dateStr,
          liters: l,
          price: p,
          total:
            Number(e.total ?? -1) >= 0
              ? Number(e.total)
              : Math.round((l * p + Number.EPSILON) * 100) / 100,
        };
      }),
      payments: payments.map((p) => ({
        id: p.pid,
        pid: p.pid,
        year: p.year,
        month: p.month,
        period: `${p.year}-${String(p.month).padStart(2, '0')}`,
        billAmount: Number(p.billAmount || 0),
        receivedAmount: Number(p.receivedAmount || 0),
        receivedDate:
          p.receivedDate instanceof Date
            ? p.receivedDate.toISOString().slice(0, 10)
            : String(p.receivedDate).slice(0, 10),
        note: p.note ?? '',
      })),
      monthlyBills,
    };
  }

  async getTransactions() {
    const payments = await this.paymentEntries.find(
      {},
      {
        populate: ['customer', 'distributor', 'user'],
        orderBy: [{ receivedDate: 'DESC' }, { createdAt: 'DESC' }],
        limit: 500,
      },
    );

    let totalReceived = 0;
    let totalBilled = 0;

    const formatted = payments.map((p) => {
      const rec = Number(p.receivedAmount || 0);
      const bill = Number(p.billAmount || 0);
      totalReceived += rec;
      totalBilled += bill;

      const c = p.customer;
      const d = p.distributor;

      return {
        id: p.pid,
        pid: p.pid,
        year: p.year,
        month: p.month,
        period: `${p.year}-${String(p.month).padStart(2, '0')}`,
        billAmount: bill,
        receivedAmount: rec,
        balance: Math.max(
          0,
          Math.round((bill - rec + Number.EPSILON) * 100) / 100,
        ),
        note: p.note ?? '',
        receivedDate:
          p.receivedDate instanceof Date
            ? p.receivedDate.toISOString().slice(0, 10)
            : String(p.receivedDate).slice(0, 10),
        createdAt:
          p.createdAt instanceof Date
            ? p.createdAt.toISOString()
            : String(p.createdAt),
        customer: {
          cid: c?.cid ?? '',
          name: c?.name ?? 'Unknown Customer',
          uniqueNumber: c?.uniqueNumber ?? '0',
          phoneNumber: c?.phoneNumber ?? '',
        },
        distributor: {
          did: d?.did ?? '',
          dairyName: d?.dairyName ?? 'Unknown Dairy',
        },
      };
    });

    totalReceived = Math.round((totalReceived + Number.EPSILON) * 100) / 100;
    totalBilled = Math.round((totalBilled + Number.EPSILON) * 100) / 100;
    const totalOutstanding = Math.max(
      0,
      Math.round((totalBilled - totalReceived + Number.EPSILON) * 100) / 100,
    );

    return {
      summary: {
        totalTransactions: formatted.length,
        totalReceivedAmount: totalReceived,
        totalBilledAmount: totalBilled,
        totalOutstandingAmount: totalOutstanding,
      },
      transactions: formatted,
    };
  }

  async updateStatus(did: string, isActive: boolean) {
    const distributor = await this.distributors.findOne(
      { did },
      { populate: ['user'] },
    );
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
      id: c.cid,
      uniqueNumber: c.uniqueNumber,
      name: c.name,
      phoneNumber: c.phoneNumber ?? '',
      liters: Number(c.liters ?? 0),
      price: Number(c.price ?? 0),
      notificationChannel: c.notificationChannel,
      isActive: c.isActive !== false,
      distributor: {
        did: c.distributor?.did ?? '',
        id: c.distributor?.did ?? '',
        dairyName: c.distributor?.dairyName ?? 'Unknown',
      },
    }));
  }
}
