import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, usePalette } from '../lib/theme';
import { useApp, useMetrics } from '../state/AppContext';
import { Btn, Card, Chip, ChipRow, EmptyState, Screen, ScreenHeader, SectionHeader, StatTile, rtlText } from '../components/ui';
import { BarChart, GroupedBarChart, RankedList, StackedBar } from '../components/Charts';
import { exportCsv, exportExcel, exportMetaRows, safeFileName } from '../lib/exporters';
import { currentMonthKey, formatMoney, formatNumber, invoiceRemaining, lastMonthKeys, monthKeyOf, monthLabel, monthLabelShort, round2 } from '../lib/format';
import { can } from '../lib/permissions';

type PeriodKey = '1' | '3' | '6' | 'all';

export default function ReportsScreen() {
  const c = usePalette();
  const nav = useNavigation<any>();
  const { works, invoices, companies, currency, role, showToast, workTotal, settings, currentUser, ledger, vouchers } = useApp();
  const m = useMetrics();
  const [period, setPeriod] = useState<PeriodKey>('6');
  const [busy, setBusy] = useState<string | null>(null);

  const months = useMemo(() => {
    if (period === 'all') {
      const keys = new Set([...works.map((w) => monthKeyOf(w.date)), ...ledger.map((l) => monthKeyOf(l.date))]);
      return [...keys].sort();
    }
    return lastMonthKeys(Number(period));
  }, [period, works, ledger]);

  const stats = useMemo(() => {
    const inPeriod = works.filter((w) => months.includes(monthKeyOf(w.date)));
    const revenue = inPeriod.reduce((s, w) => s + workTotal(w), 0);
    const periodInvoices = invoices.filter((i) => months.includes(monthKeyOf(i.issueDate)));
    const invoiced = periodInvoices.reduce((s, i) => s + i.total, 0);
    const collected = round2(periodInvoices.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0));
    const periodLedger = ledger.filter((l) => months.includes(monthKeyOf(l.date)));
    const ledgerIncome = round2(periodLedger.filter((l) => l.kind === 'income').reduce((s, l) => s + l.amount, 0));
    const ledgerExpense = round2(periodLedger.filter((l) => l.kind === 'expense').reduce((s, l) => s + l.amount, 0));
    const outstanding = round2(invoices.filter((i) => i.status === 'issued' || i.status === 'partial').reduce((s, i) => s + invoiceRemaining(i), 0));
    const expenseByCategory = periodLedger
      .filter((l) => l.kind === 'expense')
      .reduce<{ label: string; value: number }[]>((acc, l) => {
        const found = acc.find((a) => a.label === l.category);
        if (found) found.value = round2(found.value + l.amount);
        else acc.push({ label: l.category, value: round2(l.amount) });
        return acc;
      }, [])
      .sort((a, b) => b.value - a.value);
    const byCompany = new Map<string, { total: number; count: number }>();
    inPeriod.forEach((w) => {
      const e = byCompany.get(w.companyId) ?? { total: 0, count: 0 };
      e.total += workTotal(w);
      e.count += 1;
      byCompany.set(w.companyId, e);
    });
    const top = [...byCompany.entries()]
      .map(([id, v]) => ({
        label: companies.find((x) => x.id === id)?.name ?? 'عميل',
        value: v.total,
        hint: `${v.count} عمل في الفترة`,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const monthly = months.map((k) => {
      const mw = works.filter((w) => monthKeyOf(w.date) === k);
      const mi = invoices.filter((i) => monthKeyOf(i.issueDate) === k);
      const ml = ledger.filter((l) => monthKeyOf(l.date) === k);
      const revenue = round2(mw.reduce((s, w) => s + workTotal(w), 0));
      const otherIncome = round2(ml.filter((l) => l.kind === 'income').reduce((s, l) => s + l.amount, 0));
      const expense = round2(ml.filter((l) => l.kind === 'expense').reduce((s, l) => s + l.amount, 0));
      return {
        key: k,
        label: monthLabel(k),
        revenue,
        otherIncome,
        expense,
        income: round2(revenue + otherIncome),
        net: round2(revenue + otherIncome - expense),
        count: mw.length,
        collected: round2(mi.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0)),
        invoiced: round2(mi.reduce((s, i) => s + i.total, 0)),
      };
    });

    return {
      revenue: round2(revenue),
      count: inPeriod.length,
      invoiced: round2(invoiced),
      collected,
      outstanding,
      ledgerIncome,
      ledgerExpense,
      totalIncome: round2(revenue + ledgerIncome),
      netProfit: round2(revenue + ledgerIncome - ledgerExpense),
      collectionRate: invoiced ? Math.round((collected / invoiced) * 100) : 0,
      avgInvoice: periodInvoices.length ? invoiced / periodInvoices.length : 0,
      top,
      monthly,
      expenseByCategory,
      statusCounts: {
        paid: invoices.filter((i) => i.status === 'paid').length,
        partial: invoices.filter((i) => i.status === 'partial').length,
        issued: invoices.filter((i) => i.status === 'issued').length,
        draft: invoices.filter((i) => i.status === 'draft').length,
      },
    };
  }, [works, invoices, companies, months, workTotal, ledger]);

  const buildRows = (): (string | number)[][] => [
    ...exportMetaRows(settings, currentUser.name, currency),
    ['الشهر', 'عدد الأعمال', 'إيراد الأعمال', 'إيرادات أخرى', 'إجمالي الإيرادات', 'المصروفات', 'الصافي', 'عدد الفواتير', 'قيمة الفواتير', 'المحصّل', 'العملة', 'المسؤول'],
    ...stats.monthly.map((r) => [
      r.label,
      r.count,
      r.revenue,
      r.otherIncome,
      r.income,
      r.expense,
      r.net,
      invoices.filter((i) => monthKeyOf(i.issueDate) === r.key).length,
      r.invoiced,
      r.collected,
      currency.code,
      currentUser.name,
    ]),
    [],
    ['الإجمالي', stats.count, stats.revenue, stats.ledgerIncome, stats.totalIncome, stats.ledgerExpense, stats.netProfit, invoices.length, stats.invoiced, stats.collected, currency.code, currentUser.name],
    [],
    ['كشف المصروفات حسب التصنيف'],
    ['التصنيف', 'المبلغ', 'العملة'],
    ...stats.expenseByCategory.map((e) => [e.label, e.value, currency.code]),
  ];

  const doExport = async (kind: 'csv' | 'excel') => {
    if (!can(role, 'export.data')) {
      showToast('دورك الحالي لا يسمح بالتصدير', 'error');
      return;
    }
    setBusy(kind);
    const rows = buildRows();
    const base = `${safeFileName(settings.businessName)}-report`;
    const res =
      kind === 'csv'
        ? await exportCsv(`${base}.csv`, rows)
        : await exportExcel(base, rows, 'التقرير المالي - الإيرادات والمصروفات');
    setBusy(null);
    showToast(
      res === 'failed' ? 'تعذر تصدير التقرير' : kind === 'excel' ? 'تم تصدير التقرير بصيغة Excel' : 'تم تصدير التقرير الشهري',
      res === 'failed' ? 'error' : 'success'
    );
  };

  return (
    <Screen>
      <ScreenHeader title={settings.labels.reports} subtitle="رؤية شاملة للإيرادات والمصروفات وأداء أعمالك" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <ChipRow>
          {([
            { k: '1', l: 'هذا الشهر' },
            { k: '3', l: 'آخر 3 أشهر' },
            { k: '6', l: 'آخر 6 أشهر' },
            { k: 'all', l: 'كل الفترات' },
          ] as { k: PeriodKey; l: string }[]).map((o) => (
            <Chip key={o.k} label={o.l} selected={period === o.k} onPress={() => setPeriod(o.k)} />
          ))}
        </ChipRow>

        <View style={{ flexDirection: 'row-reverse', gap: SPACING.md, marginTop: SPACING.sm }}>
          <StatTile title="إجمالي الإيرادات" value={formatMoney(stats.totalIncome, currency)} icon="cash" tone="primary" subtitle={`أعمال ${formatMoney(stats.revenue, currency)} + يومية ${formatMoney(stats.ledgerIncome, currency)}`} />
          <StatTile title="إجمالي المصروفات" value={formatMoney(stats.ledgerExpense, currency)} icon="trending-down" tone="danger" subtitle={`${stats.expenseByCategory.length} تصنيف مصروفات`} />
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: SPACING.md, marginTop: SPACING.md }}>
          <StatTile title="صافي الربح" value={formatMoney(stats.netProfit, currency)} icon="pie-chart" tone={stats.netProfit >= 0 ? 'success' : 'danger'} subtitle="الإيرادات - المصروفات" />
          <StatTile title="نسبة التحصيل" value={`${stats.collectionRate}%`} icon="wallet" tone="info" subtitle={`محصّل ${formatMoney(stats.collected, currency)} • متبقي ${formatMoney(stats.outstanding, currency)}`} />
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: SPACING.md, marginTop: SPACING.md }}>
          <StatTile title="متوسط الفاتورة" value={formatMoney(stats.avgInvoice, currency)} icon="receipt" tone="info" subtitle={`${invoices.length} فاتورة`} />
          <StatTile title="غير مفوتر" value={formatMoney(m.unbilledTotal, currency)} icon="alert-circle" tone={m.unbilledTotal ? 'warning' : 'success'} subtitle={`${m.unbilled.length} عمل`} />
        </View>

        <SectionHeader title="كشف المصروفات والإيرادات" icon="swap-vertical-outline" />
        <Card>
          <GroupedBarChart
            data={stats.monthly.slice(-8).map((r) => ({ label: monthLabelShort(r.key), income: r.income, expense: r.expense }))}
            formatValue={(v) => (Math.abs(v) >= 1000 ? `${formatNumber(Math.round(v / 1000))}k` : formatNumber(Math.round(v)))}
            height={170}
          />
        </Card>

        <SectionHeader title="تطور الإيرادات" icon="bar-chart-outline" />
        <Card>
          <BarChart
            data={stats.monthly.slice(-8).map((r, idx, arr) => ({ label: monthLabelShort(r.key), value: r.revenue, highlight: idx === arr.length - 1 }))}
            formatValue={(v) => (v >= 1000 ? `${formatNumber(Math.round(v / 1000))}k` : formatNumber(Math.round(v)))}
            height={160}
          />
        </Card>

        <SectionHeader title="أعلى العملاء إيرادًا (الكل)" icon="trophy-outline" />
        <Card>
          <RankedList items={stats.top} formatValue={(v) => formatMoney(v, currency)} />
        </Card>

        <SectionHeader title="المصروفات حسب التصنيف" icon="pricetags-outline" />
        <Card>
          <RankedList items={stats.expenseByCategory} formatValue={(v) => formatMoney(v, currency)} />
        </Card>

        <SectionHeader title="توزيع الفواتير حسب الحالة" icon="pie-chart-outline" />
        <Card>
          <StackedBar
            total={stats.statusCounts.paid + stats.statusCounts.partial + stats.statusCounts.issued + stats.statusCounts.draft}
            segments={[
              { label: 'مدفوعة', value: stats.statusCounts.paid, color: c.success },
              { label: 'جزئية', value: stats.statusCounts.partial, color: c.info },
              { label: 'مستحقة', value: stats.statusCounts.issued, color: c.warning },
              { label: 'مسودة', value: stats.statusCounts.draft, color: c.textFaint },
            ]}
          />
        </Card>

        <SectionHeader title="التقرير الشهري" icon="calendar-outline" />
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row-reverse', backgroundColor: c.surfaceAlt, paddingVertical: 10, paddingHorizontal: SPACING.md }}>
            <Text style={[rtlText, { flex: 1.2, color: c.textMuted, fontSize: 11, fontWeight: '800' }]}>الشهر</Text>
            <Text style={[rtlText, { flex: 1, color: c.textMuted, fontSize: 11, fontWeight: '800', textAlign: 'center' }]}>الإيرادات</Text>
            <Text style={[rtlText, { flex: 1, color: c.textMuted, fontSize: 11, fontWeight: '800', textAlign: 'center' }]}>المصروفات</Text>
            <Text style={[rtlText, { flex: 1, color: c.textMuted, fontSize: 11, fontWeight: '800', textAlign: 'left' }]}>الصافي</Text>
          </View>
          {stats.monthly.length === 0 ? (
            <View style={{ padding: SPACING.lg }}>
              <Text style={[rtlText, { color: c.textFaint, fontSize: 13, textAlign: 'center' }]}>لا توجد أعمال في هذه الفترة</Text>
            </View>
          ) : (
            stats.monthly
              .slice()
              .reverse()
              .map((r) => (
                <View
                  key={r.key}
                  style={{
                    flexDirection: 'row-reverse',
                    alignItems: 'center',
                    paddingVertical: 12,
                    paddingHorizontal: SPACING.md,
                    borderTopWidth: 1,
                    borderTopColor: c.borderSoft,
                  }}
                >
                  <Text style={[rtlText, { flex: 1.2, color: c.text, fontSize: 12, fontWeight: '700' }]} numberOfLines={2}>
                    {r.label}
                  </Text>
                  <Text
                    style={[rtlText, { flex: 1, color: c.primaryText, fontSize: 11.5, fontWeight: '800', textAlign: 'center' }]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {formatMoney(r.income, currency)}
                  </Text>
                  <Text
                    style={[rtlText, { flex: 1, color: c.danger, fontSize: 11.5, fontWeight: '800', textAlign: 'center' }]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {formatMoney(r.expense, currency)}
                  </Text>
                  <Text
                    style={[rtlText, { flex: 1, color: r.net >= 0 ? c.success : c.danger, fontSize: 11.5, fontWeight: '800', textAlign: 'left' }]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {formatMoney(r.net, currency)}
                  </Text>
                </View>
              ))
          )}
        </Card>

        <SectionHeader title="ملخص الأداء" icon="pulse-outline" />
        <Card>
          <SummaryRow icon="business-outline" label="إجمالي العملاء" value={`${companies.length}`} />
          <SummaryRow icon="hammer-outline" label="إجمالي الأعمال المسجلة" value={`${works.length}`} />
          <SummaryRow icon="document-text-outline" label="إجمالي الفواتير" value={`${invoices.length}`} />
          <SummaryRow icon="receipt-outline" label="السندات المالية" value={`${vouchers.length} سند`} />
          <SummaryRow icon="wallet-outline" label="رصيد الصندوق" value={formatMoney(m.cashBalance, currency)} />
          <SummaryRow icon="cash-outline" label="إجمالي الفواتير المحصلة" value={formatMoney(m.collected, currency)} />
          <SummaryRow icon="trending-down-outline" label="إجمالي المصروفات" value={formatMoney(stats.ledgerExpense, currency)} />
          <SummaryRow icon="alert-circle-outline" label="أعمال غير مفوترة" value={`${m.unbilled.length} • ${formatMoney(m.unbilledTotal, currency)}`} last />
        </Card>

        <View style={{ marginTop: SPACING.xl, gap: SPACING.md }}>
          <Btn label="تصدير Excel" icon="grid-outline" onPress={() => doExport('excel')} loading={busy === 'excel'} />
          <Btn label="تصدير CSV" icon="download-outline" variant="secondary" onPress={() => doExport('csv')} loading={busy === 'csv'} />
          <Btn label="حركة الصندوق والسندات" icon="wallet-outline" variant="outline" onPress={() => nav.navigate('Cash')} />
          <Btn label="عرض التنبيهات" icon="notifications-outline" variant="outline" onPress={() => nav.navigate('Alerts')} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  const c = usePalette();
  return (
    <View
      style={{
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: SPACING.md,
        paddingVertical: 11,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.borderSoft,
      }}
    >
      <Ionicons name={icon} size={16} color={c.textFaint} />
      <Text style={[rtlText, { flex: 1, color: c.textMuted, fontSize: 13, fontWeight: '600' }]}>{label}</Text>
      <Text style={[rtlText, { color: c.text, fontSize: 13.5, fontWeight: '800' }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
