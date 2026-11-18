import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppData,
  AppUser,
  Company,
  CurrencySettings,
  ID,
  Invoice,
  InvoiceStatus,
  LedgerEntry,
  PaymentMethod,
  Settings,
  Voucher,
  Work,
} from './types';
import { DEFAULT_CURRENCY } from './currencies';
import { DEFAULT_LABELS, normalizeLabels } from './labels';
import { pad, round2 } from './format';

const KEY_V2 = 'hano_erp_lite_v2';
const KEY_V1 = 'biz_invoices_manager_v1';
const LEGACY_BUSINESS_NAME = 'مؤسسة الأفق للمقاولات';

export const APP_NAME = 'هانو للإعلان والتسويق';

export const DEFAULT_SETTINGS: Settings = {
  businessName: APP_NAME,
  ownerName: 'أبو عبدالله',
  phone: '0555123456',
  taxNumber: '3001234567890003',
  address: 'الرياض - حي النرجس',
  currency: DEFAULT_CURRENCY,
  monthlyLimit: 150000,
  defaultTaxRate: 15,
  paymentTermsDays: 14,
  apkUrl: '',
  labels: DEFAULT_LABELS,
  showResetDemoData: false,
};

function mergeCurrency(raw: any): CurrencySettings {
  const base = DEFAULT_CURRENCY;
  if (!raw || typeof raw !== 'object') return base;
  return {
    code: typeof raw.code === 'string' ? raw.code : base.code,
    symbol: typeof raw.symbol === 'string' ? raw.symbol : base.symbol,
    name: typeof raw.name === 'string' ? raw.name : base.name,
    decimals: typeof raw.decimals === 'number' ? Math.max(0, Math.min(4, raw.decimals)) : base.decimals,
    placement: raw.placement === 'before' ? 'before' : 'after',
    thousands: typeof raw.thousands === 'string' && raw.thousands.length ? raw.thousands : base.thousands,
    decimalSep: typeof raw.decimalSep === 'string' && raw.decimalSep.length ? raw.decimalSep : base.decimalSep,
    preset: typeof raw.preset === 'string' ? raw.preset : null,
  };
}

export function normalizeSettings(raw: any): Settings {
  const base = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== 'object') return base;
  const businessName = typeof raw.businessName === 'string' && raw.businessName.trim() ? raw.businessName : base.businessName;
  return {
    businessName: businessName === LEGACY_BUSINESS_NAME ? APP_NAME : businessName,
    ownerName: typeof raw.ownerName === 'string' ? raw.ownerName : base.ownerName,
    phone: typeof raw.phone === 'string' ? raw.phone : base.phone,
    taxNumber: typeof raw.taxNumber === 'string' ? raw.taxNumber : base.taxNumber,
    address: typeof raw.address === 'string' ? raw.address : base.address,
    currency: mergeCurrency(raw.currency),
    monthlyLimit: typeof raw.monthlyLimit === 'number' ? raw.monthlyLimit : base.monthlyLimit,
    defaultTaxRate: typeof raw.defaultTaxRate === 'number' ? raw.defaultTaxRate : base.defaultTaxRate,
    paymentTermsDays: typeof raw.paymentTermsDays === 'number' ? raw.paymentTermsDays : base.paymentTermsDays,
    apkUrl: typeof raw.apkUrl === 'string' ? raw.apkUrl : base.apkUrl,
    labels: normalizeLabels(raw.labels),
    showResetDemoData: typeof raw.showResetDemoData === 'boolean' ? raw.showResetDemoData : false,
  };
}

function methodOf(raw: any): PaymentMethod {
  return raw === 'bank' || raw === 'card' || raw === 'cheque' || raw === 'other' ? raw : 'cash';
}

function statusOf(raw: any): InvoiceStatus {
  return raw === 'draft' || raw === 'partial' || raw === 'paid' ? raw : 'issued';
}

/** ترحيل فاتورة من الإصدار الأول مع توليد سند قبض للفواتير المحصلة حتى لا تضيع أي عملية */
function migrateInvoice(
  raw: any,
  companies: Company[],
  vouchers: Voucher[],
  responsible: string,
  seq: { receipt: number }
): Invoice {
  const total = Number(raw?.total) || 0;
  const oldStatus = statusOf(raw?.status);
  const paidAmount = oldStatus === 'paid' ? total : Number(raw?.paidAmount) || 0;
  const remaining = round2(Math.max(0, total - paidAmount));
  const status: InvoiceStatus =
    oldStatus === 'draft' ? 'draft' : paidAmount <= 0 ? 'issued' : remaining <= 0 ? 'paid' : 'partial';
  const voucherIds: ID[] = [];

  if (status === 'paid' || status === 'partial') {
    const company = companies.find((c) => c.id === raw?.companyId);
    const date = typeof raw?.paidAt === 'string' && raw.paidAt ? raw.paidAt : raw?.issueDate || new Date().toISOString().slice(0, 10);
    seq.receipt += 1;
    const voucher: Voucher = {
      id: `v_mig_${raw?.id ?? seq.receipt}`,
      number: `RC-${(date || '').slice(0, 7).replace('-', '')}-${pad(seq.receipt)}`,
      type: 'receipt',
      date,
      partyName: company?.name ?? 'عميل',
      partyId: company?.id ?? null,
      amount: round2(paidAmount),
      method: methodOf(raw?.paymentMethod),
      reference: typeof raw?.number === 'string' ? raw.number : '',
      reason: `تحصيل فاتورة ${raw?.number ?? ''}`.trim(),
      invoiceId: raw?.id ?? null,
      notes: 'سند مُرحّل تلقائيًا من الإصدار السابق حفاظًا على حركة التحصيل',
      createdBy: responsible,
      migrated: true,
      createdAt: date,
    };
    vouchers.push(voucher);
    voucherIds.push(voucher.id);
  }

  return {
    id: String(raw?.id ?? `inv_${Math.random().toString(36).slice(2)}`),
    number: String(raw?.number ?? ''),
    companyId: String(raw?.companyId ?? ''),
    periodStart: String(raw?.periodStart ?? ''),
    periodEnd: String(raw?.periodEnd ?? ''),
    issueDate: String(raw?.issueDate ?? ''),
    dueDate: String(raw?.dueDate ?? ''),
    workIds: Array.isArray(raw?.workIds) ? raw.workIds.map(String) : [],
    subtotal: Number(raw?.subtotal) || 0,
    discount: Number(raw?.discount) || 0,
    taxRate: Number(raw?.taxRate) || 0,
    taxAmount: Number(raw?.taxAmount) || 0,
    total,
    status,
    notes: typeof raw?.notes === 'string' ? raw.notes : '',
    createdAt: String(raw?.createdAt ?? ''),
    paidAt: typeof raw?.paidAt === 'string' ? raw.paidAt : status === 'paid' ? raw?.issueDate ?? null : null,
    paidAmount: round2(paidAmount),
    remaining,
    paymentMethod: methodOf(raw?.paymentMethod),
    lastPaymentDate: status === 'paid' || status === 'partial' ? raw?.paidAt ?? raw?.issueDate ?? null : null,
    voucherIds,
  };
}

function normalizeInvoice(raw: any, companies: Company[], vouchers: Voucher[], responsible: string, seq: { receipt: number }): Invoice {
  if (raw && typeof raw.paidAmount === 'number' && Array.isArray(raw.voucherIds)) {
    const total = Number(raw.total) || 0;
    const paidAmount = round2(Math.min(Number(raw.paidAmount) || 0, total));
    return { ...(raw as Invoice), paidAmount, remaining: round2(Math.max(0, total - paidAmount)) };
  }
  return migrateInvoice(raw, companies, vouchers, responsible, seq);
}

function normalizeWork(raw: any): Work {
  return {
    id: String(raw?.id ?? `w_${Math.random().toString(36).slice(2)}`),
    companyId: String(raw?.companyId ?? ''),
    date: String(raw?.date ?? new Date().toISOString().slice(0, 10)),
    type: String(raw?.type ?? 'عمل'),
    quantity: Number(raw?.quantity) || 0,
    unit: String(raw?.unit ?? 'خدمة'),
    unitPrice: Number(raw?.unitPrice) || 0,
    notes: typeof raw?.notes === 'string' ? raw.notes : '',
    invoiceId: raw?.invoiceId ? String(raw.invoiceId) : null,
    createdAt: String(raw?.createdAt ?? raw?.date ?? new Date().toISOString().slice(0, 10)),
  };
}

function normalizeCompany(raw: any): Company {
  return {
    id: String(raw?.id ?? `c_${Math.random().toString(36).slice(2)}`),
    name: String(raw?.name ?? 'بدون اسم'),
    phone: String(raw?.phone ?? ''),
    address: String(raw?.address ?? ''),
    email: String(raw?.email ?? ''),
    taxNumber: String(raw?.taxNumber ?? ''),
    notes: String(raw?.notes ?? ''),
    createdAt: String(raw?.createdAt ?? new Date().toISOString().slice(0, 10)),
  };
}

function normalizeVoucher(raw: any): Voucher {
  return {
    id: String(raw?.id ?? `v_${Math.random().toString(36).slice(2)}`),
    number: String(raw?.number ?? ''),
    type: raw?.type === 'payment' ? 'payment' : 'receipt',
    date: String(raw?.date ?? new Date().toISOString().slice(0, 10)),
    partyName: String(raw?.partyName ?? ''),
    partyId: raw?.partyId ? String(raw.partyId) : null,
    amount: round2(Number(raw?.amount) || 0),
    method: methodOf(raw?.method),
    reference: String(raw?.reference ?? ''),
    reason: String(raw?.reason ?? ''),
    invoiceId: raw?.invoiceId ? String(raw.invoiceId) : null,
    notes: String(raw?.notes ?? ''),
    createdBy: String(raw?.createdBy ?? ''),
    migrated: !!raw?.migrated,
    createdAt: String(raw?.createdAt ?? raw?.date ?? new Date().toISOString().slice(0, 10)),
  };
}

function normalizeLedger(raw: any): LedgerEntry {
  return {
    id: String(raw?.id ?? `l_${Math.random().toString(36).slice(2)}`),
    date: String(raw?.date ?? new Date().toISOString().slice(0, 10)),
    kind: raw?.kind === 'expense' ? 'expense' : 'income',
    category: String(raw?.category ?? 'أخرى'),
    amount: round2(Number(raw?.amount) || 0),
    description: String(raw?.description ?? ''),
    method: methodOf(raw?.method),
    voucherId: raw?.voucherId ? String(raw.voucherId) : null,
    companyId: raw?.companyId ? String(raw.companyId) : null,
    createdBy: String(raw?.createdBy ?? ''),
    migrated: !!raw?.migrated,
    createdAt: String(raw?.createdAt ?? raw?.date ?? new Date().toISOString().slice(0, 10)),
  };
}

function normalizeUsers(raw: any): AppUser[] {
  if (!Array.isArray(raw) || !raw.length) return [];
  return raw
    .filter((u) => u && typeof u === 'object')
    .map((u, i) => ({
      id: String(u.id ?? `u_${i + 1}`),
      name: String(u.name ?? `مسؤول ${i + 1}`),
      role: u.role === 'accountant' || u.role === 'employee' ? u.role : 'manager',
    }));
}

/** توحيد/ترحيل أي بيانات مخزنة إلى هيكل الإصدار الثاني بدون فقدان أي عملية */
export function normalizeData(raw: any): AppData {
  const companies: Company[] = (Array.isArray(raw?.companies) ? raw.companies : []).map(normalizeCompany);
  const works: Work[] = (Array.isArray(raw?.works) ? raw.works : []).map(normalizeWork);
  const users = normalizeUsers(raw?.users);
  const settings = normalizeSettings(raw?.settings);
  const responsible = users[0]?.name ?? settings.ownerName ?? 'المدير';
  const vouchers: Voucher[] = (Array.isArray(raw?.vouchers) ? raw.vouchers : []).map(normalizeVoucher);
  const seq = { receipt: vouchers.filter((v) => v.type === 'receipt').length };
  const invoices: Invoice[] = (Array.isArray(raw?.invoices) ? raw.invoices : []).map((i: any) =>
    normalizeInvoice(i, companies, vouchers, responsible, seq)
  );
  const ledger: LedgerEntry[] = (Array.isArray(raw?.ledger) ? raw.ledger : []).map(normalizeLedger);
  const currentUserId =
    typeof raw?.currentUserId === 'string' && users.some((u) => u.id === raw.currentUserId)
      ? raw.currentUserId
      : users[0]?.id ?? '';

  return { companies, works, invoices, vouchers, ledger, settings, users, currentUserId };
}

async function readKey(key: string): Promise<any | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function loadData(): Promise<AppData | null> {
  const v2 = await readKey(KEY_V2);
  if (v2) return normalizeData(v2);
  // نقل آمن من الإصدار السابق: يُقرأ ثم يُرحّل ثم يُحفظ بالهيكل الجديد مع إبقاء النسخة القديمة كما هي
  const v1 = await readKey(KEY_V1);
  if (v1) {
    const migrated = normalizeData(v1);
    await saveData(migrated);
    return migrated;
  }
  return null;
}

export async function saveData(data: AppData): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_V2, JSON.stringify(data));
  } catch {
    /* ignore quota errors */
  }
}

export async function clearData(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_V2);
  } catch {
    /* ignore */
  }
}
