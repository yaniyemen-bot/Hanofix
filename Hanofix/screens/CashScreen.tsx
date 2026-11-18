import React, { useMemo, useState } from 'react';
import { FlatList, Platform, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, usePalette } from '../lib/theme';
import { useApp, useMetrics } from '../state/AppContext';
import {
  Btn,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  FAB,
  Notice,
  Screen,
  ScreenHeader,
  SearchBar,
  Segmented,
  StatTile,
  rtlText,
} from '../components/ui';
import { exportCsv, exportExcel, exportMetaRows, ledgerToRows, safeFileName, vouchersToRows } from '../lib/exporters';
import { PAYMENT_METHOD_LABELS, formatMoney, formatDateShort, monthKeyOf } from '../lib/format';
import { LedgerEntry, Voucher } from '../lib/types';
import { can } from '../lib/permissions';

type Tab = 'vouchers' | 'ledger';
type VFilter = 'all' | 'receipt' | 'payment';
type LFilter = 'all' | 'income' | 'expense';

export default function CashScreen() {
  const c = usePalette();
  const nav = useNavigation<any>();
  const { vouchers, ledger, currency, role, settings, currentUser, showToast, deleteLedgerEntry } = useApp();
  const m = useMetrics();
  const [tab, setTab] = useState<Tab>('vouchers');
  const [vFilter, setVFilter] = useState<VFilter>('all');
  const [lFilter, setLFilter] = useState<LFilter>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const monthKey = m.monthKey;

  const filteredVouchers = useMemo(() => {
    const q = query.trim();
    return vouchers
      .filter((v) => (vFilter === 'all' ? true : v.type === vFilter))
      .filter((v) => (q ? `${v.number} ${v.partyName} ${v.reason} ${v.reference}`.includes(q) : true))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [vouchers, vFilter, query]);

  const filteredLedger = useMemo(() => {
    const q = query.trim();
    return ledger
      .filter((l) => (lFilter === 'all' ? true : l.kind === lFilter))
      .filter((l) => (q ? `${l.category} ${l.description} ${l.createdBy}`.includes(q) : true))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [ledger, lFilter, query]);

  const sums = useMemo(() => {
    const v = filteredVouchers;
    const inSum = v.filter((x) => x.type === 'receipt').reduce((s, x) => s + x.amount, 0);
    const outSum = v.filter((x) => x.type === 'payment').reduce((s, x) => s + x.amount, 0);
    const l = filteredLedger;
    const inc = l.filter((x) => x.kind === 'income').reduce((s, x) => s + x.amount, 0);
    const exp = l.filter((x) => x.kind === 'expense').reduce((s, x) => s + x.amount, 0);
    return { inSum, outSum, inc, exp };
  }, [filteredVouchers, filteredLedger]);

  const doExport = async (kind: 'csv' | 'excel') => {
    if (!can(role, 'export.data')) {
      showToast('دورك الحالي لا يسمح بالتصدير', 'error');
      return;
    }
    setBusy(kind);
    const base = tab === 'vouchers' ? `سندات-الصندوق` : `كشف-الإيرادات-والمصروفات`;
    const filename = `${safeFileName(settings.businessName)}-${base}`;
    const rows =
      tab === 'vouchers'
        ? [...exportMetaRows(settings, currentUser.name, currency), ...vouchersToRows(filteredVouchers, currency)]
        : [...exportMetaRows(settings, currentUser.name, currency), ...ledgerToRows(filteredLedger, currency)];
    const res = kind === 'csv' ? await exportCsv(`${filename}.csv`, rows) : await exportExcel(filename, rows, base);
    setBusy(null);
    showToast(
      res === 'failed' ? 'تعذر التصدير' : kind === 'excel' ? 'تم تصدير ملف Excel' : 'تم تصدير ملف CSV',
      res === 'failed' ? 'error' : 'success'
    );
  };

  if (!can(role, 'cash.view')) {
    return (
      <Screen>
        <ScreenHeader title={settings.labels.cash} subtitle="الصندوق والسندات المالية" onBack={() => nav.goBack()} />
        <View style={{ padding: SPACING.lg }}>
          <Notice tone="warning" icon="lock-closed" text="دورك الحالي لا يسمح بعرض حركة الصندوق - راجع المدير لمنح الصلاحية." />
        </View>
      </Screen>
    );
  }

  const monthVouchers = vouchers.filter((v) => monthKeyOf(v.date) === monthKey);
  const monthIn = monthVouchers.filter((v) => v.type === 'receipt').reduce((s, v) => s + v.amount, 0);
  const monthOut = monthVouchers.filter((v) => v.type === 'payment').reduce((s, v) => s + v.amount, 0);

  return (
    <Screen>
      <ScreenHeader
        title={settings.labels.cash}
        subtitle="سندات القبض والصرف وكشف الإيرادات والمصروفات اليومية"
        onBack={() => nav.goBack()}
      />
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md }}>
          <View style={{ flexDirection: 'row-reverse', gap: SPACING.md }}>
            <StatTile
              title="رصيد الصندوق"
              value={formatMoney(m.cashBalance, currency)}
              icon="wallet"
              tone={m.cashBalance >= 0 ? 'success' : 'danger'}
              subtitle={`${vouchers.length} سند مالي`}
            />
            <StatTile title="مقبوضات الشهر" value={formatMoney(monthIn, currency)} icon="arrow-down-circle" tone="primary" subtitle={m.monthLabel} />
          </View>
          <View style={{ flexDirection: 'row-reverse', gap: SPACING.md, marginTop: SPACING.md }}>
            <StatTile title="إجمالي المقبوضات" value={formatMoney(m.cashIn, currency)} icon="cash" tone="info" subtitle="كل الفترات" />
            <StatTile title="إجمالي المدفوعات" value={formatMoney(m.cashOut, currency)} icon="card" tone="warning" subtitle={`مدفوعات الشهر ${formatMoney(monthOut, currency)}`} />
          </View>

          <View style={{ marginTop: SPACING.lg }}>
            <Segmented<Tab>
              options={[
                { value: 'vouchers', label: settings.labels.vouchers },
                { value: 'ledger', label: 'الإيرادات والمصروفات' },
              ]}
              value={tab}
              onChange={(v) => {
                setTab(v);
                setQuery('');
              }}
            />
          </View>

          <View style={{ marginTop: SPACING.md }}>
            <SearchBar
              value={query}
              onChangeText={setQuery}
              placeholder={tab === 'vouchers' ? 'ابحث برقم السند أو الطرف أو البيان...' : 'ابحث في التصنيف أو البيان...'}
            />
          </View>

          {tab === 'vouchers' ? (
            <ChipRow>
              <Chip label="الكل" selected={vFilter === 'all'} onPress={() => setVFilter('all')} />
              <Chip label="سندات قبض" selected={vFilter === 'receipt'} onPress={() => setVFilter('receipt')} />
              <Chip label="سندات صرف" selected={vFilter === 'payment'} onPress={() => setVFilter('payment')} />
            </ChipRow>
          ) : (
            <ChipRow>
              <Chip label="الكل" selected={lFilter === 'all'} onPress={() => setLFilter('all')} />
              <Chip label="إيرادات" selected={lFilter === 'income'} onPress={() => setLFilter('income')} />
              <Chip label="مصروفات" selected={lFilter === 'expense'} onPress={() => setLFilter('expense')} />
            </ChipRow>
          )}

          <Card style={{ marginBottom: SPACING.md }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={[rtlText, { color: c.textFaint, fontSize: 11.5 }]}>
                  {tab === 'vouchers' ? `قبض ${formatMoney(sums.inSum, currency)} • صرف ${formatMoney(sums.outSum, currency)}` : `إيراد ${formatMoney(sums.inc, currency)} • مصروف ${formatMoney(sums.exp, currency)}`}
                </Text>
                <Text style={[rtlText, { color: c.text, fontSize: 13, fontWeight: '800', marginTop: 3 }]}>
                  {tab === 'vouchers' ? `${filteredVouchers.length} سند` : `${filteredLedger.length} قيد يومي`}
                </Text>
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: SPACING.sm }}>
                <Btn label="Excel" icon="grid-outline" variant="secondary" compact full={false} loading={busy === 'excel'} onPress={() => doExport('excel')} />
                <Btn label="CSV" icon="download-outline" variant="outline" compact full={false} loading={busy === 'csv'} onPress={() => doExport('csv')} />
              </View>
            </View>
          </Card>
        </View>

        {tab === 'vouchers' ? (
          <FlatList
            data={filteredVouchers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 170 }}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews={Platform.OS === 'android'}
            renderItem={({ item }) => <VoucherRow voucher={item} onPress={() => nav.navigate('VoucherDetail', { voucherId: item.id })} />}
            ListEmptyComponent={
              <Card>
                <EmptyState
                  icon="receipt-outline"
                  title="لا توجد سندات مالية"
                  body="أصدر سند قبض عند تحصيل أي مبلغ من العملاء، أو سند صرف لأي مدفوعة"
                  actionLabel={can(role, 'cash.create') ? 'سند جديد' : undefined}
                  onAction={can(role, 'cash.create') ? () => nav.navigate('CashForm') : undefined}
                />
              </Card>
            }
          />
        ) : (
          <FlatList
            data={filteredLedger}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 170 }}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews={Platform.OS === 'android'}
            renderItem={({ item }) => (
              <LedgerRow
                entry={item}
                onDelete={
                  can(role, 'cash.delete')
                    ? () => {
                        deleteLedgerEntry(item.id);
                        showToast('تم حذف القيد اليومي', 'info');
                      }
                    : undefined
                }
              />
            )}
            ListEmptyComponent={
              <Card>
                <EmptyState
                  icon="list-outline"
                  title="لا توجد قيود يومية"
                  body="سجّل الإيرادات والمصروفات اليومية ليظهر كشف المصروفات والإيرادات في التقارير"
                  actionLabel={can(role, 'cash.create') ? 'قيد جديد' : undefined}
                  onAction={can(role, 'cash.create') ? () => nav.navigate('CashForm', { mode: 'ledger' }) : undefined}
                />
              </Card>
            }
          />
        )}
      </View>
      {can(role, 'cash.create') ? <FAB icon="add" label="حركة جديدة" onPress={() => nav.navigate('CashForm', { mode: tab })} /> : null}
    </Screen>
  );
}

export function VoucherRow({ voucher, onPress }: { voucher: Voucher; onPress?: () => void }) {
  const { currency } = useApp();
  const c = usePalette();
  const isReceipt = voucher.type === 'receipt';
  return (
    <Card onPress={onPress} style={{ marginBottom: SPACING.md }}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: RADIUS.md,
            backgroundColor: isReceipt ? c.successSoft : c.dangerSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={isReceipt ? 'arrow-down-circle' : 'arrow-up-circle'} size={20} color={isReceipt ? c.success : c.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
            <Text style={[rtlText, { flex: 1, color: c.text, fontSize: 14, fontWeight: '800' }]} numberOfLines={2}>
              {voucher.partyName || (isReceipt ? 'سند قبض' : 'سند صرف')}
            </Text>
            <Text style={[rtlText, { color: isReceipt ? c.success : c.danger, fontSize: 14.5, fontWeight: '800' }]}>
              {isReceipt ? '+' : '-'} {formatMoney(voucher.amount, currency)}
            </Text>
          </View>
          <Text style={[rtlText, { color: c.textMuted, fontSize: 12, marginTop: 4 }]} numberOfLines={2}>
            {voucher.reason || '—'}
          </Text>
          <View style={{ flexDirection: 'row-reverse', gap: 10, marginTop: 7, flexWrap: 'wrap' }}>
            <Text style={[rtlText, { color: c.textFaint, fontSize: 11 }]}>{voucher.number}</Text>
            <Text style={[rtlText, { color: c.textFaint, fontSize: 11 }]}>{formatDateShort(voucher.date)}</Text>
            <Text style={[rtlText, { color: c.textFaint, fontSize: 11 }]}>{PAYMENT_METHOD_LABELS[voucher.method]}</Text>
            {voucher.invoiceId ? <Text style={[rtlText, { color: c.primary, fontSize: 11, fontWeight: '700' }]}>مرتبط بفاتورة</Text> : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

function LedgerRow({ entry, onDelete }: { entry: LedgerEntry; onDelete?: () => void }) {
  const { currency } = useApp();
  const c = usePalette();
  const isIncome = entry.kind === 'income';
  return (
    <Card style={{ marginBottom: SPACING.md }}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: RADIUS.md,
            backgroundColor: isIncome ? c.primarySoft : c.warningSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={isIncome ? 'trending-up' : 'trending-down'} size={18} color={isIncome ? c.primaryText : c.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
            <Text style={[rtlText, { flex: 1, color: c.text, fontSize: 13.5, fontWeight: '800' }]} numberOfLines={2}>
              {entry.category}
            </Text>
            <Text style={[rtlText, { color: isIncome ? c.success : c.danger, fontSize: 14, fontWeight: '800' }]}>
              {isIncome ? '+' : '-'} {formatMoney(entry.amount, currency)}
            </Text>
          </View>
          {entry.description ? (
            <Text style={[rtlText, { color: c.textMuted, fontSize: 12, marginTop: 4 }]} numberOfLines={2}>
              {entry.description}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row-reverse', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            <Text style={[rtlText, { color: c.textFaint, fontSize: 11 }]}>{formatDateShort(entry.date)}</Text>
            <Text style={[rtlText, { color: c.textFaint, fontSize: 11 }]}>{PAYMENT_METHOD_LABELS[entry.method]}</Text>
            <Text style={[rtlText, { color: c.textFaint, fontSize: 11 }]}>{entry.createdBy}</Text>
          </View>
        </View>
        {onDelete ? (
          <Ionicons name="trash-outline" size={17} color={c.danger} onPress={onDelete} suppressHighlighting />
        ) : null}
      </View>
    </Card>
  );
}
