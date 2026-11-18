import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, usePalette } from '../lib/theme';
import { useApp } from '../state/AppContext';
import { Btn, Card, Field, Notice, Screen, ScreenHeader, SectionHeader, StickyFooter, rtlText } from '../components/ui';
import { DEFAULT_LABELS, LABEL_FIELDS } from '../lib/labels';
import { AppLabels } from '../lib/types';
import { can } from '../lib/permissions';

export default function LabelsScreen() {
  const c = usePalette();
  const nav = useNavigation<any>();
  const { settings, updateSettings, role, showToast } = useApp();
  const editable = can(role, 'labels.edit');
  const [draft, setDraft] = useState<AppLabels>({ ...settings.labels });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: keyof AppLabels, value: string) => {
    setDraft((d) => ({ ...d, [key]: value.slice(0, 24) }));
    setErrors((e) => ({ ...e, [key]: '' }));
  };

  const save = () => {
    if (!editable) {
      showToast('دورك الحالي لا يسمح بتعديل المسميات', 'error');
      return;
    }
    const e: Record<string, string> = {};
    LABEL_FIELDS.forEach((f) => {
      if (!draft[f.key].trim()) e[f.key] = 'التسمية مطلوبة';
    });
    setErrors(e);
    if (Object.keys(e).length) {
      showToast('بعض التسميات فارغة', 'error');
      return;
    }
    const cleaned = { ...draft };
    LABEL_FIELDS.forEach((f) => {
      cleaned[f.key] = draft[f.key].trim();
    });
    updateSettings({ labels: cleaned });
    showToast('تم حفظ التسميات الجديدة للقوائم');
    nav.goBack();
  };

  return (
    <Screen>
      <ScreenHeader
        title="تسمية القوائم والمسميات الإدارية"
        subtitle="مرونة كاملة للمدير في تسمية التبويبات والشاشات"
        onBack={() => nav.goBack()}
      />
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 150 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {!editable ? (
          <Notice tone="warning" icon="lock-closed" text="تعديل المسميات متاح للمدير فقط - يمكنك المعاينة." />
        ) : (
          <Notice
            tone="primary"
            icon="text-outline"
            text="عدّل أسماء القوائم والتبويبات والشاشات لتناسب طبيعة نشاطك (مثال: «العملاء» بدل «الشركات»، «الحملات» بدل «الأعمال»). تظهر التسميات فورًا في التبويبات والقوائم والعناوين."
          />
        )}

        <SectionHeader title="التبويبات السفلية" icon="apps-outline" />
        <Card style={{ marginBottom: SPACING.lg }}>
          {LABEL_FIELDS.slice(0, 5).map((f) => (
            <Field
              key={f.key}
              label={f.title}
              value={draft[f.key]}
              onChangeText={(t) => set(f.key, t)}
              placeholder={DEFAULT_LABELS[f.key]}
              maxLength={24}
              editable={editable}
              hint={f.hint}
              error={errors[f.key]}
            />
          ))}
        </Card>

        <SectionHeader title="الشاشات الإدارية والمالية" icon="options-outline" />
        <Card style={{ marginBottom: SPACING.lg }}>
          {LABEL_FIELDS.slice(5).map((f) => (
            <Field
              key={f.key}
              label={f.title}
              value={draft[f.key]}
              onChangeText={(t) => set(f.key, t)}
              placeholder={DEFAULT_LABELS[f.key]}
              maxLength={24}
              editable={editable}
              hint={f.hint}
              error={errors[f.key]}
            />
          ))}
        </Card>

        <Card style={{ marginBottom: SPACING.lg }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: SPACING.md }}>
            <View style={{ width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="eye-outline" size={19} color={c.primaryText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[rtlText, { color: c.text, fontSize: 13.5, fontWeight: '800' }]}>معاينة التبويبات</Text>
              <View style={{ flexDirection: 'row-reverse', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {[draft.home, draft.works, draft.invoices, draft.companies, draft.more].map((l, i) => (
                  <View key={i} style={{ backgroundColor: c.surfaceAlt, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={[rtlText, { color: c.textMuted, fontSize: 11.5, fontWeight: '700' }]} numberOfLines={1}>
                      {l || '—'}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </Card>

        {editable ? (
          <Btn
            label="استعادة التسميات الافتراضية"
            icon="refresh-outline"
            variant="outline"
            onPress={() => {
              setDraft({ ...DEFAULT_LABELS });
              setErrors({});
              showToast('تمت استعادة التسميات الافتراضية - احفظ للتطبيق', 'info');
            }}
          />
        ) : null}
      </ScrollView>

      {editable ? (
        <StickyFooter>
          <View style={{ flex: 2 }}>
            <Btn label="حفظ التسميات" icon="checkmark" onPress={save} />
          </View>
          <View style={{ flex: 1 }}>
            <Btn label="إلغاء" variant="outline" onPress={() => nav.goBack()} />
          </View>
        </StickyFooter>
      ) : null}
    </Screen>
  );
}
