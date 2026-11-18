import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, usePalette } from '../lib/theme';
import { useApp } from '../state/AppContext';
import {
  Btn,
  Card,
  Field,
  Notice,
  OptionPicker,
  Screen,
  ScreenHeader,
  SectionHeader,
  Segmented,
  SelectField,
  StickyFooter,
  rtlText,
} from '../components/ui';
import { DatePickerModal } from '../components/Calendar';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  formatMoney,
  invoiceRemaining,
  isOutstanding,
  nextVoucherNumber,
  round2,
  todayISO,
} from '../lib/format';
import { PaymentMethod } from '../lib/types';
import { can } from '../lib/permissions';

type EntryMode = 'receipt' | 'payment' | 'income' | 'expense';

const MODES: { value: EntryMode; label: string }[] = [
  { value: 'receipt', label: 'سند قبض' },
  { value: 'payment', label: 'سند صرف' },
  { value: 'income', label: 'إيراد يومي' },
  { value: 'expense', label: 'مصروف يومي' },
];

export default function CashFormScreen() {
  const c = usePalette();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const {
    companies,
    invoices,
    vouchers,
    currency,
    role,
    settings,
    addVoucher,
    addLedgerEntry,
    recordInvoicePayment,
    showToast,
    companyById,
  } = useApp();

  const params = route.params ?? {};
  const initialMode: EntryMode =
    params.type === 'payment' ? 'payment' : params.kind === 'income' ? 'income' : params.kind === 'expense' ? 'expense' : params.mode === 'ledger' ? 'income' : 'receipt';

  const [mode, setMode] = useState<EntryMode>(initialMode);
  const [date, setDate] = useState(todayISO());
  const [partyName, setPartyName] = useState('');
  const [partyId, setPartyId] = useState<string | null>(params.companyId ?? null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [category, setCategory] = useState(INCOME_CATEGORIES[0]);
  const [notes, setNotes] = useState('');
  const [invoiceId, setInvoiceId] = useState<string | null>(params.invoiceId ?? null);
  const [alsoLedger, setAlsoLedger] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [dateOpen, setDateOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const isVoucher = mode === 'receipt' || mode === 'payment';
  const isIncome = mode === 'receipt' || mode === 'income';
  const linkedInvoice = invoices.find((i) => i.id === invoiceId);
  const linkedCompany = companyById(partyId ?? '');

  const outstandingInvoices = useMemo(
    () => invoices.filter((i) => isOutstanding(i)).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)),
    [invoices]
  );

  const amountValue = round2(Number(amount.replace(/[^0-9.]/g, '')) || 0);
  const previewNumber = isVoucher
    ? nextVoucherNumber(mode === 'receipt' ? 'receipt' : 'payment', vouchers, date)
    : `${isIncome ? 'IN' : 'EX'}-${date.slice(0, 7).replace('-', '')}`;

  const categories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const onModeChange = (next: EntryMode) => {
    setMode(next);
    setErrors({});
    setCategory((next === 'receipt' || next === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)[0]);
    if (next !== 'receipt') setInvoiceId(null);
  };

  const submit = () => {
    if (!can(role, 'cash.create')) {
      showToast('دورك الحالي لا يسمح بإصدار السندات أو القيود', 'error');
      return;
    }
    const e: Record<string, string> = {};
    if (amountValue <= 0) e.amount = 'أدخل مبلغًا أكبر من صفر';
    if (isVoucher && !partyName.trim() && !linkedCompany) e.party = 'اكتب اسم الطرف أو اختر شركة';
    if (!isVoucher && !category.trim()) e.category = 'اختر التصنيف';
    setErrors(e);
    if (Object.keys(e).length) {
      showToast('تحقق من الحقول المطلوبة', 'error');
      return;
    }

    const party = partyName.trim() || linkedCompany?.name || '';

    if (isVoucher) {
      if (mode === 'receipt' && linkedInvoice) {
        const voucher = recordInvoicePayment({
          invoiceId: linkedInvoice.id,
          amount: Math.min(amountValue, invoiceRemaining(linkedInvoice)),
          method,
          date,
          reference: reference.trim(),
          notes: notes.trim(),
        });
        if (!voucher) {
          showToast('المبلغ أكبر من المتبقي على الفاتورة', 'error');
          return;
        }
        if (alsoLedger) {
          addLedgerEntry({
            date,
            kind: 'income',
            category: 'إيراد أعمال',
            amount: voucher.amount,
            description: `تحصيل فاتورة ${linkedInvoice.number} - ${party}`,
            method,
            voucherId: voucher.id,
            companyId: linkedInvoice.companyId,
          });
        }
        showToast(`تم إصدار سند القبض ${voucher.number} وتحديث الفاتورة`);
        nav.replace('VoucherDetail', { voucherId: voucher.id });
        return;
      }

      const voucher = addVoucher({
        type: mode === 'receipt' ? 'receipt' : 'payment',
        date,
        partyName: party,
        partyId: partyId ?? null,
        amount: amountValue,
        method,
        reference: reference.trim(),
        reason: reason.trim() || (mode === 'receipt' ? 'تحصيل مبلغ' : 'صرف مبلغ'),
        invoiceId: null,
        notes: notes.trim(),
      });
      if (alsoLedger) {
        addLedgerEntry({
          date,
          kind: mode === 'receipt' ? 'income' : 'expense',
          category: mode === 'receipt' ? category : category,
          amount: amountValue,
          description: reason.trim() || party,
          method,
          voucherId: voucher.id,
          companyId: partyId ?? null,
        });
      }
      showToast(`تم إصدار ${mode === 'receipt' ? 'سند القبض' : 'سند الصرف'} ${voucher.number}`);
      nav.replace('VoucherDetail', { voucherId: voucher.id });
      return;
    }

    addLedgerEntry({
      date,
      kind: isIncome ? 'income' : 'expense',
      category,
      amount: amountValue,
      description: reason.trim() || notes.trim(),
      method,
      voucherId: null,
      companyId: partyId ?? null,
    });
    showToast(isIncome ? 'تم تسجيل الإيراد اليومي' : 'تم تسجيل المصروف اليومي');
    nav.goBack();
  };

  return (
    <Screen>
      <ScreenHeader title="تسجيل حركة مالية" subtitle="سندات القبض والصرف والقيود اليومية" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 150 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Segmented<EntryMode> options={MODES} value={mode} onChange={onModeChange} />

        <View style={{ marginTop: SPACING.lg }}>
          <Card style={{ marginBottom: SPACING.lg, backgroundColor: isIncome ? c.successSoft : c.dangerSoft, borderColor: 'transparent' }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flex: 1 }}>
                <Ionicons
                  name={isVoucher ? 'receipt-outline' : 'list-outline'}
                  size={17}
                  color={isIncome ? c.success : c.danger}
                />
                <Text style={[rtlText, { color: isIncome ? c.success : c.danger, fontSize: 12.5, fontWeight: '800' }]} numberOfLines={2}>
                  {isVoucher ? `رقم السند المتوقع: ${previewNumber}` : `قيد يومي (${isIncome ? 'إيراد' : 'مصروف'})`}
                </Text>
              </View>
              <Text style={[rtlText, { color: isIncome ? c.success : c.danger, fontSize: 15, fontWeight: '800' }]}>
                {formatMoney(amountValue, currency)}
              </Text>
            </View>
          </Card>

          <SelectField label="التاريخ" value={date} onPress={() => setDateOpen(true)} icon="calendar" required />

          {isVoucher || mode === 'expense' ? (
            <>
              <Field
                label={mode === 'receipt' ? 'استلمنا من' : mode === 'payment' ? 'صرفنا إلى' : 'الجهة (اختياري)'}
                value={partyName}
                onChangeText={setPartyName}
                placeholder="اسم العميل أو المورد أو الجهة"
                error={errors.party}
                required={isVoucher}
              />
              <SelectField
                label="اختيار من الشركات المسجلة"
                value={linkedCompany?.name}
                placeholder="اختياري - لربط الحركة بشركة"
                onPress={() => setPartyOpen(true)}
                icon="business-outline"
              />
            </>
          ) : null}

          {!isVoucher ? (
            <SelectField
              label="التصنيف"
              value={category}
              onPress={() => setCategoryOpen(true)}
              icon="pricetags-outline"
              required
              error={errors.category}
            />
          ) : null}

          {mode === 'receipt' ? (
            <SelectField
              label="ربط بفاتورة (اختياري)"
              value={linkedInvoice ? `${linkedInvoice.number} — متبقي ${formatMoney(invoiceRemaining(linkedInvoice), currency)}` : undefined}
              placeholder="اختر فاتورة لإصدار سند قبض مقابلها"
              onPress={() => (outstandingInvoices.length ? setInvoiceOpen(true) : showToast('لا توجد فواتير مستحقة', 'info'))}
              icon="document-text-outline"
            />
          ) : null}

          <Field
            label="المبلغ"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="0.00"
            suffix={currency.symbol || currency.code}
            error={errors.amount}
            required
          />

          <SelectField label="طريقة الدفع" value={PAYMENT_METHOD_LABELS[method]} onPress={() => setMethodOpen(true)} icon="card-outline" />

          <Field
            label={isVoucher ? 'البيان / مقابل' : 'البيان'}
            value={reason}
            onChangeText={setReason}
            placeholder={isVoucher ? 'مثال: تحصيل فاتورة، سداد إيجار...' : 'وصف الحركة اليومية...'}
          />

          {isVoucher ? (
            <Field label="المرجع (اختياري)" value={reference} onChangeText={setReference} placeholder="رقم الشيك / رقم التحويل" />
          ) : null}

          <Field label="ملاحظات (اختياري)" value={notes} onChangeText={setNotes} placeholder="أي تفاصيل إضافية..." multiline />

          <SectionHeader title="خيارات إضافية" icon="options-outline" />
          <Pressable
            onPress={() => setAlsoLedger((v) => !v)}
            style={({ pressed }) => ({
              flexDirection: 'row-reverse',
              alignItems: 'center',
              gap: SPACING.md,
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: RADIUS.md,
              padding: SPACING.md,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Ionicons name={alsoLedger ? 'checkbox' : 'square-outline'} size={21} color={alsoLedger ? c.primary : c.textFaint} />
            <View style={{ flex: 1 }}>
              <Text style={[rtlText, { color: c.text, fontSize: 13.5, fontWeight: '700' }]}>تسجيل الحركة في كشف الإيرادات والمصروفات</Text>
              <Text style={[rtlText, { color: c.textMuted, fontSize: 11.5, marginTop: 4, lineHeight: 18 }]}>
                يظهر المبلغ في الرسوم البيانية للتقارير ضمن الإيرادات أو المصروفات اليومية.
              </Text>
            </View>
          </Pressable>

          <View style={{ marginTop: SPACING.lg }}>
            <Notice
              tone="info"
              icon="information-circle"
              text="عند تحصيل أي مبلغ من العملاء يُصدر التطبيق سند قبض تلقائيًا برقم تسلسلي، وإذا كانت الحركة مرتبطة بفاتورة يتم تحديث المدفوع والمتبقي وحالة الفاتورة (مدفوعة جزئيًا / مدفوعة)."
            />
          </View>
        </View>
      </ScrollView>

      <StickyFooter>
        <View style={{ flex: 2 }}>
          <Btn label={isVoucher ? 'إصدار السند' : 'حفظ القيد'} icon="checkmark" onPress={submit} />
        </View>
        <View style={{ flex: 1 }}>
          <Btn label="إلغاء" variant="outline" onPress={() => nav.goBack()} />
        </View>
      </StickyFooter>

      <DatePickerModal visible={dateOpen} value={date} onSelect={setDate} onClose={() => setDateOpen(false)} />
      <OptionPicker
        visible={partyOpen}
        title="اختر الشركة"
        options={companies.map((co) => ({ value: co.id, label: co.name, hint: co.phone }))}
        selected={partyId}
        onSelect={(v) => {
          setPartyId(v);
          const co = companyById(v);
          if (co && !partyName.trim()) setPartyName(co.name);
        }}
        onClose={() => setPartyOpen(false)}
      />
      <OptionPicker
        visible={methodOpen}
        title="طريقة الدفع"
        searchable={false}
        options={PAYMENT_METHODS.map((pm) => ({ value: pm, label: PAYMENT_METHOD_LABELS[pm] }))}
        selected={method}
        onSelect={(v) => setMethod(v as PaymentMethod)}
        onClose={() => setMethodOpen(false)}
      />
      <OptionPicker
        visible={categoryOpen}
        title="اختر التصنيف"
        searchable={false}
        options={categories.map((cat) => ({ value: cat, label: cat }))}
        selected={category}
        onSelect={setCategory}
        onClose={() => setCategoryOpen(false)}
      />
      <OptionPicker
        visible={invoiceOpen}
        title="اختر الفاتورة"
        options={outstandingInvoices.map((i) => ({
          value: i.id,
          label: `${i.number} — ${companyById(i.companyId)?.name ?? 'عميل'}`,
          hint: `المتبقي ${formatMoney(invoiceRemaining(i), currency)} • الاستحقاق ${i.dueDate}`,
        }))}
        selected={invoiceId}
        onSelect={(v) => {
          setInvoiceId(v);
          const inv = invoices.find((i) => i.id === v);
          if (inv) {
            setPartyId(inv.companyId);
            setPartyName(companyById(inv.companyId)?.name ?? '');
            setReason(`تحصيل فاتورة ${inv.number}`);
            if (!amount) setAmount(`${invoiceRemaining(inv)}`);
          }
        }}
        onClose={() => setInvoiceOpen(false)}
      />
    </Screen>
  );
}
