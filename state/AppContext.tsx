import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertItem,
  AppData,
  AppUser,
  Company,
  CurrencySettings,
  ID,
  Invoice,
  InvoiceStatus,
  LedgerEntry,
  PaymentMethod,
  Role,
  Settings,
  Voucher,
  Work,
} from '../lib/types';
import { DEFAULT_SETTINGS, clearData, loadData, saveData } from '../lib/storage';
import { buildSeedData, nextInvoiceNumber } from '../lib/seed';
import {
  addDays,
  addMonthsToKey,
  currentMonthKey,
  daysBetween,
  deriveInvoiceStatus,
  formatMoney,
  invoiceRemaining,
  isOutstanding,
  lastMonthKeys,
  monthKeyOf,
  monthLabel,
  nextVoucherNumber,
  round2,
  todayISO,
  uid,
} from '../lib/format';

interface ToastState {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
}

interface AppContextValue {
  ready: boolean;
  companies: Company[];
  works: Work[];
  invoices: Invoice[];
  vouchers: Voucher[];
  ledger: LedgerEntry[];
  settings: Settings;
  users: AppUser[];
  currentUser: AppUser;
  role: Role;
  currency: CurrencySettings;
  alerts: AlertItem[];
  toast: ToastState | null;
  showToast: (message: string, tone?: ToastState['tone']) => void;
  setCurrentUserId: (id: ID) => void;
  // companies
  saveCompany: (input: Partial<Company> & { name: string; phone: string }, existingId?: ID) => Company;
  deleteCompany: (id: ID) => void;
  // works
  saveWork: (input: Omit<Work, 'id' | 'createdAt' | 'invoiceId'>, existingId?: ID) => Work;
  deleteWork: (id: ID) => void;
  unlinkWork: (id: ID) => void;
  // invoices
  createInvoice: (input: {
    companyId: ID;
    periodStart: string;
    periodEnd: string;
    workIds: ID[];
    discount: number;
    taxRate: number;
    notes: string;
    status: InvoiceStatus;
    issueDate?: string;
    dueDate?: string;
  }) => Invoice | null;
  setInvoiceStatus: (id: ID, status: InvoiceStatus) => void;
  updateInvoiceNotes: (id: ID, notes: string) => void;
  deleteInvoice: (id: ID) => void;
  /** تحصيل مبلغ من العميل مع إصدار سند قبض تلقائيًا */
  recordInvoicePayment: (input: {
    invoiceId: ID;
    amount: number;
    method: PaymentMethod;
    date: string;
    reference?: string;
    notes?: string;
  }) => Voucher | null;
  // الصندوق والسندات المالية
  addVoucher: (input: Omit<Voucher, 'id' | 'number' | 'createdAt' | 'createdBy'> & { number?: string }) => Voucher;
  deleteVoucher: (id: ID) => void;
  updateVoucher: (id: ID, patch: any) => void;
  importBackupData: (content: string, fileName?: string) => { imported: number; type: string };
  addLedgerEntry: (
    input: Omit<LedgerEntry, 'id' | 'createdAt' | 'createdBy'>
  ) => LedgerEntry;
  deleteLedgerEntry: (id: ID) => void;
  vouchersOfInvoice: (invoiceId: ID) => Voucher[];
  // settings
  updateSettings: (patch: Partial<Settings>) => void;
  updateCurrency: (currency: CurrencySettings) => void;
  // المسؤولون
  addUser: (name: string, role: Role) => AppUser;
  updateUser: (id: ID, patch: { name?: string; role?: Role }) => boolean;
  deleteUser: (id: ID) => boolean;
  resetDemoData: () => void;
  clearAllData: () => void;
  // helpers
  companyById: (id: ID) => Company | undefined;
  worksOfCompany: (id: ID) => Work[];
  invoicesOfCompany: (id: ID) => Invoice[];
  unbilledWorks: (companyId?: ID, periodKey?: string) => Work[];
  invoiceItems: (invoice: Invoice) => Work[];
  workTotal: (w: Work) => number;
}

const AppContext = createContext<AppContextValue | null>(null);

const FALLBACK_USER: AppUser = { id: 'u_manager', name: 'المدير', role: 'manager' };

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<AppData>(() => ({
    companies: [],
    works: [],
    invoices: [],
    vouchers: [],
    ledger: [],
    settings: DEFAULT_SETTINGS,
    users: [],
    currentUserId: '',
  }));
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedOnce = useRef(false);
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = await loadData();
      if (!alive) return;
      if (stored && stored.companies.length >= 0 && stored.users.length) {
        setData(stored);
      } else {
        const seeded = buildSeedData();
        setData(seeded);
        await saveData(seeded);
      }
      loadedOnce.current = true;
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loadedOnce.current) return;
    saveData(data);
  }, [data]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = useCallback((message: string, tone: ToastState['tone'] = 'success') => {
    const id = Date.now();
    setToast({ id, message, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast((t) => (t && t.id === id ? null : t));
    }, 2600);
  }, []);

  const currentUser = useMemo(
    () => data.users.find((u) => u.id === data.currentUserId) ?? data.users[0] ?? FALLBACK_USER,
    [data.users, data.currentUserId]
  );

  const currency = data.settings.currency ?? DEFAULT_SETTINGS.currency;

  const companyById = useCallback(
    (id: ID) => data.companies.find((c) => c.id === id),
    [data.companies]
  );

  const worksOfCompany = useCallback(
    (id: ID) => data.works.filter((w) => w.companyId === id).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data.works]
  );

  const invoicesOfCompany = useCallback(
    (id: ID) => data.invoices.filter((i) => i.companyId === id).sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1)),
    [data.invoices]
  );

  const unbilledWorks = useCallback(
    (companyId?: ID, periodKey?: string) =>
      data.works
        .filter((w) => !w.invoiceId)
        .filter((w) => (companyId ? w.companyId === companyId : true))
        .filter((w) => (periodKey ? monthKeyOf(w.date) === periodKey : true))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data.works]
  );

  const invoiceItems = useCallback(
    (invoice: Invoice) =>
      invoice.workIds
        .map((id) => data.works.find((w) => w.id === id))
        .filter(Boolean)
        .sort((a, b) => ((a as Work).date < (b as Work).date ? -1 : 1)) as Work[],
    [data.works]
  );

  const workTotal = useCallback((w: Work) => (Number(w.quantity) || 0) * (Number(w.unitPrice) || 0), []);

  const setCurrentUserId = useCallback((id: ID) => {
    setData((d) => ({ ...d, currentUserId: id }));
  }, []);

  const saveCompany = useCallback(
    (input: Partial<Company> & { name: string; phone: string }, existingId?: ID): Company => {
      const now = todayISO();
      if (existingId) {
        const existing = dataRef.current.companies.find((c) => c.id === existingId);
        const updated: Company = existing
          ? { ...existing, ...input, id: existing.id, createdAt: existing.createdAt }
          : {
              id: existingId,
              name: input.name,
              phone: input.phone ?? '',
              address: input.address ?? '',
              email: input.email ?? '',
              taxNumber: input.taxNumber ?? '',
              notes: input.notes ?? '',
              createdAt: now,
            };
        setData((d) => ({ ...d, companies: d.companies.map((c) => (c.id === existingId ? updated : c)) }));
        return updated;
      }
      const company: Company = {
        id: uid('c'),
        name: input.name,
        phone: input.phone ?? '',
        address: input.address ?? '',
        email: input.email ?? '',
        taxNumber: input.taxNumber ?? '',
        notes: input.notes ?? '',
        createdAt: now,
      };
      setData((d) => ({ ...d, companies: [company, ...d.companies] }));
      return company;
    },
    []
  );

  const deleteCompany = useCallback((id: ID) => {
    setData((d) => ({
      ...d,
      companies: d.companies.filter((c) => c.id !== id),
      works: d.works.filter((w) => w.companyId !== id),
      invoices: d.invoices.filter((i) => i.companyId !== id),
      vouchers: d.vouchers.map((v) => (v.partyId === id ? { ...v, partyId: null } : v)),
      ledger: d.ledger.map((l) => (l.companyId === id ? { ...l, companyId: null } : l)),
    }));
  }, []);

  const saveWork = useCallback(
    (input: Omit<Work, 'id' | 'createdAt' | 'invoiceId'>, existingId?: ID): Work => {
      const now = todayISO();
      if (existingId) {
        const existing = dataRef.current.works.find((w) => w.id === existingId);
        const updated: Work = existing
          ? { ...existing, ...input, id: existing.id, createdAt: existing.createdAt, invoiceId: existing.invoiceId }
          : { ...input, id: existingId, createdAt: now, invoiceId: null };
        setData((d) => ({ ...d, works: d.works.map((w) => (w.id === existingId ? updated : w)) }));
        return updated;
      }
      const work: Work = { ...input, id: uid('w'), createdAt: now, invoiceId: null };
      setData((d) => ({ ...d, works: [work, ...d.works] }));
      return work;
    },
    []
  );

  const deleteWork = useCallback((id: ID) => {
    setData((d) => ({
      ...d,
      works: d.works.filter((w) => w.id !== id),
      invoices: d.invoices.map((inv) =>
        inv.workIds.includes(id) ? { ...inv, workIds: inv.workIds.filter((x) => x !== id) } : inv
      ),
    }));
  }, []);

  const unlinkWork = useCallback((id: ID) => {
    setData((d) => {
      const work = d.works.find((w) => w.id === id);
      if (!work || !work.invoiceId) return d;
      const invoiceId = work.invoiceId;
      const invoice = d.invoices.find((i) => i.id === invoiceId);
      const remainingIds = invoice ? invoice.workIds.filter((x) => x !== id) : [];
      const remainingWorks = remainingIds
        .map((wid) => d.works.find((w) => w.id === wid))
        .filter(Boolean) as Work[];
      const subtotal = remainingWorks.reduce((s, w) => s + w.quantity * w.unitPrice, 0);
      return {
        ...d,
        works: d.works.map((w) => (w.id === id ? { ...w, invoiceId: null } : w)),
        invoices: invoice
          ? d.invoices.map((i) => {
              if (i.id !== invoiceId) return i;
              const discount = Math.min(i.discount, subtotal);
              const taxAmount = Math.round((subtotal - discount) * (i.taxRate / 100) * 100) / 100;
              return {
                ...i,
                workIds: remainingIds,
                subtotal,
                discount,
                taxAmount,
                total: Math.round((subtotal - discount + taxAmount) * 100) / 100,
              };
            })
          : d.invoices,
      };
    });
  }, []);

  const createInvoice = useCallback<AppContextValue['createInvoice']>((input) => {
    if (!input.workIds.length) return null;
    const d = dataRef.current;
    const items = input.workIds.map((id) => d.works.find((w) => w.id === id)).filter(Boolean) as Work[];
    if (!items.length) return null;
    const subtotal = items.reduce((s, w) => s + (Number(w.quantity) || 0) * (Number(w.unitPrice) || 0), 0);
    const discount = Math.max(0, Math.min(input.discount || 0, subtotal));
    const taxRate = Math.max(0, Number(input.taxRate) || 0);
    const taxAmount = Math.round((subtotal - discount) * (taxRate / 100) * 100) / 100;
    const total = Math.round((subtotal - discount + taxAmount) * 100) / 100;
    const issueDate = input.issueDate ?? todayISO();
    const dueDate = input.dueDate ?? addDays(issueDate, d.settings.paymentTermsDays || 14);
    const invoice: Invoice = {
      id: uid('inv'),
      number: nextInvoiceNumber(d.invoices),
      companyId: input.companyId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      issueDate,
      dueDate,
      workIds: input.workIds,
      subtotal,
      discount,
      taxRate,
      taxAmount,
      total,
      status: input.status,
      notes: input.notes,
      createdAt: todayISO(),
      paidAt: input.status === 'paid' ? todayISO() : null,
      paidAmount: input.status === 'paid' ? total : 0,
      remaining: input.status === 'paid' ? 0 : total,
      paymentMethod: 'cash',
      lastPaymentDate: input.status === 'paid' ? todayISO() : null,
      voucherIds: [],
    };
    setData((prev) => ({
      ...prev,
      invoices: [invoice, ...prev.invoices],
      works: prev.works.map((w) => (input.workIds.includes(w.id) ? { ...w, invoiceId: invoice.id } : w)),
    }));
    dataRef.current = {
      ...dataRef.current,
      invoices: [invoice, ...dataRef.current.invoices],
      works: dataRef.current.works.map((w) => (input.workIds.includes(w.id) ? { ...w, invoiceId: invoice.id } : w)),
    };
    return invoice;
  }, []);

  const setInvoiceStatus = useCallback((id: ID, status: InvoiceStatus) => {
    setData((d) => ({
      ...d,
      invoices: d.invoices.map((i) => {
        if (i.id !== id) return i;
        if (status === 'paid') {
          return {
            ...i,
            status: 'paid',
            paidAmount: round2(i.total),
            remaining: 0,
            paidAt: i.paidAt ?? todayISO(),
            lastPaymentDate: i.lastPaymentDate ?? todayISO(),
          };
        }
        if (status === 'draft') {
          return { ...i, status: 'draft' };
        }
        // إعادة الفاتورة إلى «مستحقة» تعيد ضبط المحصل
        return { ...i, status: 'issued', paidAmount: 0, remaining: round2(i.total), paidAt: null };
      }),
    }));
  }, []);

  const updateInvoiceNotes = useCallback((id: ID, notes: string) => {
    setData((d) => ({
      ...d,
      invoices: d.invoices.map((i) => (i.id === id ? { ...i, notes } : i)),
    }));
  }, []);

  const deleteInvoice = useCallback((id: ID) => {
    setData((d) => ({
      ...d,
      invoices: d.invoices.filter((i) => i.id !== id),
      works: d.works.map((w) => (w.invoiceId === id ? { ...w, invoiceId: null } : w)),
      vouchers: d.vouchers.map((v) => (v.invoiceId === id ? { ...v, invoiceId: null } : v)),
    }));
  }, []);

  const vouchersOfInvoice = useCallback(
    (invoiceId: ID) => data.vouchers.filter((v) => v.invoiceId === invoiceId).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data.vouchers]
  );

  const addVoucher = useCallback<AppContextValue['addVoucher']>((input) => {
    const d = dataRef.current;
    const date = input.date || todayISO();
    const voucher: Voucher = {
      ...input,
      id: uid('v'),
      number: input.number?.trim() || nextVoucherNumber(input.type, d.vouchers, date),
      amount: round2(input.amount),
      createdBy: (d.users.find((u) => u.id === d.currentUserId) ?? d.users[0])?.name ?? 'المدير',
      createdAt: todayISO(),
    };
    setData((prev) => {
      const nextVouchers = [voucher, ...prev.vouchers];
      const nextInvoices = voucher.invoiceId
        ? prev.invoices.map((inv) => {
            if (inv.id !== voucher.invoiceId) return inv;
            const sumPaid = round2(
              nextVouchers
                .filter((x) => x.invoiceId === inv.id && x.type === 'receipt')
                .reduce((s, x) => s + (Number(x.amount) || 0), 0)
            );
            const rem = round2(Math.max(0, (Number(inv.total) || 0) - sumPaid));
            const nextStatus = rem <= 0 ? 'paid' : sumPaid > 0 ? 'partial' : inv.status;
            return { ...inv, paidAmount: sumPaid, remaining: rem, status: nextStatus };
          })
        : prev.invoices;
      return { ...prev, vouchers: nextVouchers, invoices: nextInvoices };
    });
    dataRef.current = { ...dataRef.current, vouchers: [voucher, ...dataRef.current.vouchers] };
    return voucher;
  }, []);

  const deleteVoucher = useCallback((id: ID) => {
    setData((d) => {
      const voucher = d.vouchers.find((v) => v.id === id);
      const invoices = voucher?.invoiceId
        ? d.invoices.map((inv) => {
            if (inv.id !== voucher.invoiceId) return inv;
            const paidAmount = round2(Math.max(0, (inv.paidAmount || 0) - (voucher.amount || 0)));
            const next = { ...inv, paidAmount, remaining: round2(Math.max(0, inv.total - paidAmount)), voucherIds: inv.voucherIds.filter((x) => x !== id) };
            return { ...next, status: deriveInvoiceStatus(next) };
          })
        : d.invoices;
      return {
        ...d,
        vouchers: d.vouchers.filter((v) => v.id !== id),
        ledger: d.ledger.map((l) => (l.voucherId === id ? { ...l, voucherId: null } : l)),
        invoices,
      };
    });
  }, []);
  const updateVoucher = useCallback((id: ID, patch: any) => {
    setData((d) => {
      const oldV = d.vouchers.find((v) => v.id === id);
      if (!oldV) return d;
      const amt = patch.amount !== undefined ? round2(Math.max(0, Number(patch.amount) || 0)) : oldV.amount;
      const diff = round2(amt - (oldV.amount || 0));
      const upd: any = { ...oldV, ...patch, amount: amt };
      const invoices = oldV.invoiceId ? d.invoices.map((inv) => {
        if (inv.id !== oldV.invoiceId) return inv;
        const paidAmount = round2(Math.max(0, (inv.paidAmount || 0) + diff));
        const next = { ...inv, paidAmount, remaining: round2(Math.max(0, inv.total - paidAmount)) };
        return { ...next, status: deriveInvoiceStatus(next) };
      }) : d.invoices;
      const ledger = d.ledger.map((l) => l.voucherId === id ? { ...l, amount: amt, date: upd.date, description: patch.note ?? (l as any).description } : l);
      return { ...d, vouchers: d.vouchers.map((v) => (v.id === id ? upd : v)), invoices, ledger };
    });
  }, []);
  const importBackupData = useCallback((content: string, fileName = "") => {
    const txt = content.replace(/^\uFEFF/, "").trim();
    if (!txt) return { imported: 0, type: "empty" };
    let count = 0;
    if (txt.startsWith("{") || txt.startsWith("[")) {
      const p = JSON.parse(txt); const src = p.data || p;
      setData((d) => {
        const m = (a: any[], b?: any[]) => { if (!Array.isArray(b)) return a; const mp = new Map(a.map((x) => [x.id, x])); b.forEach((x) => { if (x?.id) { mp.set(x.id, x); count++; } }); return Array.from(mp.values()); };
        return { ...d, companies: m(d.companies, src.companies), works: m(d.works, src.works), invoices: m(d.invoices, src.invoices), vouchers: m(d.vouchers, src.vouchers), ledger: m(d.ledger, src.ledger) };
      });
      return { imported: count, type: "JSON" };
    }
    const lines = txt.split(/\r?\n/).filter(Boolean);
    const parse = (l: string) => { const r: string[] = []; let cur = "", q = false; for (const ch of l) { if (ch === String.fromCharCode(34)) q = !q; else if (ch === "," && !q) { r.push(cur.trim()); cur = ""; } else cur += ch; } r.push(cur.trim()); return r; };
    const hi = lines.findIndex((l) => /الرقم|الاسم|المبلغ|رقم/.test(l));
    if (hi < 0 || hi >= lines.length - 1) return { imported: 0, type: "CSV" };
    const hdr = parse(lines[hi]);
    const col = (...ns: string[]) => hdr.findIndex((h) => ns.some((n) => h.includes(n)));
    const now = new Date().toISOString().slice(0, 10);
    setData((d) => {
      const next = { ...d, companies: [...d.companies], invoices: [...d.invoices], vouchers: [...d.vouchers], ledger: [...d.ledger] };
      const cName = col("الاسم", "الشركة", "العميل"), cAmt = col("المبلغ", "الإجمالي", "القيمة"), cDate = col("التاريخ"), cNum = col("الرقم", "رقم"), cNote = col("البيان", "ملاحظات", "الوصف", "العنوان");
      const low = fileName.toLowerCase();
      lines.slice(hi + 1).map(parse).filter((r) => r.some(Boolean)).forEach((r, i) => {
        const id = "imp_" + Date.now() + "_" + i, val = parseFloat((r[cAmt] || "0").replace(/[^0-9.-]/g, "")) || 0;
        const date = (cDate >= 0 && r[cDate]) ? r[cDate] : now, title = (cNote >= 0 && r[cNote]) ? r[cNote] : (cName >= 0 ? r[cName] : "مستورد");
        if (low.includes("voucher") || low.includes("سند") || hdr.some((h) => h.includes("نوع السند"))) {
          next.vouchers.push({ id, number: (cNum >= 0 && r[cNum]) || ("V-" + (i + 1)), type: r.join(" ").includes("صرف") ? "payment" : "receipt", amount: val, date, method: "cash", companyId: "", invoiceId: null, note: title, createdBy: d.currentUserId || "admin" } as any); count++;
        } else if (low.includes("invoice") || low.includes("فاتور")) {
          next.invoices.push({ id, number: (cNum >= 0 && r[cNum]) || ("INV-" + (i + 1)), companyId: "", date, dueDate: date, items: [], subtotal: val, tax: 0, total: val, paidAmount: 0, remaining: val, status: "unpaid", notes: title, voucherIds: [], createdBy: d.currentUserId || "admin" } as any); count++;
        } else if ((low.includes("compan") || low.includes("عملا") || low.includes("شرك")) && cName >= 0 && r[cName]) {
          next.companies.push({ id, name: r[cName], phone: r[col("الهاتف", "جوال")] || "", email: "", address: "", notes: "", createdAt: date } as any); count++;
        } else if (val > 0) {
          next.ledger.push({ id, type: r.join(" ").includes("مصروف") ? "expense" : "income", category: "مستورد", amount: val, date, description: title, voucherId: null, createdBy: d.currentUserId || "admin" } as any); count++;
        }
      });
      return next;
    });
    return { imported: count, type: "CSV" };
  }, []);

  const addLedgerEntry = useCallback<AppContextValue['addLedgerEntry']>((input) => {
    const d = dataRef.current;
    const entry: LedgerEntry = {
      ...input,
      id: uid('l'),
      amount: round2(input.amount),
      date: input.date || todayISO(),
      createdBy: (d.users.find((u) => u.id === d.currentUserId) ?? d.users[0])?.name ?? 'المدير',
      createdAt: todayISO(),
    };
    setData((prev) => ({ ...prev, ledger: [entry, ...prev.ledger] }));
    dataRef.current = { ...dataRef.current, ledger: [entry, ...dataRef.current.ledger] };
    return entry;
  }, []);

  const deleteLedgerEntry = useCallback((id: ID) => {
    setData((d) => ({ ...d, ledger: d.ledger.filter((l) => l.id !== id) }));
  }, []);

  /** تحصيل مبلغ من العميل: يصدر سند قبض ويحدث حالة الفاتورة (جزئي / مدفوع) */
  const recordInvoicePayment = useCallback<AppContextValue['recordInvoicePayment']>((input) => {
    const d = dataRef.current;
    const invoice = d.invoices.find((i) => i.id === input.invoiceId);
    if (!invoice) return null;
    const company = d.companies.find((c) => c.id === invoice.companyId);
    const amount = round2(Math.min(Math.max(0, input.amount), invoiceRemaining(invoice)));
    if (amount <= 0) return null;
    const date = input.date || todayISO();
    const voucher: Voucher = {
      id: uid('v'),
      number: nextVoucherNumber('receipt', d.vouchers, date),
      type: 'receipt',
      date,
      partyName: company?.name ?? 'عميل',
      partyId: company?.id ?? null,
      amount,
      method: input.method,
      reference: input.reference?.trim() || invoice.number,
      reason: `تحصيل فاتورة ${invoice.number}`,
      invoiceId: invoice.id,
      notes: input.notes?.trim() ?? '',
      createdBy: (d.users.find((u) => u.id === d.currentUserId) ?? d.users[0])?.name ?? 'المدير',
      createdAt: todayISO(),
    };
    const paidAmount = round2((invoice.paidAmount || 0) + amount);
    const remaining = round2(Math.max(0, invoice.total - paidAmount));
    const nextInvoice: Invoice = {
      ...invoice,
      paidAmount,
      remaining,
      paymentMethod: input.method,
      lastPaymentDate: date,
      paidAt: remaining <= 0 ? date : invoice.paidAt,
      status: remaining <= 0 ? 'paid' : 'partial',
      voucherIds: [...invoice.voucherIds, voucher.id],
    };
    setData((prev) => ({
      ...prev,
      vouchers: [voucher, ...prev.vouchers],
      invoices: prev.invoices.map((i) => (i.id === invoice.id ? nextInvoice : i)),
    }));
    dataRef.current = {
      ...dataRef.current,
      vouchers: [voucher, ...dataRef.current.vouchers],
      invoices: dataRef.current.invoices.map((i) => (i.id === invoice.id ? nextInvoice : i)),
    };
    return voucher;
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  }, []);

  const updateCurrency = useCallback((next: CurrencySettings) => {
    setData((d) => ({ ...d, settings: { ...d.settings, currency: next } }));
  }, []);

  const addUser = useCallback((name: string, role: Role): AppUser => {
    const user: AppUser = { id: uid('u'), name: name.trim(), role };
    setData((d) => ({ ...d, users: [...d.users, user] }));
    dataRef.current = { ...dataRef.current, users: [...dataRef.current.users, user] };
    return user;
  }, []);

  const updateUser = useCallback((id: ID, patch: { name?: string; role?: Role }): boolean => {
    const users = dataRef.current.users;
    const target = users.find((u) => u.id === id);
    if (!target) return false;
    const managers = users.filter((u) => u.role === 'manager').length;
    // حماية دور المدير: لا يمكن تجريد آخر مدير من صلاحياته الكاملة
    if (target.role === 'manager' && managers <= 1 && patch.role && patch.role !== 'manager') return false;
    const nextUsers = users.map((u) =>
      u.id === id
        ? {
            ...u,
            name: patch.name !== undefined && patch.name.trim() ? patch.name.trim() : u.name,
            role: patch.role ?? u.role,
          }
        : u
    );
    setData((d) => ({ ...d, users: nextUsers }));
    dataRef.current = { ...dataRef.current, users: nextUsers };
    return true;
  }, []);

  const deleteUser = useCallback((id: ID): boolean => {
    const current = dataRef.current.users;
    if (current.length <= 1) return false;
    const target = current.find((u) => u.id === id);
    const managers = current.filter((u) => u.role === 'manager').length;
    // لا يمكن حذف المدير الوحيد حتى تبقى إدارة التطبيق متاحة بالكامل
    if (target?.role === 'manager' && managers <= 1) return false;
    const remaining = current.filter((u) => u.id !== id);
    const nextId = dataRef.current.currentUserId === id ? remaining[0].id : dataRef.current.currentUserId;
    setData((d) => ({ ...d, users: remaining, currentUserId: d.currentUserId === id ? nextId : d.currentUserId }));
    dataRef.current = { ...dataRef.current, users: remaining, currentUserId: nextId };
    return true;
  }, []);

  const clearAllData = useCallback(() => {
    clearData();
    setData((d) => ({
      companies: [],
      works: [],
      invoices: [],
      vouchers: [],
      ledger: [],
      settings: d.settings,
      users: d.users.length ? d.users : buildSeedData().users,
      currentUserId: d.currentUserId,
    }));
  }, []);

  /** استعادة البيانات الافتراضية - لا تظهر إلا إذا فعّلها المدير من الإعدادات */
  const resetDemoData = useCallback(() => {
    const seeded = buildSeedData();
    setData((d) => ({
      ...seeded,
      settings: d.settings,
      users: d.users.length ? d.users : seeded.users,
      currentUserId: d.currentUserId || seeded.currentUserId,
    }));
  }, []);

  const alerts = useMemo<AlertItem[]>(() => {
    const today = todayISO();
    const list: AlertItem[] = [];
    const monthKey = currentMonthKey();

    data.invoices
      .filter((i) => isOutstanding(i) && i.dueDate < today)
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
      .forEach((i) => {
        const company = data.companies.find((c) => c.id === i.companyId);
        const remaining = invoiceRemaining(i);
        list.push({
          id: `overdue_${i.id}`,
          kind: 'overdue',
          severity: 'danger',
          title: `فاتورة متأخرة ${i.number}`,
          body: `${company?.name ?? 'عميل'} • متأخرة ${Math.abs(daysBetween(i.dueDate, today))} يوم • المتبقي ${formatMoney(
            remaining,
            currency
          )}`,
          invoiceId: i.id,
          companyId: i.companyId,
          amount: remaining,
        });
      });

    data.invoices
      .filter((i) => isOutstanding(i) && i.dueDate >= today)
      .forEach((i) => {
        const company = data.companies.find((c) => c.id === i.companyId);
        const remaining = invoiceRemaining(i);
        list.push({
          id: `unpaid_${i.id}`,
          kind: 'unpaid',
          severity: i.status === 'partial' ? 'warning' : 'warning',
          title: `${i.status === 'partial' ? 'فاتورة مدفوعة جزئيًا' : 'فاتورة بانتظار التحصيل'} ${i.number}`,
          body: `${company?.name ?? 'عميل'} • الاستحقاق ${i.dueDate} • المتبقي ${formatMoney(remaining, currency)}`,
          invoiceId: i.id,
          companyId: i.companyId,
          amount: remaining,
        });
      });

    data.invoices
      .filter((i) => i.status === 'draft')
      .forEach((i) => {
        const company = data.companies.find((c) => c.id === i.companyId);
        list.push({
          id: `draft_${i.id}`,
          kind: 'draft',
          severity: 'info',
          title: `مسودة فاتورة ${i.number}`,
          body: `${company?.name ?? 'عميل'} • بانتظار الإصدار • ${formatMoney(i.total, currency)}`,
          invoiceId: i.id,
          companyId: i.companyId,
          amount: i.total,
        });
      });

    const monthWorks = data.works.filter((w) => monthKeyOf(w.date) === monthKey);
    const monthRevenue = monthWorks.reduce((s, w) => s + (Number(w.quantity) || 0) * (Number(w.unitPrice) || 0), 0);
    const limit = data.settings.monthlyLimit || 0;
    if (limit > 0 && monthRevenue > limit) {
      list.push({
        id: 'limit_month',
        kind: 'limit',
        severity: 'warning',
        title: 'تجاوز الحد المالي الشهري',
        body: `إيراد ${monthLabel(monthKey)} بلغ ${formatMoney(monthRevenue, currency)} من حد ${formatMoney(
          limit,
          currency
        )}`,
        amount: monthRevenue,
      });
    }

    const unbilledByCompany = new Map<ID, { count: number; total: number }>();
    data.works
      .filter((w) => !w.invoiceId)
      .forEach((w) => {
        const entry = unbilledByCompany.get(w.companyId) ?? { count: 0, total: 0 };
        entry.count += 1;
        entry.total += (Number(w.quantity) || 0) * (Number(w.unitPrice) || 0);
        unbilledByCompany.set(w.companyId, entry);
      });
    unbilledByCompany.forEach((value, companyId) => {
      if (value.total <= 0) return;
      const company = data.companies.find((c) => c.id === companyId);
      list.push({
        id: `unbilled_${companyId}`,
        kind: 'unbilled',
        severity: 'info',
        title: `أعمال غير مفوترة - ${company?.name ?? 'عميل'}`,
        body: `${value.count} عمل بقيمة ${formatMoney(value.total, currency)} لم تُدرج في فاتورة`,
        companyId,
        amount: value.total,
      });
    });

    const order = { danger: 0, warning: 1, info: 2 } as const;

    // تنبيه الصندوق: مصروفات الشهر تتجاوز 60% من المقبوضات
    const monthVouchers = data.vouchers.filter((v) => monthKeyOf(v.date) === monthKey);
    const cashIn = monthVouchers.filter((v) => v.type === 'receipt').reduce((s, v) => s + v.amount, 0);
    const cashOut = monthVouchers.filter((v) => v.type === 'payment').reduce((s, v) => s + v.amount, 0);
    if (cashOut > 0 && cashIn > 0 && cashOut / cashIn > 0.6) {
      list.push({
        id: 'cash_ratio',
        kind: 'cash',
        severity: cashOut > cashIn ? 'danger' : 'warning',
        title: cashOut > cashIn ? 'مصروفات الصندوق تجاوزت المقبوضات' : 'ارتفاع نسبة مصروفات الصندوق',
        body: `${monthLabel(monthKey)}: مقبوضات ${formatMoney(cashIn, currency)} مقابل مدفوعات ${formatMoney(cashOut, currency)}`,
        amount: cashOut,
      });
    }

    return list.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [data.invoices, data.works, data.companies, data.vouchers, data.settings.monthlyLimit, currency]);

  const value: AppContextValue = {
    ready,
    companies: data.companies,
    works: data.works,
    invoices: data.invoices,
    vouchers: data.vouchers,
    ledger: data.ledger,
    settings: data.settings,
    users: data.users,
    currentUser,
    role: currentUser.role,
    currency,
    alerts,
    toast,
    showToast,
    setCurrentUserId,
    saveCompany,
    deleteCompany,
    saveWork,
    deleteWork,
    unlinkWork,
    createInvoice,
    setInvoiceStatus,
    updateInvoiceNotes,
    deleteInvoice,
    recordInvoicePayment,
    addVoucher,
    deleteVoucher,
      updateVoucher,
      importBackupData,
    addLedgerEntry,
    deleteLedgerEntry,
    vouchersOfInvoice,
    updateSettings,
    updateCurrency,
    addUser,
    updateUser,
    deleteUser,
    resetDemoData,
    clearAllData,
    companyById,
    worksOfCompany,
    invoicesOfCompany,
    unbilledWorks,
    invoiceItems,
    workTotal,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

/** مؤشرات مالية محسوبة جاهزة للاستخدام في الشاشات */
export function useMetrics() {
  const { works, invoices, vouchers, ledger, currency, settings, workTotal } = useApp();
  return useMemo(() => {
    const monthKey = currentMonthKey();
    const keys6 = lastMonthKeys(6);
    const monthWorks = works.filter((w) => monthKeyOf(w.date) === monthKey);
    const monthRevenue = monthWorks.reduce((s, w) => s + workTotal(w), 0);
    const today = todayISO();
    const todayWorks = works.filter((w) => w.date === today);
    const outstanding = invoices.filter((i) => isOutstanding(i));
    const outstandingTotal = round2(outstanding.reduce((s, i) => s + invoiceRemaining(i), 0));
    const overdue = outstanding.filter((i) => i.dueDate < today);
    const overdueTotal = round2(overdue.reduce((s, i) => s + invoiceRemaining(i), 0));
    const collected = round2(invoices.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0));
    const totalInvoiced = invoices.reduce((s, i) => s + i.total, 0);
    const unbilled = works.filter((w) => !w.invoiceId);
    const unbilledTotal = unbilled.reduce((s, w) => s + workTotal(w), 0);

    // الصندوق والسندات
    const cashIn = round2(vouchers.filter((v) => v.type === 'receipt').reduce((s, v) => s + v.amount, 0));
    const cashOut = round2(vouchers.filter((v) => v.type === 'payment').reduce((s, v) => s + v.amount, 0));
    const cashBalance = round2(cashIn - cashOut);
    const monthVouchers = vouchers.filter((v) => monthKeyOf(v.date) === monthKey);
    const monthCashIn = round2(monthVouchers.filter((v) => v.type === 'receipt').reduce((s, v) => s + v.amount, 0));
    const monthCashOut = round2(monthVouchers.filter((v) => v.type === 'payment').reduce((s, v) => s + v.amount, 0));

    // كشف الإيرادات والمصروفات اليومية
    const ledgerIncome = round2(ledger.filter((l) => l.kind === 'income').reduce((s, l) => s + l.amount, 0));
    const ledgerExpense = round2(ledger.filter((l) => l.kind === 'expense').reduce((s, l) => s + l.amount, 0));
    const allRevenue = round2(works.reduce((s, w) => s + workTotal(w), 0));
    const totalIncome = round2(allRevenue + ledgerIncome);
    const totalExpenses = ledgerExpense;
    const netProfit = round2(totalIncome - totalExpenses);
    const monthLedgerIncome = round2(
      ledger.filter((l) => l.kind === 'income' && monthKeyOf(l.date) === monthKey).reduce((s, l) => s + l.amount, 0)
    );
    const monthLedgerExpense = round2(
      ledger.filter((l) => l.kind === 'expense' && monthKeyOf(l.date) === monthKey).reduce((s, l) => s + l.amount, 0)
    );
    const monthExpenses = monthLedgerExpense;
    const monthNet = round2(monthRevenue + monthLedgerIncome - monthExpenses);

    const series = keys6.map((k) => ({
      key: k,
      label: monthLabel(k),
      value: round2(works.filter((w) => monthKeyOf(w.date) === k).reduce((s, w) => s + workTotal(w), 0)),
      income: round2(ledger.filter((l) => l.kind === 'income' && monthKeyOf(l.date) === k).reduce((s, l) => s + l.amount, 0)),
      expense: round2(ledger.filter((l) => l.kind === 'expense' && monthKeyOf(l.date) === k).reduce((s, l) => s + l.amount, 0)),
    }));
    const expenseByCategory = ledger
      .filter((l) => l.kind === 'expense')
      .reduce<{ label: string; value: number }[]>((acc, l) => {
        const found = acc.find((a) => a.label === l.category);
        if (found) found.value = round2(found.value + l.amount);
        else acc.push({ label: l.category, value: round2(l.amount) });
        return acc;
      }, [])
      .sort((a, b) => b.value - a.value);

    const topClients = keys6
      .slice(-3)
      .flatMap((k) => works.filter((w) => monthKeyOf(w.date) === k))
      .reduce<{ id: ID; total: number; count: number }[]>((acc, w) => {
        const found = acc.find((a) => a.id === w.companyId);
        if (found) {
          found.total += workTotal(w);
          found.count += 1;
        } else {
          acc.push({ id: w.companyId, total: workTotal(w), count: 1 });
        }
        return acc;
      }, [])
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return {
      monthKey,
      monthLabel: monthLabel(monthKey),
      monthRevenue,
      monthWorksCount: monthWorks.length,
      todayWorks,
      todayRevenue: todayWorks.reduce((s, w) => s + workTotal(w), 0),
      outstanding,
      outstandingTotal,
      overdue,
      overdueTotal,
      collected,
      totalInvoiced,
      collectionRate: totalInvoiced ? Math.round((collected / totalInvoiced) * 100) : 0,
      averageInvoice: invoices.length ? totalInvoiced / invoices.length : 0,
      unbilled,
      unbilledTotal,
      series,
      topClients,
      limit: settings.monthlyLimit,
      limitUsedPct: settings.monthlyLimit ? Math.min(100, Math.round((monthRevenue / settings.monthlyLimit) * 100)) : 0,
      currency,
      allRevenue,
      // الصندوق
      cashIn,
      cashOut,
      cashBalance,
      monthCashIn,
      monthCashOut,
      vouchersCount: vouchers.length,
      // الإيرادات والمصروفات
      ledgerIncome,
      ledgerExpense,
      totalIncome,
      totalExpenses,
      netProfit,
      monthLedgerIncome,
      monthExpenses,
      monthNet,
      expenseByCategory,
    };
  }, [works, invoices, vouchers, ledger, currency, settings.monthlyLimit, workTotal]);
}

export { addMonthsToKey, currentMonthKey, monthLabel };
