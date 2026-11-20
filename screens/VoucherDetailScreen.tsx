import { Modal, TextInput } from "react-native";
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
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
  InfoRow,
  MenuRow,
  Screen,
  ScreenHeader,
  SectionHeader, ActionDropdown,
  rtlText,
} from '../components/ui';
import {
  buildVoucherHtml,
  buildVoucherShareText,
  exportCsv,
  exportExcel,
  exportMetaRows,
  isWeb,
  printHtml,
  safeFileName,
  savePdfNative,
  shareFileNative,
  shareText,
  voucherKindLabel,
  vouchersToRows,
} from '../lib/exporters';
import { PAYMENT_METHOD_LABELS, formatDate, formatMoney } from '../lib/format';
import { can } from '../lib/permissions';

export default function VoucherDetailScreen() {
  const c = usePalette();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { vouchers, settings, currency, role, deleteVoucher, updateVoucher, showToast, companyById } = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const openEdit = () => { if (!can(role, "settings.edit")) { showToast("التعديل للمدير فقط", "error"); return; } setEditAmount(String(voucher!.amount || "")); setEditDate(voucher!.date || ""); setEditNote((voucher as any).note || ""); setEditOpen(true); };
  const saveEdit = () => { const n = parseFloat(editAmount); if (!n || n <= 0) { showToast("أدخل مبلغاً صحيحاً", "error"); return; } updateVoucher(voucher!.id, { amount: n, date: editDate.trim() || voucher!.date, note: editNote.trim() }); setEditOpen(false); showToast("تم تعديل السند وتحديث الأرصدة", "success"); };
  const [busy, setBusy] = useState<string | null>(null);

  const voucher = vouchers.find((v) => v.id === route.params?.voucherId);

  if (!voucher) {
    return (
      <Screen>
        <ScreenHeader title="السند المالي" onBack={() => nav.goBack()} />
        <EmptyState icon="alert-circle-outline" title="السند غير موجود" body="ربما تم حذفه من حركة الصندوق" />
      
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 }}>
          <View style={{ backgroundColor: c.card, borderRadius: 16, padding: 18 }}>
            <Text style={{ color: c.text, fontSize: 17, fontWeight: "800", textAlign: "right", marginBottom: 12 }}>تعديل السند</Text>
            <Text style={{ color: c.textMuted, fontSize: 12, textAlign: "right" }}>المبلغ</Text>
            <TextInput value={editAmount} onChangeText={setEditAmount} keyboardType="numeric" style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 10, color: c.text, textAlign: "right", marginBottom: 10 }} />
            <Text style={{ color: c.textMuted, fontSize: 12, textAlign: "right" }}>التاريخ</Text>
            <TextInput value={editDate} onChangeText={setEditDate} style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 10, color: c.text, textAlign: "right", marginBottom: 10 }} />
            <Text style={{ color: c.textMuted, fontSize: 12, textAlign: "right" }}>البيان</Text>
            <TextInput value={editNote} onChangeText={setEditNote} multiline style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 10, color: c.text, textAlign: "right", minHeight: 60, marginBottom: 14 }} />
            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              <View style={{ flex: 1 }}><Btn label="حفظ" onPress={saveEdit} /></View>
              <View style={{ flex: 1 }}><Btn label="إلغاء" variant="outline" onPress={() => setEditOpen(false)} /></View>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
    );
  }

  const isReceipt = voucher.type === 'receipt';
  const html = () => buildVoucherHtml(voucher, settings, currency);
  const fileBase = `${safeFileName(settings.businessName)}-${voucher.number}`;

  const doPrint = async () => {
    setBusy('print');
    const ok = await printHtml(html());
    setBusy(null);
    showToast(ok ? 'تم فتح نافذة الطباعة / PDF' : 'تعذر فتح الطباعة', ok ? 'success' : 'error');
  };

  const doPdf = async () => {
    if (isWeb) {
      await doPrint();
      return;
    }
    setBusy('pdf');
    const uri = await savePdfNative(html(), `${fileBase}.pdf`);
    const ok = uri ? await shareFileNative(uri, 'application/pdf', `مشاركة ${voucher.number}.pdf`) : false;
    setBusy(null);
    showToast(ok ? 'تم إنشاء PDF ومشاركته' : 'تعذر إنشاء ملف PDF', ok ? 'success' : 'error');
  };

  const doExcel = async () => {
    setBusy('excel');
    const rows = [...exportMetaRows(settings, voucher.createdBy, currency), ...vouchersToRows([voucher], currency)];
    const res = await exportExcel(fileBase, rows, voucherKindLabel(voucher));
    setBusy(null);
    showToast(res === 'failed' ? 'تعذر تصدير Excel' : 'تم تصدير السند بصيغة Excel', res === 'failed' ? 'error' : 'success');
  };

  const doCsv = async () => {
    setBusy('csv');
    const rows = [...exportMetaRows(settings, voucher.createdBy, currency), ...vouchersToRows([voucher], currency)];
    const res = await exportCsv(`${fileBase}.csv`, rows);
    setBusy(null);
    showToast(res === 'failed' ? 'تعذر التصدير' : 'تم تصدير CSV', res === 'failed' ? 'error' : 'success');
  };

  const doShare = async () => {
    setBusy('share');
    const res = await shareText(buildVoucherShareText(voucher, settings, currency));
    setBusy(null);
    showToast(res === 'failed' ? 'تعذرت المشاركة' : res === 'copied' ? 'تم نسخ تفاصيل السند' : 'تمت المشاركة', res === 'failed' ? 'error' : 'info');
  };

  return (
    <Screen>
      <ScreenHeader
        title={voucherKindLabel(voucher)}
        subtitle={`${voucher.number} • ${formatDate(voucher.date)}`}
        onBack={() => nav.goBack()}
        right={<Badge label={isReceipt ? 'قبض' : 'صرف'} tone={isReceipt ? 'success' : 'danger'} />}
      />
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <Card
          style={{
            marginBottom: SPACING.lg,
            backgroundColor: isReceipt ? c.successSoft : c.dangerSoft,
            borderColor: 'transparent',
          }}
        >
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: RADIUS.lg,
                backgroundColor: 'rgba(255,255,255,0.45)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={isReceipt ? 'arrow-down-circle' : 'arrow-up-circle'} size={26} color={isReceipt ? c.success : c.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[rtlText, { color: isReceipt ? c.success : c.danger, fontSize: 12.5, fontWeight: '700' }]}>
                {isReceipt ? 'المبلغ المحصل' : 'المبلغ المصروف'}
              </Text>
              <Text style={[rtlText, { color: isReceipt ? c.success : c.danger, fontSize: 25, fontWeight: '800', marginTop: 4 }]}>
                {formatMoney(voucher.amount, currency)}
              </Text>
              <Text style={[rtlText, { color: isReceipt ? c.success : c.danger, fontSize: 11.5, marginTop: 6, opacity: 0.85 }]}>
                {PAYMENT_METHOD_LABELS[voucher.method]} • {voucher.number}
              </Text>
            </View>
          </View>
        </Card>

        <Card style={{ marginBottom: SPACING.lg }}>
          <InfoRow label={isReceipt ? 'استلمنا من' : 'صرفنا إلى'} value={voucher.partyName} icon="person-outline" onValuePress={voucher.partyId ? () => nav.navigate('CompanyDetail', { companyId: voucher.partyId }) : undefined} />
          <InfoRow label="البيان" value={voucher.reason} icon="text-outline" />
          <InfoRow label="التاريخ" value={formatDate(voucher.date)} icon="calendar-outline" />
          <InfoRow label="طريقة الدفع" value={PAYMENT_METHOD_LABELS[voucher.method]} icon="card-outline" />
          <InfoRow label="المرجع" value={voucher.reference} icon="bookmark-outline" />
          <InfoRow label="المسؤول" value={voucher.createdBy} icon="shield-checkmark-outline" />
          <InfoRow label="ملاحظات" value={voucher.notes} icon="document-text-outline" />
          {voucher.migrated ? <InfoRow label="مصدر السند" value="مُرحّل من الإصدار السابق" icon="sync-outline" /> : null}
        </Card>

        {voucher.invoiceId ? (
          <Card style={{ marginBottom: SPACING.lg }} onPress={() => nav.navigate('InvoiceDetail', { invoiceId: voucher.invoiceId })}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md }}>
              <Ionicons name="link" size={18} color={c.primary} />
              <Text style={[rtlText, { flex: 1, color: c.primaryText, fontSize: 13, fontWeight: '700' }]}>مرتبط بفاتورة — اضغط لعرضها</Text>
              <Ionicons name="chevron-back" size={16} color={c.textFaint} />
            </View>
          </Card>
        ) : null}

        <ActionDropdown label="خيارات السند والتصدير" items={[
          { label: "طباعة / حفظ PDF", sub: "طباعة السند الرسمي بشعار الشركة", icon: "print-outline", onPress: doPrint },
          { label: "حفظ PDF على الجهاز", sub: "تصدير ملف PDF مباشر", icon: "document-outline", onPress: doPdf, hidden: isWeb },
          { label: "تصدير Excel (.xlsx)", sub: "فتح السند في جدول Excel", icon: "grid-outline", onPress: doExcel },
          { label: "تصدير CSV", sub: "ملف جدول بيانات", icon: "download-outline", onPress: doCsv },
          { label: "مشاركة نصية", sub: "نسخ أو مشاركة تفاصيل السند", icon: "chatbox-ellipses-outline", onPress: doShare },
          { label: "تعديل بيانات السند", sub: "تعديل المبلغ أو التاريخ أو البيان", icon: "create-outline", onPress: openEdit, hidden: !can(role, "settings.edit") },
          { label: isReceipt ? "سند قبض جديد" : "سند صرف جديد", sub: "إنشاء سند جديد", icon: "add-circle-outline", tone: "primary", onPress: () => nav.navigate("CashForm", { type: isReceipt ? "receipt" : "payment" }), hidden: !can(role, "cash.create") },
          { label: "حذف السند", sub: "حذف السند وإعادة احتساب الأرصدة", icon: "trash-outline", tone: "danger", onPress: () => { if (!can(role, "cash.delete")) { showToast("الدور الحالي لا يسمح بحذف السند", "error"); return; } setConfirmDelete(true); } },
        ]} />
        <Btn label="العودة لحركة الصندوق" icon="wallet-outline" variant="outline" onPress={() => nav.navigate("Cash")} />
    </ScrollView>

      <ConfirmDialog
        visible={confirmDelete}
        title="حذف السند المالي"
        body={`سيتم حذف ${voucherKindLabel(voucher)} ${voucher.number} بقيمة ${formatMoney(voucher.amount, currency)}${
          voucher.invoiceId ? ' وسيُعاد احتساب المدفوع والمتبقي على الفاتورة المرتبطة' : ''
        }. هل أنت متأكد؟`}
        confirmLabel="حذف"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteVoucher(voucher.id);
          setConfirmDelete(false);
          showToast('تم حذف السند', 'info');
          nav.goBack();
        }}
      />
    </Screen>
  );
}
