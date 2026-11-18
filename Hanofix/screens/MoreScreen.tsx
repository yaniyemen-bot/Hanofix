import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { RADIUS, SPACING, usePalette } from '../lib/theme';
import { useApp, useMetrics } from '../state/AppContext';
import { Badge, Btn, Card, ConfirmDialog, MenuRow, Screen, ScreenHeader, SectionHeader, rtlText } from '../components/ui';
import { exportCsv, exportMetaRows, safeFileName } from '../lib/exporters';
import { formatMoney } from '../lib/format';
import { ROLE_LABELS, can, isManager } from '../lib/permissions';

export default function MoreScreen() {
  const c = usePalette();
  const nav = useNavigation<any>();
  const { settings, currency, currentUser, role, alerts, companies, works, invoices, vouchers, ledger, showToast, resetDemoData } = useApp();
  const m = useMetrics();
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const version = Constants.expoConfig?.version ?? '1.1.0';
  const isNativeAndroid = Platform.OS === 'android';

  const backup = async () => {
    if (!can(role, 'export.data')) {
      showToast('دورك الحالي لا يسمح بالتصدير', 'error');
      return;
    }
    setBusy(true);
    const rows: (string | number)[][] = [
      ...exportMetaRows(settings, currentUser.name, currency),
      ['النوع', 'المعرف', 'التاريخ', 'البيان', 'الكمية', 'الوحدة', 'سعر الوحدة', 'الإجمالي', 'العملة', 'الحالة', 'المسؤول'],
      ...works.map((w) => [
        'عمل',
        w.id,
        w.date,
        `${w.type} - ${companies.find((x) => x.id === w.companyId)?.name ?? ''}`,
        w.quantity,
        w.unit,
        w.unitPrice,
        (Number(w.quantity) || 0) * (Number(w.unitPrice) || 0),
        currency.code,
        w.invoiceId ? 'مفوتر' : 'غير مفوتر',
        currentUser.name,
      ]),
      ...invoices.map((i) => [
        'فاتورة',
        i.number,
        i.issueDate,
        companies.find((x) => x.id === i.companyId)?.name ?? '',
        i.workIds.length,
        'بند',
        i.taxRate,
        i.total,
        currency.code,
        i.status === 'paid' ? 'مدفوعة' : i.status === 'partial' ? 'مدفوعة جزئيًا' : i.status === 'issued' ? 'مستحقة' : 'مسودة',
        currentUser.name,
      ]),
      ...vouchers.map((v) => [
        v.type === 'receipt' ? 'سند قبض' : 'سند صرف',
        v.number,
        v.date,
        `${v.partyName} - ${v.reason}`,
        1,
        'سند',
        v.amount,
        v.type === 'receipt' ? v.amount : -v.amount,
        currency.code,
        v.method,
      ]),
      ...ledger.map((l) => [
        l.kind === 'income' ? 'إيراد يومي' : 'مصروف يومي',
        l.category,
        l.date,
        l.description,
        1,
        'قيد',
        l.amount,
        l.kind === 'income' ? l.amount : -l.amount,
        currency.code,
        l.createdBy,
      ]),
    ];
    const res = await exportCsv(`${safeFileName(settings.businessName)}-backup.csv`, rows);
    setBusy(false);
    showToast(res === 'failed' ? 'تعذر إنشاء النسخة الاحتياطية' : 'تم تنزيل نسخة من جميع الأعمال (CSV)', res === 'failed' ? 'error' : 'success');
  };

  return (
    <Screen scroll>
      <ScreenHeader title="المزيد" subtitle={`${settings.businessName} • ${ROLE_LABELS[role]}`} />

      <Card style={{ marginTop: SPACING.lg, marginBottom: SPACING.lg }}>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md }}>
          <View style={{ width: 46, height: 46, borderRadius: RADIUS.lg, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person" size={22} color={c.primaryText} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[rtlText, { color: c.text, fontSize: 15.5, fontWeight: '800' }]}>{currentUser.name}</Text>
            <Text style={[rtlText, { color: c.textMuted, fontSize: 12, marginTop: 3 }]}>الدور الحالي: {ROLE_LABELS[role]}</Text>
          </View>
          <View style={{ alignSelf: 'flex-start' }}>
            <Btn label="تبديل" variant="secondary" compact full={false} onPress={() => nav.navigate('Users')} />
          </View>
        </View>
      </Card>

      <View style={{ flexDirection: 'row-reverse', gap: SPACING.md, marginBottom: SPACING.lg }}>
        <MiniStat label="إيراد الشهر" value={formatMoney(m.monthRevenue, currency)} icon="trending-up" />
        <MiniStat label="مستحقات" value={formatMoney(m.outstandingTotal, currency)} icon="wallet" />
      </View>

      {isManager(role) ? (
        <>
          <SectionHeader title="لوحة تحكم المدير" icon="shield-checkmark" />
          <Card style={{ marginBottom: SPACING.lg }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: SPACING.md }}>
              <Ionicons name="shield-checkmark" size={16} color={c.success} />
              <Text style={[rtlText, { flex: 1, color: c.text, fontSize: 13, fontWeight: '800' }]}>إدارة كاملة للتطبيق مفعّلة</Text>
              <Badge label="مدير" tone="success" icon="checkmark-done" />
            </View>
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: SPACING.sm }}>
              <AdminTile icon="people" label={settings.labels.users} onPress={() => nav.navigate('Users')} />
              <AdminTile icon="wallet" label={settings.labels.cash} onPress={() => nav.navigate('Cash')} />
              <AdminTile icon="text" label="تسمية القوائم" onPress={() => nav.navigate('Labels')} />
              <AdminTile icon="settings" label={settings.labels.settings} onPress={() => nav.navigate('Settings')} />
              <AdminTile icon="cash" label={settings.labels.currency} onPress={() => nav.navigate('Currency')} />
              <AdminTile icon="logo-android" label="APK" onPress={() => nav.navigate('Apk')} />
              <AdminTile icon="stats-chart" label={settings.labels.reports} onPress={() => nav.navigate('Reports')} />
              <AdminTile icon="notifications" label={settings.labels.alerts} onPress={() => nav.navigate('Alerts')} />
            </View>
            <Text style={[rtlText, { color: c.textMuted, fontSize: 11.5, lineHeight: 19, marginTop: SPACING.md }]}>
              المدير يستطيع تعيين المسؤولين وتسميتهم وتبديل أدوارهم، وإعادة تسمية القوائم والمسميات الإدارية، وإدخال نوع العملة
              يدويًا، وإدارة حركة الصندوق والسندات المالية، وتعديل بيانات المنشأة، وحذف أو تعديل أي عملية، وتصدير الفواتير
              والسندات بصيغة PDF وExcel، وتنزيل نسخة APK.
            </Text>
          </Card>
        </>
      ) : null}

      <SectionHeader title="الأدوات" icon="apps-outline" />
      <Card padded={false} style={{ overflow: 'hidden', marginBottom: SPACING.lg }}>
        {can(role, 'cash.view') ? (
          <MenuRow
            label={settings.labels.cash}
            icon="wallet-outline"
            tone="primary"
            onPress={() => nav.navigate('Cash')}
            hint={`رصيد الصندوق ${formatMoney(m.cashBalance, currency)} • ${m.vouchersCount} سند`}
          />
        ) : null}
        <MenuRow label={settings.labels.reports} icon="stats-chart-outline" onPress={() => nav.navigate('Reports')} hint="إيرادات، مصروفات، تحصيل، أعلى العملاء" />
        <MenuRow label={settings.labels.alerts} icon="notifications-outline" badge={alerts.length} onPress={() => nav.navigate('Alerts')} hint="فواتير متأخرة وتجاوز الحد المالي" />
        <MenuRow label={settings.labels.apk} icon="logo-android" onPress={() => nav.navigate('Apk')} hint={isNativeAndroid ? 'التحديثات وملف التثبيت' : 'احصل على نسخة أندرويد من التطبيق'} />
        <MenuRow label="النسخ الاحتياطي" icon="cloud-download-outline" onPress={backup} hint="تنزيل نسخة من جميع الأعمال والفواتير والسندات (CSV)" />
      </Card>

      <SectionHeader title="الإعدادات" icon="settings-outline" />
      <Card padded={false} style={{ overflow: 'hidden', marginBottom: SPACING.lg }}>
        <MenuRow label={settings.labels.settings} icon="options-outline" onPress={() => nav.navigate('Settings')} hint="بيانات المنشأة والحد المالي والضريبة" />
        <MenuRow
          label={settings.labels.currency}
          icon="cash-outline"
          onPress={() => nav.navigate('Currency')}
          hint={`${currency.name} (${currency.symbol}) • إدخال يدوي مدعوم`}
        />
        <MenuRow label={settings.labels.users} icon="people-outline" onPress={() => nav.navigate('Users')} hint="تعيين المسؤولين وتسميتهم والتبديل بينهم" />
        <MenuRow
          label="تسمية القوائم والمسميات"
          icon="text-outline"
          onPress={() => nav.navigate('Labels')}
          hint={can(role, 'labels.edit') ? 'تعديل أسماء التبويبات والشاشات الإدارية' : 'متاح للمدير فقط'}
        />
      </Card>

      {settings.showResetDemoData && can(role, 'settings.edit') ? (
        <>
          <SectionHeader title="البيانات" icon="server-outline" />
          <Card padded={false} style={{ overflow: 'hidden', marginBottom: SPACING.lg }}>
            <MenuRow
              label="استعادة البيانات الافتراضية"
              icon="refresh-outline"
              tone="danger"
              onPress={() => setConfirmReset(true)}
              hint="يعيد الشركات والأعمال التابعة لها إلى البيانات الافتراضية مع الإبقاء على إعداداتك"
            />
          </Card>
        </>
      ) : null}

      <Card style={{ marginBottom: SPACING.lg }}>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md }}>
          <View style={{ width: 44, height: 44, borderRadius: RADIUS.lg, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="megaphone-outline" size={22} color={c.primaryText} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[rtlText, { color: c.text, fontSize: 14.5, fontWeight: '800', lineHeight: 21 }]} numberOfLines={2}>
              {settings.businessName}
            </Text>
            <Text style={[rtlText, { color: c.textMuted, fontSize: 12, marginTop: 4, lineHeight: 19 }]}>
              ERP-Lite v2 • الإصدار {version} • يعمل محليًا بدون إنترنت • {companies.length} عميل، {works.length} عمل، {invoices.length} فاتورة
            </Text>
          </View>
        </View>
      </Card>

      <ConfirmDialog
        visible={confirmReset}
        title="استعادة البيانات الافتراضية"
        body="سيتم استبدال الشركات والأعمال والفواتير والسندات الحالية بالبيانات الافتراضية. لن تتغير إعدادات المنشأة والعملة والتسميات."
        confirmLabel="استعادة"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          resetDemoData();
          setConfirmReset(false);
          showToast('تمت استعادة البيانات الافتراضية', 'info');
        }}
      />
    </Screen>
  );
}

function AdminTile({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: '31%',
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surfaceAlt,
        paddingVertical: 12,
        alignItems: 'center',
        gap: 6,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={19} color={c.primaryText} />
      <Text style={[rtlText, { color: c.text, fontSize: 11.5, fontWeight: '700' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }) {
  const c = usePalette();
  return (
    <Card style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
        <Ionicons name={icon} size={17} color={c.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[rtlText, { color: c.textFaint, fontSize: 11 }]}>{label}</Text>
          <Text style={[rtlText, { color: c.text, fontSize: 14, fontWeight: '800', marginTop: 2 }]} numberOfLines={1}>
            {value}
          </Text>
        </View>
      </View>
    </Card>
  );
}
