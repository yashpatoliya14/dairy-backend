import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { Customer, NotificationChannel } from '../entities/customer.entity.js';
import { Distributor } from '../entities/distributor.entity.js';
import { User } from '../entities/user.entity.js';
import { MilkEntry } from '../entities/milk-entry.entity.js';
import { PaymentEntry } from '../entities/payment-entry.entity.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { CreateMilkEntryDto } from './dto/create-milk-entry.dto.js';
import { CreatePaymentEntryDto } from './dto/create-payment-entry.dto.js';
import { randomUUID } from 'node:crypto';
import { SettingsService } from '../settings/settings.service.js';
import { SendWhatsAppDto } from './dto/send-whatsapp.dto.js';
import { WhatsAppService } from '../whatsapp/whatsapp.service.js';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customers: EntityRepository<Customer>,
    @InjectRepository(Distributor)
    private readonly distributors: EntityRepository<Distributor>,
    @InjectRepository(User)
    private readonly users: EntityRepository<User>,
    @InjectRepository(MilkEntry)
    private readonly entries: EntityRepository<MilkEntry>,
    @InjectRepository(PaymentEntry)
    private readonly payments: EntityRepository<PaymentEntry>,
    private readonly settingsService: SettingsService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  async create(userId: string, dto: CreateCustomerDto) {
    const distributor = await this.distributorFor(userId);
    const settings = await this.settingsService.valuesFor(userId);
    const uniqueNumber = await this.nextUniqueNumber(distributor);
    const customer = this.customers.create({
      cid: randomUUID(),
      distributor,
      user: await this.userFor(userId),
      name: dto.name.trim(),
      uniqueNumber,
      liters: dto.liters ?? settings.defaultLiters,
      price: dto.price ?? settings.defaultPrice,
      phoneNumber: dto.phoneNumber.trim(),
      notificationChannel: dto.notificationChannel as NotificationChannel,
    });
    const em = this.customers.getEntityManager();
    em.persist(customer);
    await em.flush();
    return this.serialize(customer);
  }

  async update(userId: string, customerId: string, dto: UpdateCustomerDto) {
    const customer = await this.customerFor(userId, customerId);
    if (dto.name !== undefined) customer.name = dto.name.trim();
    if (dto.liters !== undefined) customer.liters = dto.liters;
    if (dto.price !== undefined) customer.price = dto.price;
    if (dto.phoneNumber !== undefined)
      customer.phoneNumber = dto.phoneNumber.trim();
    if (dto.notificationChannel !== undefined) {
      customer.notificationChannel =
        dto.notificationChannel as NotificationChannel;
    }
    await this.customers.getEntityManager().flush();
    return this.serialize(customer);
  }

  async createEntry(
    userId: string,
    customerId: string,
    dto: CreateMilkEntryDto,
  ) {
    const customer = await this.customerFor(userId, customerId);
    const distributor = await this.distributorFor(userId);
    const entryDate = new Date(`${dto.entryDate}T00:00:00.000Z`);
    const liters = Math.round((Number(dto.liters) + Number.EPSILON) * 100) / 100;
    const price = Math.round((Number(dto.price) + Number.EPSILON) * 100) / 100;
    const total = Math.round((liters * price + Number.EPSILON) * 100) / 100;
    const existing = await this.entries.findOne({ customer, entryDate });
    if (existing) {
      existing.liters = liters;
      existing.price = price;
      existing.total = total;
      await this.entries.getEntityManager().flush();
      return this.serializeEntry(existing);
    }
    const entry = this.entries.create({
      eid: randomUUID(),
      customer,
      distributor,
      user: await this.userFor(userId),
      entryDate,
      liters,
      price,
      total,
    });
    this.entries.getEntityManager().persist(entry);
    await this.entries.getEntityManager().flush();
    return this.serializeEntry(entry);
  }

  async listEntries(userId: string, customerId: string, month?: string) {
    const customer = await this.customerFor(userId, customerId);
    if (month && /^\d{4}-\d{2}$/.test(month.trim())) {
      const [yearStr, monthStr] = month.trim().split('-');
      const year = Number.parseInt(yearStr, 10);
      const m = Number.parseInt(monthStr, 10);
      const daysInMonth = new Date(year, m, 0).getDate();
      const lastDayStr = String(daysInMonth).padStart(2, '0');
      const startDate = new Date(`${yearStr}-${monthStr}-01T00:00:00.000Z`);
      const endDate = new Date(
        `${yearStr}-${monthStr}-${lastDayStr}T23:59:59.999Z`,
      );
      const entries = await this.entries.find(
        {
          customer,
          entryDate: { $gte: startDate, $lte: endDate },
        },
        { orderBy: { entryDate: 'ASC' } },
      );
      return entries.map((entry) => this.serializeEntry(entry));
    }

    const entries = await this.entries.find(
      { customer },
      { orderBy: { entryDate: 'DESC' }, limit: 31 },
    );
    return entries.map((entry) => this.serializeEntry(entry));
  }

  async deleteEntry(userId: string, customerId: string, entryId: string) {
    const customer = await this.customerFor(userId, customerId);
    const distributor = await this.distributorFor(userId);
    const entry = await this.entries.findOne({
      eid: entryId,
      customer,
      distributor,
    });
    if (!entry) {
      throw new NotFoundException('Milk entry not found');
    }
    const em = this.entries.getEntityManager();
    em.remove(entry);
    await em.flush();
    return { success: true, message: 'Milk entry deleted successfully' };
  }

  async listEntriesForMonth(
    userId: string,
    customerId: string,
    year: number,
    month: number,
  ) {
    const customer = await this.customerFor(userId, customerId);
    const startDate = new Date(
      Date.UTC(year, month - 1, 1, 0, 0, 0, 0),
    );
    const endDate = new Date(
      Date.UTC(year, month, 0, 23, 59, 59, 999),
    );
    const entries = await this.entries.find(
      {
        customer,
        entryDate: { $gte: startDate, $lte: endDate },
      },
      { orderBy: { entryDate: 'ASC' } },
    );
    const totalLiters = entries.reduce(
      (sum, e) => sum + Number(e.liters || 0),
      0,
    );
    const totalAmount = entries.reduce(
      (sum, e) =>
        sum +
        (e.total != null
          ? Number(e.total)
          : Math.round(
              (Number(e.liters || 0) * Number(e.price || 0) + Number.EPSILON) *
                100,
            ) / 100),
      0,
    );
    return {
      year,
      month,
      daysInMonth: endDate.getUTCDate(),
      entriesCount: entries.length,
      totalLiters: Math.round((totalLiters + Number.EPSILON) * 100) / 100,
      totalAmount: Math.round((totalAmount + Number.EPSILON) * 100) / 100,
      entries: entries.map((entry) => this.serializeEntry(entry)),
    };
  }

  async notifyWhatsApp(
    userId: string,
    customerId: string,
    dto: SendWhatsAppDto,
  ) {
    const customer = await this.customerFor(userId, customerId);
    if (!customer.phoneNumber) {
      throw new NotFoundException('Customer has no phone number');
    }
    return this.whatsappService.sendMilkEntryMessage({
      phoneNumber: customer.phoneNumber,
      customerName: customer.name,
      liters: dto.liters,
      price: dto.price,
    });
  }

  async list(userId: string, search?: string) {
    const distributor = await this.distributorFor(userId);
    const term = search?.trim();
    const where = term
      ? {
          distributor,
          $or: [
            { name: { $ilike: `%${term}%` } },
            { phoneNumber: { $ilike: `%${term}%` } },
            { uniqueNumber: { $ilike: `%${term}%` } },
          ],
        }
      : { distributor };
    const customers = await this.customers.find(
      where,
      { orderBy: { uniqueNumber: 'ASC' } },
    );
    customers.sort((a, b) => {
      const numA = Number.parseInt(a.uniqueNumber, 10);
      const numB = Number.parseInt(b.uniqueNumber, 10);
      if (Number.isInteger(numA) && Number.isInteger(numB)) {
        return numA - numB;
      }
      return a.uniqueNumber.localeCompare(b.uniqueNumber);
    });
    return customers.map((customer) => this.serialize(customer));
  }

  async delete(userId: string, customerId: string) {
    const customer = await this.customerFor(userId, customerId);
    const em = this.customers.getEntityManager();

    // 1. Delete associated payment entries safely if table exists
    try {
      const customerPayments = await this.payments.find({ customer });
      for (const p of customerPayments) {
        em.remove(p);
      }
    } catch (_) {
      // Payment table might be empty or uninitialized
    }

    // 2. Delete associated milk entries
    const customerEntries = await this.entries.find({ customer });
    for (const e of customerEntries) {
      em.remove(e);
    }

    // 3. Delete customer; customer numbers of other customers remain untouched (e.g. 1, 2, 3, 5)
    em.remove(customer);
    await em.flush();

    return {
      success: true,
      message: 'Customer deleted successfully',
      deletedCustomerNumber: customer.uniqueNumber,
    };
  }

  async savePayment(
    userId: string,
    customerId: string,
    dto: CreatePaymentEntryDto,
  ) {
    const customer = await this.customerFor(userId, customerId);
    const distributor = await this.distributorFor(userId);
    const user = await this.userFor(userId);
    const receivedDate = dto.receivedDate
      ? new Date(dto.receivedDate)
      : new Date();

    let payment = await this.payments.findOne(
      {
        customer,
        year: dto.year,
        month: dto.month,
      },
      { populate: ['customer'] },
    );

    if (payment) {
      payment.billAmount = dto.billAmount;
      payment.receivedAmount = dto.receivedAmount;
      if (dto.note !== undefined) payment.note = dto.note;
      payment.receivedDate = receivedDate;
      payment.updatedAt = new Date();
      await this.payments.getEntityManager().flush();
      return this.serializePayment(payment);
    }

    payment = this.payments.create({
      pid: randomUUID(),
      customer,
      distributor,
      user,
      year: dto.year,
      month: dto.month,
      billAmount: dto.billAmount,
      receivedAmount: dto.receivedAmount,
      note: dto.note ?? '',
      receivedDate,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.payments.getEntityManager().persist(payment);
    await this.payments.getEntityManager().flush();
    return this.serializePayment(payment);
  }

  async getPayment(
    userId: string,
    customerId: string,
    year: number,
    month: number,
  ) {
    const customer = await this.customerFor(userId, customerId);
    try {
      const payment = await this.payments.findOne(
        {
          customer,
          year,
          month,
        },
        { populate: ['customer'] },
      );
      if (!payment) return null;
      return this.serializePayment(payment);
    } catch (_) {
      return null;
    }
  }

  async listPayments(userId: string, customerId: string) {
    const customer = await this.customerFor(userId, customerId);
    try {
      const payments = await this.payments.find(
        { customer },
        { orderBy: { year: 'DESC', month: 'DESC' }, populate: ['customer'] },
      );
      return payments.map((p) => this.serializePayment(p));
    } catch (_) {
      return [];
    }
  }

  async deletePayment(
    userId: string,
    customerId: string,
    options: { year?: number; month?: number; paymentId?: string },
  ) {
    const customer = await this.customerFor(userId, customerId);
    const where: Record<string, any> = { customer };
    if (options.paymentId) {
      where.pid = options.paymentId;
    } else if (options.year && options.month) {
      where.year = options.year;
      where.month = options.month;
    } else {
      throw new NotFoundException('Payment identifier required');
    }

    const payment = await this.payments.findOne(where);
    if (!payment) {
      throw new NotFoundException('Payment entry not found');
    }

    const em = this.payments.getEntityManager();
    em.remove(payment);
    await em.flush();
    return { success: true, message: 'Payment entry deleted successfully' };
  }

  private async distributorFor(userId: string) {
    const distributor = await this.distributors.findOne({
      user: await this.userFor(userId),
    });
    if (!distributor) {
      throw new NotFoundException('Distributor account not found');
    }
    return distributor;
  }

  private async userFor(userId: string) {
    const user = await this.users.findOne({ uid: userId });
    if (!user) {
      throw new NotFoundException('User account not found');
    }
    return user;
  }

  private async nextUniqueNumber(distributor: Distributor) {
    const customers = await this.customers.find(
      { distributor },
      { fields: ['uniqueNumber'] },
    );
    const highestNumber = customers.reduce((highest, customer) => {
      const number = Number.parseInt(customer.uniqueNumber, 10);
      return Number.isInteger(number) && number > highest ? number : highest;
    }, 0);
    return String(highestNumber + 1);
  }

  private async customerFor(userId: string, customerId: string) {
    const customer = await this.customers.findOne({
      cid: customerId,
      distributor: await this.distributorFor(userId),
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  private serialize(customer: Customer) {
    return {
      id: customer.cid,
      name: customer.name,
      uniqueNumber: customer.uniqueNumber,
      liters: customer.liters,
      price: customer.price,
      phoneNumber: customer.phoneNumber,
      notificationChannel: customer.notificationChannel,
    };
  }

  private serializeEntry(entry: MilkEntry) {
    return {
      id: entry.eid,
      entryDate: this.serializeEntryDate(entry.entryDate),
      liters: entry.liters,
      price: entry.price,
      total: entry.total,
    };
  }

  private serializeEntryDate(value: Date | string) {
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
      }
    } else if (!Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }

    throw new Error('Milk entry has an invalid entry date');
  }

  async getBootstrapData(userId: string, dateStr?: string) {
    const user = await this.userFor(userId);
    const distributor = await this.distributorFor(userId);
    const [settings, customerList, todaySummary] = await Promise.all([
      this.settingsService.get(userId),
      this.list(userId),
      this.whatsappService.getDailySummary(userId, dateStr),
    ]);

    return {
      profile: {
        id: user.uid,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        dairyName: distributor.dairyName,
        phoneNumber: user.phoneNumber ?? '',
        name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
      },
      settings,
      customers: customerList,
      todaySummary,
    };
  }

  async getMonthlyBillsSummary(userId: string, year: number, month: number) {
    const distributor = await this.distributorFor(userId);
    const customers = await this.customers.find(
      { distributor },
      { orderBy: { uniqueNumber: 'ASC' } },
    );

    const monthConfigs: { year: number; month: number }[] = [];
    for (let offset = 0; offset <= 3; offset++) {
      let y = year;
      let m = month - offset;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      monthConfigs.push({ year: y, month: m });
    }

    const oldest = monthConfigs[monthConfigs.length - 1];
    const newest = monthConfigs[0];

    const newestDays = new Date(newest.year, newest.month, 0).getDate();
    const oldestMonthStr = String(oldest.month).padStart(2, '0');
    const newestMonthStr = String(newest.month).padStart(2, '0');
    const newestDaysStr = String(newestDays).padStart(2, '0');

    const startDate = new Date(`${oldest.year}-${oldestMonthStr}-01T00:00:00.000Z`);
    const endDate = new Date(`${newest.year}-${newestMonthStr}-${newestDaysStr}T23:59:59.999Z`);

    const paymentOrConditions = monthConfigs.map((mc) => ({
      year: mc.year,
      month: mc.month,
    }));

    const [allEntries, allPayments] = await Promise.all([
      this.entries.find(
        {
          distributor,
          entryDate: { $gte: startDate, $lte: endDate },
        },
        { populate: ['customer'] },
      ),
      this.payments
        .find(
          {
            distributor,
            $or: paymentOrConditions,
          },
          { populate: ['customer'] },
        )
        .catch(() => []),
    ]);

    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];

    const entriesMap = new Map<string, Map<string, MilkEntry[]>>();
    for (const e of allEntries) {
      const cid = this.extractCustomerId(e.customer);
      const eDate = e.entryDate instanceof Date ? e.entryDate : new Date(e.entryDate);
      const key = `${eDate.getUTCFullYear()}-${String(eDate.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!entriesMap.has(cid)) entriesMap.set(cid, new Map());
      const cMap = entriesMap.get(cid)!;
      if (!cMap.has(key)) cMap.set(key, []);
      cMap.get(key)!.push(e);
    }

    const paymentsMap = new Map<string, Map<string, PaymentEntry>>();
    for (const p of allPayments) {
      const cid = this.extractCustomerId(p.customer);
      const key = `${p.year}-${String(p.month).padStart(2, '0')}`;
      if (!paymentsMap.has(cid)) paymentsMap.set(cid, new Map());
      paymentsMap.get(cid)!.set(key, p);
    }

    const currentKey = `${year}-${String(month).padStart(2, '0')}`;

    const items = customers.map((c) => {
      const cEntriesMap = entriesMap.get(c.cid) ?? new Map();
      const cPaymentsMap = paymentsMap.get(c.cid) ?? new Map();
      const defaultPrice = Number(c.price ?? 0);

      const currentEntries = cEntriesMap.get(currentKey) ?? [];
      let thisMonthLiters = 0;
      let thisMonthBill = 0;
      let activeDays = 0;

      for (const e of currentEntries) {
        const l = Number(e.liters ?? 0);
        thisMonthLiters += l;
        if (l > 0) activeDays++;
        const total = Number(e.total ?? -1);
        if (total >= 0) {
          thisMonthBill += total;
        } else {
          const p = Number(e.price ?? defaultPrice);
          thisMonthBill += Number((l * p).toFixed(2));
        }
      }
      thisMonthLiters = Number(thisMonthLiters.toFixed(2));
      thisMonthBill = Number(thisMonthBill.toFixed(2));

      const curPayment = cPaymentsMap.get(currentKey);
      const thisMonthPaid = curPayment ? Number(curPayment.receivedAmount ?? 0) : 0;
      const paymentNote = curPayment?.note ?? '';
      const paymentDate = curPayment?.receivedDate
        ? curPayment.receivedDate instanceof Date
          ? curPayment.receivedDate.toISOString()
          : String(curPayment.receivedDate)
        : null;
      const hasPayment = !!curPayment;

      let grossPastDue = 0;
      let grossPastAdvance = 0;
      const pastMonthsBreakdown: string[] = [];

      for (let offset = 1; offset <= 3; offset++) {
        const pastConfig = monthConfigs[offset];
        const pastKey = `${pastConfig.year}-${String(pastConfig.month).padStart(2, '0')}`;
        const pastEntries = cEntriesMap.get(pastKey) ?? [];
        const pastPayment = cPaymentsMap.get(pastKey);

        let prevBill = 0;
        for (const e of pastEntries) {
          const total = Number(e.total ?? -1);
          if (total >= 0) {
            prevBill += total;
          } else {
            const l = Number(e.liters ?? 0);
            const p = Number(e.price ?? defaultPrice);
            prevBill += Number((l * p).toFixed(2));
          }
        }
        prevBill = Number(prevBill.toFixed(2));
        const prevPaid = pastPayment ? Number(pastPayment.receivedAmount ?? 0) : 0;

        if (prevBill > 0 || prevPaid > 0) {
          const diff = prevBill - prevPaid;
          const mName = monthNames[pastConfig.month - 1];
          if (diff > 0.5) {
            grossPastDue += diff;
            pastMonthsBreakdown.push(`${mName}: ₹${diff.toFixed(0)} due`);
          } else if (diff < -0.5) {
            const advance = -diff;
            grossPastAdvance += advance;
            pastMonthsBreakdown.push(`${mName}: +₹${advance.toFixed(0)} overpaid`);
          }
        }
      }

      grossPastDue = Number(grossPastDue.toFixed(2));
      grossPastAdvance = Number(grossPastAdvance.toFixed(2));

      const thisMonthDue = thisMonthPaid >= thisMonthBill
        ? 0
        : Number((thisMonthBill - thisMonthPaid).toFixed(2));
      const thisMonthAdvance = thisMonthPaid > thisMonthBill
        ? Number((thisMonthPaid - thisMonthBill).toFixed(2))
        : 0;

      const creditsForPast = thisMonthAdvance + grossPastAdvance;
      const remainingPastDue = grossPastDue > creditsForPast
        ? Number((grossPastDue - creditsForPast).toFixed(2))
        : 0;
      const netAdvance = creditsForPast > grossPastDue
        ? Number((creditsForPast - grossPastDue).toFixed(2))
        : 0;
      const netBalanceDue = Number((remainingPastDue + thisMonthDue).toFixed(2));

      return {
        customerId: c.cid,
        name: c.name,
        phone: c.phoneNumber ?? '',
        number: String(c.uniqueNumber ?? '0'),
        defaultPrice,
        defaultLiters: Number(c.liters ?? 1.0),
        thisMonthLiters,
        thisMonthBill,
        thisMonthPaid,
        thisMonthDue,
        activeDays,
        daysInMonth: newestDays,
        grossPastDue,
        grossPastAdvance,
        pastMonthsDue: remainingPastDue,
        pastMonthsAdvance: grossPastAdvance,
        pastMonthsBreakdown,
        netBalanceDue,
        netAdvance,
        paymentNote,
        paymentDate,
        hasPayment,
        customer: {
          id: c.cid,
          name: c.name,
          phoneNumber: c.phoneNumber ?? '',
          uniqueNumber: String(c.uniqueNumber ?? '0'),
          price: defaultPrice,
          liters: Number(c.liters ?? 1.0),
        },
      };
    });

    return items;
  }

  private extractCustomerId(customer: any): string {
    if (!customer) return '';
    if (typeof customer === 'string') return customer;
    if (customer.cid) return String(customer.cid);
    if (customer.id) return String(customer.id);
    if (typeof customer.unwrap === 'function') {
      const unwrapped = customer.unwrap();
      if (unwrapped?.cid) return String(unwrapped.cid);
      if (unwrapped?.id) return String(unwrapped.id);
    }
    return String(customer);
  }

  private serializePayment(payment: PaymentEntry) {
    return {
      id: payment.pid,
      customerId: this.extractCustomerId(payment.customer),
      year: payment.year,
      month: payment.month,
      billAmount: Number(payment.billAmount),
      receivedAmount: Number(payment.receivedAmount),
      note: payment.note ?? '',
      receivedDate: payment.receivedDate
        ? (payment.receivedDate instanceof Date
            ? payment.receivedDate.toISOString()
            : String(payment.receivedDate))
        : null,
      createdAt: payment.createdAt
        ? (payment.createdAt instanceof Date
            ? payment.createdAt.toISOString()
            : String(payment.createdAt))
        : null,
      updatedAt: payment.updatedAt
        ? (payment.updatedAt instanceof Date
            ? payment.updatedAt.toISOString()
            : String(payment.updatedAt))
        : null,
    };
  }
}
