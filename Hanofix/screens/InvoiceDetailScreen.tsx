import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, usePalette } from '../lib/theme';
import { useApp } from '../state/AppContext';
import {
  Badge,
  Btn,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  InfoRow,
  MenuRow,
  Notice,
  OptionPicker,
  Screen,
  ScreenHeader,
  SectionHeader,
  SelectField,
  rtlText,
} from '../components/ui';
import { TotalsBlock, statusTone } from '../components/cards';
import {
  buildInvoiceHtml,
  buildInvoiceShareText,
  exportCsv,
  exportExcel,
  exportMetaRows,
  isWeb,
  printHtml,
  safeFileName,
  savePdfNative,
  shareFileNative,
  shareText,
} from '../lib/exporters';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  formatDate,
  formatDateShort,
  formatMoney,
  formatQuantity,
  invoiceRemaining,
  STATUS_LABELS,
  daysBetween,
  round2,
  todayISO,
} from '../lib/format';
import { DatePickerModal } from '../components/Calendar';
import { PaymentMethod } from '../lib/types';
import { InvoiceStatus } from '../lib/types';
import { can } from '../lib/permissions';

export default function InvoiceDetailScreen() {
  const c = usePalette();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const {
    invoices,
    works,
    settings,
    currency,
    role,
    currentUser,
    companyById,
    invoiceItems,
    setInvoiceStatus,
    updateInvoiceNotes,
    deleteInvoice,
    recordInvoicePayment,
    vouchersOfInvoice,
    showToast,
    workTotal,
  } = useApp();

  const invoice = invoices.find((i) => i.id === route.params?.invoiceId);
  const [statusOpen, setStatusOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payDate, setPayDate] = useState(todayISO());
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payDateOpen, setPayDateOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);

  if (!invoice) {
    return (
      <Screen>
        <ScreenHeader title="الفاتورة" onBack={() => nav.goBack()} />
        <EmptyState icon="alert-circle-outline" title="الفاتورة غير موجودة" body="ربما تم حذفها أو إعادة تعيين البيانات" />
      </Screen>
    );
  }

  const company = companyById(invoice.companyId);
  const items = invoiceItems(invoice);
  const today = todayISO();
  const remaining = invoiceRemaining(invoice);
  const paidAmount = round2(Number(invoice.paidAmount) || 0);
  const open = invoice.status === 'issued' || invoice.status === 'partial';
  const overdueDays = open && remaining > 0 && invoice.dueDate < today ? Math.abs(daysBetween(invoice.dueDate, today)) : 0;
  const invoiceVouchers = vouchersOfInvoice(invoice.id);

  const html = () => buildInvoiceHtml(invoice, company, works, settings, currency, currentUser.name);

  const doPrint = async () => {
    setBusy('print');
    const ok = await printHtml(html());
    setBusy(null);
    showToast(ok ? (isWeb ? 'تم فتح نافذة الطباعة / PDF' : 'تم فتح نافذة الطباعة') : 'تعذر فتح الطباعة', ok ? 'success' : 'error');
  };

  const doPdf = async () => {
    if (isWeb) {
      await doPrint();
      return;
    }
    setBusy('pdf');
    const uri = await savePdfNative(html(), `${safeFileName(settings.businessName)}-${invoice.number}.pdf`);
    if (uri) {
      const ok = await shareFileNative(uri, 'application/pdf', `مشاركة ${invoice.number}.pdf`);
      setBusy(null);
      showToast(ok ? 'تم إنشاء ملف PDF ومشاركته' : 'تم إنشاء الملف في الذاكرة المؤقتة', ok ? 'success' : 'info');
    } else {
      setBusy(null);
      showToast('تعذر إنشاء ملف PDF', 'error');
    }
  };

  const doShare = async () => {
    setBusy('share');
    const res = await shareText(buildInvoiceShareText(invoice, company, settings, currency, currentUser.name));
    setBusy(null);
    showToast(
      res === 'shared' ? 'تمت المشاركة' : res === 'copied' ? 'تم نسخ تفاصيل الفاتورة (المتصفح لا يدعم المشاركة المباشرة)' : 'تعذرت المشاركة',
      res === 'failed' ? 'error' : 'info'
    );
  };

  const doExcel = async () => {
    setBusy('excel');
    const rows: (string | number)[][] = [
      ...exportMetaRows(settings, currentUser.name, currency),
      ['رقم الفاتورة', invoice.number],
      ['العميل', company?.name ?? ''],
      ['الحالة', STATUS_LABELS[invoice.status]],
      ['الإجمالي', invoice.total],
      ['المدفوع', paidAmount],
      ['المتبقي', remaining],
      [],
      ['#', 'البيان', 'التاريخ', 'الكمية', 'الوحدة', 'سعر الوحدة', 'الإجمالي'],
      ...items.map((w, idx) => [idx + 1, w.type, w.date, w.quantity, w.unit, w.unitPrice, workTotal(w)]),
      [],
      ['سندات التحصيل'],
      ['رقم السند', 'التاريخ', 'المبلغ', 'طريقة الدفع', 'المسؤول'],
      ...invoiceVouchers.map((v) => [v.number, v.date, v.amount, PAYMENT_METHOD_LABELS[v.method], v.createdBy]),
    ];
    const res = await exportExcel(`${safeFileName(settings.businessName)}-${invoice.number}`, rows, `فاتورة ${invoice.number}`);
    setBusy(null);
    showToast(res === 'failed' ? 'تعذر تصدير Excel' : 'تم تصدير الفاتورة بصيغة Excel', res === 'failed' ? 'error' : 'success');
  };

  const doCsv = async () => {
    setBusy('csv');
    const rows: (string | number)[][] = [
      ...exportMetaRows(settings, currentUser.name, currency),
      ['رقم الفاتورة', invoice.number],
      ['العميل', company?.name ?? ''],
      ['الحالة', STATUS_LABELS[invoice.status]],
      ['الفترة', `${invoice.periodStart} → ${invoice.periodEnd}`],
      ['تاريخ الإصدار', invoice.issueDate],
      ['تاريخ الاستحقاق', invoice.dueDate],
      [],
      ['#', 'البيان', 'التاريخ', 'الكمية', 'الوحدة', 'سعر الوحدة', 'الإجمالي'],
      ...items.map((w, idx) => [idx + 1, w.type, w.date, w.quantity, w.unit, w.unitPrice, workTotal(w)]),
      [],
      ['الإجمالي الفرعي', invoice.subtotal],
      ['الخصم', invoice.discount],
      [`الضريبة ${invoice.taxRate}%`, invoice.taxAmount],
      ['الإجمالي المستحق', invoice.total],
      ['العملة', `${currency.code} ${currency.symbol}`],
      ['المسؤول', currentUser.name],
    ];
    const res = await exportCsv(`${safeFileName(settings.businessName)}-${invoice.number}.csv`, rows);
    setBusy(null);
    showToast(
      res === 'downloaded' ? 'تم تنزيل ملف CSV' : res === 'shared' ? 'تم تجهيز ملف CSV للمشاركة' : 'تعذر التصدير',
      res === 'failed' ? 'error' : 'success'
    );
  };

  const changeStatus = (status: InvoiceStatus) => {
    if (status === 'paid' && remaining > 0) {
      // إصدار سند قبض بكامل المتبقي عند التحديد كمدفوعة
      const voucher = recordInvoicePayment({
        invoiceId: invoice.id,
        amount: remaining,
        method: payMethod,
        date: todayISO(),
        notes: 'تحصيل كامل عند تحديد الفاتورة كمدفوعة',
      });
      showToast(voucher ? `تم إصدار سند القبض ${voucher.number} وتحديد الفاتورة كمدفوعة` : 'تعذر إصدار سند القبض', voucher ? 'success' : 'error');
      return;
    }
    setInvoiceStatus(invoice.id, status);
    showToast(status === 'paid' ? 'تم تحديد الفاتورة كمدفوعة' : `تم تغيير الحالة إلى ${STATUS_LABELS[status]}`, 'info');
  };

  const openPayModal = () => {
    if (!can(role, 'invoices.edit')) {
      showToast('دورك الحالي لا يسمح بتسجيل التحصيل', 'error');
      return;
    }
    if (remaining <= 0) {
      showToast('لا يوجد مبلغ متبقٍ على هذه الفاتورة', 'info');
      return;
    }
    setPayAmount(`${remaining}`);
    setPayDate(todayISO());
    setPayReference(invoice.number);
    setPayNotes('');
    setPayOpen(true);
  };

  const submitPayment = () => {
    const amount = round2(Number(payAmount.replace(/[^0-9.]/g, '')) || 0);
    if (amount <= 0) {
      showToast('أدخل مبلغًا أكبر من صفر', 'error');
      return;
    }
    if (amount > remaining) {
      showToast(`المبلغ أكبر من المتبقي (${formatMoney(remaining, currency)})`, 'error');
      return;
    }
    const voucher = recordInvoicePayment({
      invoiceId: invoice.id,
      amount,
      method: payMethod,
      date: payDate,
      reference: payReference,
      notes: payNotes,
    });
    setPayOpen(false);
    if (!voucher) {
      showToast('تعذر إصدار سند القبض', 'error');
      return;
    }
    showToast(`تم إصدار سند القبض ${voucher.number} بمبلغ ${formatMoney(amount, currency)}`);
    nav.navigate('VoucherDetail', { voucherId: voucher.id });
  };

  return (
    <Screen>
      <ScreenHeader
        title="فاتورة ضريبية"
        subtitle={`${invoice.number} • ${company?.name ?? 'عميل'}`}
        onBack={() => nav.goBack()}
        right={<Badge label={overdueDays ? `متأخرة ${overdueDays} يوم` : STATUS_LABELS[invoice.status]} tone={overdueDays ? 'danger' : statusTone(invoice.status)} />}
      />
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <Card style={{ marginBottom: SPACING.lg, backgroundColor: c.primarySoft, borderColor: c.primarySoft }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, flexShrink: 1 }}>
              <Text style={[rtlText, { color: c.primaryText, fontSize: 12.5, fontWeight: '700' }]}>الإجمالي المستحق</Text>
              <Text
                style={[rtlText, { color: c.primaryText, fontSize: 24, fontWeight: '800', marginTop: 4, lineHeight: 32 }]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.55}
              >
                {formatMoney(invoice.total, currency)}
              </Text>
              <Text style={[rtlText, { color: c.primaryText, fontSize: 11.5, marginTop: 6, opacity: 0.85, lineHeight: 17 }]} numberOfLines={2}>
                {items.length} بند • {monthPeriod(invoice.periodStart, invoice.periodEnd)}
              </Text>
            </View>
            <View style={{ width: 56, height: 56, borderRadius: RADIUS.lg, backgroundColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ionicons name="receipt" size={26} color={c.primaryText} />
            </View>
          </View>
          {paidAmount > 0 || remaining > 0 ? (
            <View
              style={{
                flexDirection: 'row-reverse',
                gap: SPACING.md,
                marginTop: SPACING.md,
                paddingTop: SPACING.md,
                borderTopWidth: 1,
                borderTopColor: 'rgba(255,255,255,0.35)',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[rtlText, { color: c.primaryText, fontSize: 11, opacity: 0.85 }]}>المدفوع</Text>
                <Text style={[rtlText, { color: c.primaryText, fontSize: 14, fontWeight: '800', marginTop: 2 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {formatMoney(paidAmount, currency)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[rtlText, { color: c.primaryText, fontSize: 11, opacity: 0.85 }]}>المتبقي</Text>
                <Text style={[rtlText, { color: c.primaryText, fontSize: 14, fontWeight: '800', marginTop: 2 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {formatMoney(remaining, currency)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[rtlText, { color: c.primaryText, fontSize: 11, opacity: 0.85 }]}>سندات القبض</Text>
                <Text style={[rtlText, { color: c.primaryText, fontSize: 14, fontWeight: '800', marginTop: 2 }]}>{invoiceVouchers.length}</Text>
              </View>
            </View>
          ) : null}
        </Card>

        {open && remaining > 0 ? (
          <Card style={{ marginBottom: SPACING.lg }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md }}>
              <Ionicons name="cash-outline" size={19} color={c.success} />
              <View style={{ flex: 1 }}>
                <Text style={[rtlText, { color: c.text, fontSize: 14, fontWeight: '800' }]}>تحصيل دفعة من العميل</Text>
                <Text style={[rtlText, { color: c.textMuted, fontSize: 11.5, marginTop: 3, lineHeight: 17 }]} numberOfLines={2}>
                  عند تسجيل أي مبلغ يُصدر التطبيق سند قبض تلقائيًا ويحدّث المتبقي وحالة الفاتورة.
                </Text>
              </View>
            </View>
            <Btn
              label={`تسجيل تحصيل وإصدار سند قبض (${formatMoney(remaining, currency)})`}
              icon="receipt-outline"
              variant="success"
              onPress={openPayModal}
              disabled={!can(role, 'invoices.edit')}
            />
          </Card>
        ) : null}

        {invoiceVouchers.length ? (
          <>
            <SectionHeader title={`سندات القبض (${invoiceVouchers.length})`} icon="receipt-outline" />
            <Card padded={false} style={{ overflow: 'hidden', marginBottom: SPACING.lg }}>
              {invoiceVouchers.map((v) => (
                <MenuRow
                  key={v.id}
                  label={`${v.number} — ${formatMoney(v.amount, currency)}`}
                  icon="arrow-down-circle-outline"
                  tone="primary"
                  onPress={() => nav.navigate('VoucherDetail', { voucherId: v.id })}
                  hint={`${formatDateShort(v.date)} • ${PAYMENT_METHOD_LABELS[v.method]} • ${v.createdBy}`}
                />
              ))}
            </Card>
          </>
        ) : null}

        <Card style={{ marginBottom: SPACING.lg }}>
          <InfoRow label="العميل" value={company?.name} icon="business" onValuePress={company ? () => nav.navigate('CompanyDetail', { companyId: company.id }) : undefined} />
          <InfoRow label="الهاتف" value={company?.phone} icon="call-outline" />
          <InfoRow label="الفترة" value={`${formatDate(invoice.periodStart)} → ${formatDate(invoice.periodEnd)}`} icon="calendar-outline" />
          <InfoRow label="تاريخ الإصدار" value={formatDate(invoice.issueDate)} icon="document-attach-outline" />
          <InfoRow
            label="تاريخ الاستحقاق"
            value={formatDate(invoice.dueDate)}
            icon="time-outline"
            valueColor={overdueDays ? c.danger : invoice.status === 'paid' ? c.success : c.text}
          />
          {invoice.paidAt ? <InfoRow label="تاريخ السداد" value={formatDate(invoice.paidAt)} icon="checkmark-done-outline" valueColor={c.success} /> : null}
          <InfoRow label="الرقم الضريبي للعميل" value={company?.taxNumber || '—'} icon="key-outline" />
        </Card>

        <SectionHeader title={`بنود الفاتورة (${items.length})`} icon="list-outline" />
        <Card padded={false} style={{ marginBottom: SPACING.lg, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row-reverse', backgroundColor: c.surfaceAlt, paddingVertical: 9, paddingHorizontal: SPACING.md }}>
            <Text style={[rtlText, { width: 30, color: c.textMuted, fontSize: 11.5, fontWeight: '800' }]}>#</Text>
            <Text style={[rtlText, { flex: 1, color: c.textMuted, fontSize: 11.5, fontWeight: '800' }]}>البيان</Text>
            <Text style={[rtlText, { width: 62, color: c.textMuted, fontSize: 11.5, fontWeight: '800', textAlign: 'center' }]}>الكمية</Text>
            <Text style={[rtlText, { width: 86, color: c.textMuted, fontSize: 11.5, fontWeight: '800', textAlign: 'left' }]}>الإجمالي</Text>
          </View>
          {items.map((w, idx) => (
            <Pressable
              key={w.id}
              onPress={() => nav.navigate('WorkDetail', { workId: w.id })}
              style={({ pressed }) => ({
                flexDirection: 'row-reverse',
                alignItems: 'center',
                paddingVertical: 11,
                paddingHorizontal: SPACING.md,
                borderTopWidth: 1,
                borderTopColor: c.borderSoft,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={[rtlText, { width: 30, color: c.textFaint, fontSize: 12, fontWeight: '700' }]}>{idx + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[rtlText, { color: c.text, fontSize: 13, fontWeight: '700' }]} numberOfLines={1}>
                  {w.type}
                </Text>
                <Text style={[rtlText, { color: c.textFaint, fontSize: 11, marginTop: 2 }]}>{formatDateShort(w.date)}</Text>
              </View>
              <Text style={[rtlText, { width: 62, color: c.textMuted, fontSize: 12, textAlign: 'center' }]}>
                {formatQuantity(w.quantity)} {w.unit}
              </Text>
              <Text style={[rtlText, { width: 86, color: c.text, fontSize: 12.5, fontWeight: '800', textAlign: 'left' }]}>
                {formatMoney(workTotal(w), currency)}
              </Text>
            </Pressable>
          ))}
        </Card>

        <TotalsBlock
          subtotal={invoice.subtotal}
          discount={invoice.discount}
          taxRate={invoice.taxRate}
          taxAmount={invoice.taxAmount}
          total={invoice.total}
        />

        <SectionHeader title="تصدير ومشاركة" icon="share-social-outline" />
        <Card padded={false} style={{ marginBottom: SPACING.lg, overflow: 'hidden' }}>
          <MenuRow label="ملف طباعة / PDF" icon="print-outline" onPress={doPrint} hint="يفتح نافذة الطباعة ويمكن الحفظ كـ PDF" right={busy === 'print' ? <Ionicons name="reload" size={16} color={c.textFaint} /> : undefined} />
          {!isWeb ? (
            <MenuRow label="حفظ ومشاركة PDF" icon="document-outline" onPress={doPdf} hint="ينشئ ملف PDF جاهز للإرسال" />
          ) : null}
          <MenuRow label="مشاركة نصية" icon="chatbox-ellipses-outline" onPress={doShare} hint={isWeb ? 'نسخ تفاصيل الفاتورة إلى الحافظة' : 'إرسال ملخص الفاتورة عبر التطبيقات'} />
          <MenuRow label="تصدير Excel" icon="grid-outline" onPress={doExcel} hint="ملف ‎.xls يفتح في Excel مع بنود الفاتورة وسندات التحصيل" />
          <MenuRow label="تصدير CSV" icon="download-outline" onPress={doCsv} hint="ملف جدول بيانات لبنود الفاتورة" />
        </Card>

        <SectionHeader title="إدارة الفاتورة" icon="settings-outline" />
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <MenuRow
            label="تغيير الحالة"
            icon="swap-horizontal-outline"
            onPress={() => can(role, 'invoices.edit') && setStatusOpen(true)}
            hint={`الحالة الحالية: ${STATUS_LABELS[invoice.status]}`}
          />
          {invoice.status !== 'paid' ? (
            <MenuRow
              label="تحديد كمدفوعة"
              icon="checkmark-done-outline"
              tone="primary"
              onPress={() => can(role, 'invoices.edit') && changeStatus('paid')}
              hint={remaining > 0 ? `يصدر سند قبض بكامل المتبقي (${formatMoney(remaining, currency)})` : 'يتم تسجيل تاريخ السداد تلقائيًا'}
            />
          ) : null}
          <MenuRow
            label="ملاحظات الفاتورة"
            icon="create-outline"
            onPress={() => {
              if (!can(role, 'invoices.edit')) {
                showToast('دورك الحالي لا يسمح بالتعديل', 'error');
                return;
              }
              setNotesDraft(invoice.notes);
              setNotesOpen(true);
            }}
            hint={invoice.notes || 'شروط الدفع، تفاصيل إضافية...'}
          />
          <MenuRow
            label="حذف الفاتورة"
            icon="trash-outline"
            tone="danger"
            onPress={() => {
              if (!can(role, 'invoices.delete')) {
                showToast('دورك الحالي لا يسمح بحذف الفواتير', 'error');
                return;
              }
              setConfirmDelete(true);
            }}
            hint="ستعود البنود إلى قائمة الأعمال غير المفوترة"
          />
        </Card>

        {!can(role, 'invoices.edit') ? (
          <View style={{ marginTop: SPACING.lg }}>
            <Text style={[rtlText, { color: c.textFaint, fontSize: 12, textAlign: 'center' }]}>
              دورك الحالي ({role === 'employee' ? 'موظف' : role === 'accountant' ? 'محاسب' : 'مدير'}) لا يسمح بتعديل حالة الفواتير
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <OptionPicker
        visible={statusOpen}
        title="تغيير حالة الفاتورة"
        searchable={false}
        options={[
          { value: 'draft', label: 'مسودة', hint: 'غير صادرة للعميل' },
          { value: 'issued', label: 'مستحقة', hint: 'صادرة وبانتظار التحصيل' },
          { value: 'partial', label: 'مدفوعة جزئيًا', hint: 'تم تحصيل جزء من قيمتها' },
          { value: 'paid', label: 'مدفوعة', hint: 'تم تحصيل قيمتها كاملة' },
        ]}
        selected={invoice.status}
        onSelect={(v) => changeStatus(v as InvoiceStatus)}
        onClose={() => setStatusOpen(false)}
      />

      <Modal visible={notesOpen} transparent animationType="fade" onRequestClose={() => setNotesOpen(false)}>
        <View style={{ flex: 1, backgroundColor: c.overlay, justifyContent: 'center', padding: SPACING.xl }}>
          <View style={{ backgroundColor: c.surface, borderRadius: RADIUS.xl, padding: SPACING.lg }}>
            <Text style={[rtlText, { color: c.text, fontSize: 16, fontWeight: '800', marginBottom: SPACING.md }]}>ملاحظات الفاتورة</Text>
            <Field label="الملاحظات" value={notesDraft} onChangeText={setNotesDraft} placeholder="شروط الدفع..." multiline />
            <View style={{ flexDirection: 'row-reverse', gap: SPACING.md }}>
              <View style={{ flex: 1 }}>
                <Btn
                  label="حفظ"
                  icon="checkmark"
                  onPress={() => {
                    updateInvoiceNotes(invoice.id, notesDraft.trim());
                    setNotesOpen(false);
                    showToast('تم حفظ الملاحظات');
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Btn label="إلغاء" variant="outline" onPress={() => setNotesOpen(false)} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={payOpen} transparent animationType="slide" onRequestClose={() => setPayOpen(false)}>
        <View style={{ flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: c.surface,
              borderTopLeftRadius: RADIUS.xl,
              borderTopRightRadius: RADIUS.xl,
              padding: SPACING.lg,
              paddingBottom: SPACING.xl,
              maxHeight: '88%',
            }}
          >
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[rtlText, { color: c.text, fontSize: 17, fontWeight: '800', marginBottom: 6 }]}>تسجيل تحصيل وإصدار سند قبض</Text>
              <Text style={[rtlText, { color: c.textMuted, fontSize: 12, marginBottom: SPACING.lg, lineHeight: 19 }]}>
                الفاتورة {invoice.number} • المتبقي {formatMoney(remaining, currency)}
              </Text>
              <Field
                label="المبلغ المحصل"
                value={payAmount}
                onChangeText={setPayAmount}
                keyboardType="numeric"
                suffix={currency.symbol || currency.code}
                required
                hint={`الحد الأقصى المتبقي: ${formatMoney(remaining, currency)}`}
              />
              <SelectField label="طريقة الدفع" value={PAYMENT_METHOD_LABELS[payMethod]} onPress={() => setMethodOpen(true)} icon="card-outline" />
              <SelectField label="تاريخ التحصيل" value={formatDate(payDate)} onPress={() => setPayDateOpen(true)} icon="calendar" />
              <Field label="المرجع" value={payReference} onChangeText={setPayReference} placeholder="رقم الشيك / التحويل / رقم الفاتورة" />
              <Field label="ملاحظات" value={payNotes} onChangeText={setPayNotes} placeholder="تفاصيل إضافية على السند..." multiline />
              <Notice
                tone="primary"
                icon="receipt-outline"
                text="سيُنشأ سند قبض برقم تسلسلي مرتبط بهذه الفاتورة، ويمكن طباعته أو تصديره PDF / Excel من شاشة السند."
              />
            </ScrollView>
            <View style={{ flexDirection: 'row-reverse', gap: SPACING.md, marginTop: SPACING.md }}>
              <View style={{ flex: 2 }}>
                <Btn label="إصدار سند القبض" icon="checkmark" onPress={submitPayment} />
              </View>
              <View style={{ flex: 1 }}>
                <Btn label="إلغاء" variant="outline" onPress={() => setPayOpen(false)} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <OptionPicker
        visible={methodOpen}
        title="طريقة الدفع"
        searchable={false}
        options={PAYMENT_METHODS.map((pm) => ({ value: pm, label: PAYMENT_METHOD_LABELS[pm] }))}
        selected={payMethod}
        onSelect={(v) => setPayMethod(v as PaymentMethod)}
        onClose={() => setMethodOpen(false)}
      />

      <DatePickerModal visible={payDateOpen} value={payDate} onSelect={setPayDate} onClose={() => setPayDateOpen(false)} />

      <ConfirmDialog
        visible={confirmDelete}
        title="حذف الفاتورة"
        body={`سيتم حذف الفاتورة ${invoice.number} وإرجاع ${items.length} بند إلى الأعمال غير المفوترة. هل أنت متأكد؟`}
        confirmLabel="حذف"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteInvoice(invoice.id);
          setConfirmDelete(false);
          showToast('تم حذف الفاتورة', 'info');
          nav.goBack();
        }}
      />
    </Screen>
  );
}

function monthPeriod(start: string, end: string): string {
  return `${formatDateShort(start)} → ${formatDateShort(end)}`;
}
