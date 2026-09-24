import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SoundocToggle } from './SoundocToggle';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space, type } from '../lib/theme';
import { formatNotificationTime } from '../lib/notificationPreferences';
import type { NotificationPermissionState, NotificationPreferences } from '../types/notifications';

type Picker = 'continue-time' | 'cadence' | 'weekly-day' | 'weekly-time' | null;
type Props = {
  preferences: NotificationPreferences;
  permission: NotificationPermissionState;
  onChange: (value: Partial<NotificationPreferences>) => void;
  onRequestPermission: () => void | Promise<void>;
  onOpenSystemSettings: () => void;
};

const timeOptions = [{ hour: 8, minute: 0 }, { hour: 12, minute: 0 }, { hour: 18, minute: 0 }, { hour: 20, minute: 0 }];
const weekdays = [{ value: 1 as const, label: 'Sunday' }, { value: 2 as const, label: 'Monday' }, { value: 3 as const, label: 'Tuesday' }, { value: 4 as const, label: 'Wednesday' }, { value: 5 as const, label: 'Thursday' }, { value: 6 as const, label: 'Friday' }, { value: 7 as const, label: 'Saturday' }];

export function NotificationSettingsSection({ preferences, permission, onChange, onRequestPermission, onOpenSystemSettings }: Props) {
  const [picker, setPicker] = useState<Picker>(null);
  const enabled = preferences.enabled && permission.granted;
  const statusCopy = permission.status === 'denied'
    ? 'Turn on reminders in your device settings.'
    : permission.status === 'provisional'
      ? 'Quiet reminders in Notification Center.'
      : 'On-device reminders. No account needed.';

  const toggleMaster = (value: boolean) => {
    if (!value) { onChange({ enabled: false }); return; }
    if (permission.granted) onChange({ enabled: true });
    else void onRequestPermission();
  };

  return <SectionShell title="Notifications">
    <View style={styles.introRow}>
      <View style={styles.icon}><Text style={styles.iconText}>⌁</Text></View>
      <View style={styles.copy}><Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Reminders</Text><Text style={styles.detail}>{statusCopy}</Text></View>
      <SoundocToggle compact value={enabled} onValueChange={toggleMaster} accessibilityLabel="Helpful notifications" accessibilityHint={enabled ? 'Turns Soundoc reminders off' : 'Turns on quiet Soundoc reminders'} />
    </View>
    {permission.status === 'denied' && <Pressable onPress={onOpenSystemSettings} style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Open notification settings"><Text style={styles.settingsButtonText}>Open notification settings</Text><Text style={styles.chevron}>›</Text></Pressable>}
    {enabled && <>
      <ToggleRow label="Continue listening" detail="A gentle nudge for an unfinished document" value={preferences.continueListeningEnabled} onChange={(value) => onChange({ continueListeningEnabled: value })} />
      <ChoiceRow label="Reminder time" detail="When Soundoc checks in" value={formatNotificationTime(preferences.continueListeningTime)} onPress={() => setPicker('continue-time')} />
      <ChoiceRow label="Cadence" detail="How often the reminder repeats" value={preferences.continueListeningCadence === 'daily' ? 'Every day' : 'Weekdays'} onPress={() => setPicker('cadence')} />
      <ToggleRow label="Document ready" detail="Know when a large import is ready to listen" value={preferences.documentReadyEnabled} onChange={(value) => onChange({ documentReadyEnabled: value })} />
      <ToggleRow label="Weekly recap" detail="A calm summary of your listening week" value={preferences.weeklyRecapEnabled} onChange={(value) => onChange({ weeklyRecapEnabled: value })} />
      {preferences.weeklyRecapEnabled && <>
        <ChoiceRow label="Recap day" detail="The day your weekly summary arrives" value={weekdays.find((day) => day.value === preferences.weeklyRecapWeekday)?.label ?? 'Sunday'} onPress={() => setPicker('weekly-day')} />
        <ChoiceRow label="Recap time" detail="A quiet evening check-in" value={formatNotificationTime(preferences.weeklyRecapTime)} onPress={() => setPicker('weekly-time')} />
      </>}
      <Text style={styles.footnote}>Reminders are silent, never add an app badge, and only appear when there is something useful to share.</Text>
    </>}
    <PickerModal picker={picker} preferences={preferences} onClose={() => setPicker(null)} onChange={onChange} />
  </SectionShell>;
}

function SectionShell({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.card}>{children}</View></View>;
}

function ToggleRow({ label, detail, value, onChange }: { label: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.row}><View style={styles.copy}><Text style={styles.label}>{label}</Text><Text style={styles.detail}>{detail}</Text></View><SoundocToggle compact value={value} onValueChange={onChange} accessibilityLabel={label} /></View>;
}

function ChoiceRow({ label, detail, value, onPress }: { label: string; detail: string; value: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${label}, ${value}`}><View style={styles.copy}><Text style={styles.label}>{label}</Text><Text style={styles.detail}>{detail}</Text></View><View style={styles.valueWell}><Text style={styles.valueText} numberOfLines={1}>{value}</Text><Text style={styles.chevron}>›</Text></View></Pressable>;
}

function PickerModal({ picker, preferences, onClose, onChange }: { picker: Picker; preferences: NotificationPreferences; onClose: () => void; onChange: (value: Partial<NotificationPreferences>) => void }) {
  if (!picker) return null;
  const isTime = picker === 'continue-time' || picker === 'weekly-time';
  const title = picker === 'continue-time' ? 'Reminder time' : picker === 'weekly-time' ? 'Recap time' : picker === 'cadence' ? 'Reminder cadence' : 'Recap day';
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.modal}><View style={styles.modalHeader}><View style={styles.modalHeaderCopy}><Text style={styles.modalTitle}>{title}</Text><Text style={styles.modalSubtitle}>Choose what feels natural for your routine.</Text></View><Pressable onPress={onClose} accessibilityRole="button"><Text style={styles.done}>Done</Text></Pressable></View><ScrollView contentContainerStyle={styles.options}>
    {isTime && timeOptions.map((time) => { const selected = (picker === 'continue-time' ? preferences.continueListeningTime : preferences.weeklyRecapTime).hour === time.hour && (picker === 'continue-time' ? preferences.continueListeningTime : preferences.weeklyRecapTime).minute === time.minute; return <PickerOption key={`${time.hour}:${time.minute}`} label={formatNotificationTime(time)} selected={selected} onPress={() => { onChange(picker === 'continue-time' ? { continueListeningTime: time } : { weeklyRecapTime: time }); onClose(); }} />; })}
    {picker === 'cadence' && <><PickerOption label="Every day" selected={preferences.continueListeningCadence === 'daily'} onPress={() => { onChange({ continueListeningCadence: 'daily' }); onClose(); }} /><PickerOption label="Weekdays" selected={preferences.continueListeningCadence === 'weekdays'} onPress={() => { onChange({ continueListeningCadence: 'weekdays' }); onClose(); }} /></>}
    {picker === 'weekly-day' && weekdays.map((day) => <PickerOption key={day.value} label={day.label} selected={preferences.weeklyRecapWeekday === day.value} onPress={() => { onChange({ weeklyRecapWeekday: day.value }); onClose(); }} />)}
  </ScrollView></SafeAreaView></Modal>;
}

function PickerOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ selected }}><Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text><Text style={styles.check}>{selected ? '✓' : ''}</Text></Pressable>;
}

const styles = StyleSheet.create({
  section: { marginTop: space.xxl },
  sectionTitle: { ...type.caption, color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: space.sm },
  card: { borderRadius: radius.large, overflow: 'hidden', backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle },
  introRow: { minHeight: 94, padding: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  icon: { width: 42, height: 42, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: 'rgba(255,149,94,0.22)' },
  iconText: { color: colors.accentPrimary, fontSize: 24 },
  copy: { flex: 1, minWidth: 0, marginRight: space.xs },
  title: { ...type.heading, color: colors.textPrimary },
  label: { ...type.label, color: colors.textPrimary },
  detail: { ...type.caption, color: colors.textSecondary, lineHeight: 17, marginTop: 3 },
  row: { minHeight: 72, paddingHorizontal: space.md, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  settingsButton: { minHeight: 52, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.accentSoft, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  settingsButtonText: { ...type.label, color: colors.accentPrimary },
  valueWell: { minHeight: 42, maxWidth: 145, paddingHorizontal: space.sm, borderRadius: radius.small, backgroundColor: colors.surfaceInset, borderWidth: 1, borderTopColor: 'rgba(0,0,0,0.56)', borderBottomColor: 'rgba(255,255,255,0.07)', flexDirection: 'row', alignItems: 'center', gap: 4 },
  valueText: { ...type.label, color: colors.textSecondary, flexShrink: 1 },
  chevron: { color: colors.accentPrimary, fontSize: 23, lineHeight: 24 },
  footnote: { ...type.caption, color: colors.textTertiary, lineHeight: 18, padding: space.md },
  pressed: { opacity: 0.82 },
  modal: { flex: 1, backgroundColor: colors.backgroundPrimary, paddingHorizontal: space.lg },
  modalHeader: { paddingTop: space.md, paddingBottom: space.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md },
  modalHeaderCopy: { flex: 1, minWidth: 0, flexShrink: 1 },
  modalTitle: { ...type.display, color: colors.textPrimary, fontSize: 28, flexShrink: 1 },
  modalSubtitle: { ...type.caption, color: colors.textSecondary, marginTop: 5, maxWidth: 260 },
  done: { ...type.label, color: colors.accentPrimary, padding: space.xs },
  options: { paddingBottom: space.xxxl, gap: space.sm },
  option: { minHeight: 64, paddingHorizontal: space.md, borderRadius: radius.medium, backgroundColor: colors.surfacePrimary, borderWidth: 1, borderColor: colors.borderSubtle, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accentPrimary },
  optionLabel: { ...type.heading, color: colors.textPrimary },
  optionLabelSelected: { color: colors.accentPrimary },
  check: { color: colors.accentPrimary, fontSize: 21, width: 28, textAlign: 'right' },
});
