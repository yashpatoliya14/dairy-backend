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
import { calculateCustomerLedger, calculateEntryTotal, roundToCurrency } from './billing.utils.js';

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
      isActive: true,
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
    const cleanDateStr = (dto.entryDate || '').slice(0, 10);
    const entryDate = new Date(`${cleanDateStr}T00:00:00.000Z`);
    const liters = roundToCurrency(Number(dto.liters) || 0);
    const price = roundToCurrency(Number(dto.price) || 0);
    const total = calculateEntryTotal(liters, price);

    const em = this.entries.getEntityManager();
    const conn = typeof em.getConnection === 'function' ? em.getConnection() : null;
    let existing: MilkEntry | null = null;
    if (conn) {
      const existingRaw = await conn.execute<Array<{ eid: string }>>(
        'SELECT eid FROM milk_entries WHERE cid = ? AND (entry_date = ? OR DATE(entry_date) = DATE(?)) LIMIT 1',
        [customer.cid, cleanDateStr, cleanDateStr],
      );
      if (existingRaw.length > 0) {
        existing = await this.entries.findOne({ eid: existingRaw[0].eid });
      }
    } else {
      existing = await this.entries.findOne({ customer, entryDate });
    }

    if (existing) {
      if (dto.mode === 'replace') {
        existing.liters = liters;
        existing.price = price;
        existing.total = total;
      } else {
        // Default mode 'add': sum newly delivered milk with existing entry for today (e.g. 5 + 3 = 8)
        const combinedLiters = roundToCurrency(Number(existing.liters) + liters);
        existing.liters = combinedLiters;
        existing.price = price;
        existing.total = calculateEntryTotal(combinedLiters, price);
      }
      await em.flush();
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
    em.persist(entry);
    await em.flush();
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
    const totalLiters = roundToCurrency(
      entries.reduce((sum, e) => sum + Number(e.liters || 0), 0),
    );
    const totalAmount = roundToCurrency(
      entries.reduce(
        (sum, e) =>
          sum +
          (e.total != null
            ? Number(e.total)
            : calculateEntryTotal(Number(e.liters || 0), Number(e.price || 0))),
        0,
      ),
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

    const em = this.customers.getEntityManager();
    const conn = typeof em.getConnection === 'function' ? em.getConnection() : null;
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
    }).format(new Date());

    let todayEntries: Array<{
      cid: string;
      liters: number | string;
      price: number | string;
      total: number | string;
    }> = [];
    if (conn) {
      try {
        todayEntries = await conn.execute(
          'SELECT cid, liters, price, total FROM milk_entries WHERE did = ? AND (entry_date = ? OR DATE(entry_date) = DATE(?))',
          [distributor.did, todayStr, todayStr],
        );
      } catch {
        todayEntries = [];
      }
    }

    const todayMap = new Map(todayEntries.map((e) => [e.cid, e]));

    return customers.map((customer) => {
      const today = todayMap.get(customer.cid);
      const todayLiters = today != null ? Number(today.liters) : null;
      const todayPrice = today != null ? Number(today.price) : null;
      const todayTotal = today != null ? Number(today.total) : null;
      return {
        id: customer.cid,
        name: customer.name,
        uniqueNumber: customer.uniqueNumber,
        defaultLiters: Number(customer.liters),
        defaultPrice: Number(customer.price),
        hasTodayEntry: Boolean(today),
        todayLiters,
        todayPrice,
        todayTotal,
        liters: todayLiters != null ? todayLiters : Number(customer.liters),
        price: todayPrice != null ? todayPrice : Number(customer.price),
        phoneNumber: customer.phoneNumber,
        notificationChannel: customer.notificationChannel,
      };
    });
  }

  async delete(userId: string, customerId: string) {
    const customer = await this.customerFor(userId, customerId);
    const em = this.customers.getEntityManager();
    const conn = em.getConnection();

    // 1. Direct atomic deletion of all child records to guarantee cascade without FK violations
    await conn.execute('DELETE FROM daily_message_logs WHERE cid = ?', [customer.cid]).catch(() => {});
    await conn.execute('DELETE FROM payment_entries WHERE cid = ?', [customer.cid]).catch(() => {});
    await conn.execute('DELETE FROM milk_entries WHERE cid = ?', [customer.cid]).catch(() => {});
    await conn.execute('DELETE FROM customers WHERE cid = ?', [customer.cid]);

    // Clear unit of work identity map
    em.clear();

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

    const daysInTargetMonth = new Date(year, month, 0).getDate();
    const targetMonthEnd = new Date(Date.UTC(year, month - 1, daysInTargetMonth, 23, 59, 59, 999));

    // Load all historical entries and payments up to the target month for exact chronological ledger calculation
    const [allEntries, allPayments] = await Promise.all([
      this.entries.find(
        {
          distributor,
          entryDate: { $lte: targetMonthEnd },
        },
        { populate: ['customer'] },
      ),
      this.payments
        .find(
          {
            distributor,
            $or: [
              { year: { $lt: year } },
              { year, month: { $lte: month } },
            ],
          },
          { populate: ['customer'] },
        )
        .catch(() => []),
    ]);

    const entriesMap = new Map<string, Array<{ entryDate: Date | string; liters: number; price: number; total?: number }>>();
    for (const e of allEntries) {
      const cid = this.extractCustomerId(e.customer);
      if (!entriesMap.has(cid)) entriesMap.set(cid, []);
      entriesMap.get(cid)!.push({
        entryDate: e.entryDate,
        liters: Number(e.liters ?? 0),
        price: Number(e.price ?? 0),
        total: e.total != null ? Number(e.total) : undefined,
      });
    }

    const paymentsMap = new Map<string, Array<{ year: number; month: number; receivedAmount: number; note?: string; receivedDate?: Date | string | null }>>();
    for (const p of allPayments) {
      const cid = this.extractCustomerId(p.customer);
      if (!paymentsMap.has(cid)) paymentsMap.set(cid, []);
      paymentsMap.get(cid)!.push({
        year: p.year,
        month: p.month,
        receivedAmount: Number(p.receivedAmount ?? 0),
        note: p.note ?? '',
        receivedDate: p.receivedDate,
      });
    }

    const items = customers.map((c) => {
      const defaultPrice = Number(c.price ?? 0);
      const cEntries = entriesMap.get(c.cid) ?? [];
      const cPayments = paymentsMap.get(c.cid) ?? [];

      const ledger = calculateCustomerLedger({
        entries: cEntries,
        payments: cPayments,
        targetYear: year,
        targetMonth: month,
        defaultPrice,
      });

      return {
        customerId: c.cid,
        name: c.name,
        phone: c.phoneNumber ?? '',
        number: String(c.uniqueNumber ?? '0'),
        defaultPrice,
        defaultLiters: Number(c.liters ?? 1.0),
        thisMonthLiters: ledger.totalQuantity,
        thisMonthBill: ledger.thisMonthBill,
        thisMonthPaid: ledger.thisMonthPaid,
        thisMonthDue: ledger.thisMonthDue,
        activeDays: ledger.activeDays,
        daysInMonth: daysInTargetMonth,
        grossPastDue: ledger.grossPastDue,
        grossPastAdvance: ledger.grossPastAdvance,
        pastMonthsDue: ledger.pastMonthsDue,
        pastMonthsAdvance: ledger.pastMonthsAdvance,
        pastMonthsBreakdown: ledger.pastMonthsBreakdown,
        netBalanceDue: ledger.netBalanceDue,
        netAdvance: ledger.netAdvance,
        paymentNote: ledger.paymentNote,
        paymentDate: ledger.paymentDate,
        hasPayment: ledger.hasPayment,
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

  async getCustomerBillSummary(
    userId: string,
    customerId: string,
    year: number,
    month: number,
  ) {
    const bills = await this.getMonthlyBillsSummary(userId, year, month);
    const item = bills.find((b) => b.customerId === customerId);
    if (!item) {
      throw new NotFoundException('Customer bill summary not found');
    }
    return item;
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
