const fs = require('fs');

function backupFile(path) {
  if (fs.existsSync(path)) {
    fs.copyFileSync(path, path + '.bak');
  }
}

// 1. Fix components/ui.tsx (StatTile equal width, KeyboardAvoidingView, Dropdown for Segmented, StickyFooter padding)
backupFile('components/ui.tsx');
let ui = fs.readFileSync('components/ui.tsx', 'utf8');

// Add Modal import if missing
if (!ui.includes('Modal,') && !ui.includes('Modal }')) {
  ui = ui.replace("from 'react-native';", ", Modal } from 'react-native';").replace(", , Modal", ", Modal");
}

// Fix KeyboardAvoidingView in Screen
ui = ui.replace(
  /\{keyboard && Platform\.OS !== 'web' \? \(\s*<KeyboardAvoidingView style=\{\{ flex: 1 \}\} behavior="padding">/g,
  `{Platform.OS !== 'web' ? (\n      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}>`
);

// Increase ScrollView bottom padding so inputs & buttons never hide behind keyboard or tab bar
ui = ui.replace(
  /paddingBottom: Math\.max\(insets\.bottom, Platform\.OS === 'ios' \? 0 : 12\) \+ 24/g,
  `paddingBottom: Math.max(insets.bottom, 16) + 140`
);

// Fix Card Pressable flex wrapper for StatTile
ui = ui.replace(
  /<Card onPress=\{onPress\} style=\{\{ flex: 1[^}]*\}\}>/g,
  `<View style={{ flex: 1, flexBasis: 0, minWidth: 0 }}><Card onPress={onPress} style={{ flex: 1, width: '100%' }}>`
);
ui = ui.replace(
  /(\{subtitle \? \([\s\S]*?<\/Card>\s*\)\s*;\s*\})/m,
  (match) => match.replace('</Card>', '</Card></View>')
);

// Replace Segmented with clean Dropdown Select on mobile / multi-option tabs
const segmentedRegex = /export function Segmented<T extends string>\(\{[\s\S]*?\n\}\n/;
const dropdownSegmented = `export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = usePalette();
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];

  if (options.length <= 2) {
    return (
      <View
        style={{
          flexDirection: 'row-reverse',
          backgroundColor: c.surfaceAlt,
          borderRadius: RADIUS.md,
          padding: 4,
          borderWidth: 1,
          borderColor: c.border,
          gap: 4,
        }}
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              style={{
                flex: 1,
                paddingVertical: 9,
                borderRadius: RADIUS.sm,
                backgroundColor: active ? c.surface : 'transparent',
                alignItems: 'center',
              }}
            >
              <Text style={[rtlText, { color: active ? c.primaryText : c.textMuted, fontSize: 13, fontWeight: '800' }]}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={{ marginVertical: 2 }}>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row-reverse',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: c.borderStrong,
          borderRadius: RADIUS.md,
          paddingHorizontal: 14,
          paddingVertical: 11,
        }}
      >
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="filter-outline" size={17} color={c.primary} />
          <Text style={[rtlText, { color: c.text, fontSize: 13.5, fontWeight: '800' }]}>
            {current?.label ?? 'اختر'}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={c.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: c.surface,
              borderRadius: RADIUS.lg,
              padding: 12,
              borderWidth: 1,
              borderColor: c.border,
            }}
          >
            <Text style={[rtlText, { color: c.textMuted, fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 6 }]}>
              اختر التصنيف
            </Text>
            {options.map((o) => {
              const active = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={{
                    flexDirection: 'row-reverse',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    borderRadius: RADIUS.md,
                    backgroundColor: active ? c.primarySoft : 'transparent',
                  }}
                >
                  <Text style={[rtlText, { color: active ? c.primaryText : c.text, fontSize: 14, fontWeight: active ? '800' : '600' }]}>
                    {o.label}
                  </Text>
                  {active ? <Ionicons name="checkmark-circle" size={19} color={c.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
`;
if (segmentedRegex.test(ui)) {
  ui = ui.replace(segmentedRegex, dropdownSegmented);
}
fs.writeFileSync('components/ui.tsx', ui);
console.log('✓ 1. Updated components/ui.tsx (StatTile, Keyboard, Dropdown)');

// 2. Fix lib/exporters.ts (Invoice grand total = remaining after paid, Real .xlsx export)
backupFile('lib/exporters.ts');
let exp = fs.readFileSync('lib/exporters.ts', 'utf8');

// Fix Invoice Grand Total to show remaining due after subtracting paid amount
exp = exp.replace(
  /<div class="grand"><span>الإجمالي المستحق<\/span><span>\$\{escapeHtml\(formatMoney\(invoice\.total, currency\)\)\}<\/span><\/div>/g,
  `<div class="grand"><span>الإجمالي المستحق (المتبقي)</span><span>\${escapeHtml(formatMoney(Math.max(0, Number(invoice.remaining ?? (invoice.total - (invoice.paidAmount || 0)))), currency))}</span></div>`
);

// Upgrade exportExcel to real XLSX workbook using SheetJS
const xlsxUpgrade = `
import * as XLSX from 'xlsx';
`;
if (!exp.includes("from 'xlsx'")) {
  exp = xlsxUpgrade + exp;
}

const exportExcelRegex = /export async function exportExcel\([\s\S]*?\n\}\n/;
const newExportExcel = `export async function exportExcel(
  filename: string,
  title: string,
  headers: string[],
  rows: (string | number)[][]
) {
  const safeName = filename.replace(/\\.(xls|xlsx|csv)$/i, '') + '.xlsx';
  const wsData = [[title], [], headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = headers.map((h, idx) => {
    const maxLen = Math.max(
      String(h || '').length,
      ...rows.map((r) => String(r[idx] ?? '').length)
    );
    return { wch: Math.min(45, Math.max(14, maxLen + 4)) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'البيانات');

  if (Platform.OS === 'web') {
    XLSX.writeFile(wb, safeName);
    return;
  }

  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + safeName;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: title,
    });
  }
}
`;
if (exportExcelRegex.test(exp)) {
  exp = exp.replace(exportExcelRegex, newExportExcel);
}
fs.writeFileSync('lib/exporters.ts', exp);
console.log('✓ 2. Updated lib/exporters.ts (Invoice remaining due + Real XLSX export)');

// 3. Fix screens/InvoiceDetailScreen.tsx (Show remaining due instead of total before payment)
backupFile('screens/InvoiceDetailScreen.tsx');
let invScreen = fs.readFileSync('screens/InvoiceDetailScreen.tsx', 'utf8');
invScreen = invScreen.replace(
  /total=\{invoice\.total\}/g,
  'total={Math.max(0, Number(invoice.remaining ?? (invoice.total - (invoice.paidAmount || 0))))}'
);
fs.writeFileSync('screens/InvoiceDetailScreen.tsx', invScreen);
console.log('✓ 3. Updated screens/InvoiceDetailScreen.tsx');

// 4. Fix lib/seed.ts (Clear default companies, works, invoices, vouchers, ledger)
backupFile('lib/seed.ts');
let seed = fs.readFileSync('lib/seed.ts', 'utf8');
seed = seed.replace(
  /return \{\s*version:[\s\S]*?\};/,
  `return {
    version: 1,
    users,
    currentUserId: users[0].id,
    settings,
    companies: [],
    works: [],
    invoices: [],
    vouchers: [],
    ledger: [],
  };`
);
fs.writeFileSync('lib/seed.ts', seed);
console.log('✓ 4. Cleared demo seed data in lib/seed.ts');

console.log('ALL CORE PATCHES APPLIED SUCCESSFULLY!');
