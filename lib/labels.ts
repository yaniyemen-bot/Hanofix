import { AppLabels } from './types';

/** التسميات الافتراضية للقوائم والمسميات الإدارية - يمكن للمدير تعديلها من لوحة التحكم */
export const DEFAULT_LABELS: AppLabels = {
  home: 'الرئيسية',
  works: 'الأعمال',
  invoices: 'الفواتير',
  companies: 'الشركات',
  more: 'المزيد',
  cash: 'حركة الصندوق',
  vouchers: 'السندات المالية',
  reports: 'التقارير',
  alerts: 'التنبيهات',
  users: 'المسؤولون',
  settings: 'الإعدادات',
  currency: 'العملة',
  apk: 'تنزيل APK',
};

export const LABEL_FIELDS: { key: keyof AppLabels; title: string; hint: string }[] = [
  { key: 'home', title: 'تبويب الرئيسية', hint: 'اللوحة الرئيسية والمؤشرات' },
  { key: 'works', title: 'تبويب الأعمال', hint: 'الأعمال اليومية' },
  { key: 'invoices', title: 'تبويب الفواتير', hint: 'الفواتير الشهرية' },
  { key: 'companies', title: 'تبويب الشركات', hint: 'الشركات والعملاء' },
  { key: 'more', title: 'تبويب المزيد', hint: 'القائمة الإدارية' },
  { key: 'cash', title: 'شاشة حركة الصندوق', hint: 'الصندوق والسندات' },
  { key: 'vouchers', title: 'مسمى السندات المالية', hint: 'سند قبض / سند صرف' },
  { key: 'reports', title: 'شاشة التقارير', hint: 'التقارير والتحليل المالي' },
  { key: 'alerts', title: 'شاشة التنبيهات', hint: 'الإشعارات والتنبيهات' },
  { key: 'users', title: 'شاشة المسؤولين', hint: 'تعيين وتسمية المسؤولين' },
  { key: 'settings', title: 'شاشة الإعدادات', hint: 'الإعدادات العامة' },
  { key: 'currency', title: 'شاشة العملة', hint: 'نوع العملة' },
  { key: 'apk', title: 'شاشة تنزيل APK', hint: 'نسخة أندرويد' },
];

export function normalizeLabels(raw: any): AppLabels {
  const out = { ...DEFAULT_LABELS };
  if (!raw || typeof raw !== 'object') return out;
  (Object.keys(DEFAULT_LABELS) as (keyof AppLabels)[]).forEach((k) => {
    const v = raw[k];
    if (typeof v === 'string' && v.trim().length) out[k] = v.trim().slice(0, 24);
  });
  return out;
}
