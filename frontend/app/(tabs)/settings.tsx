import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { useThemeColors, spacing, radius, font } from "@/src/theme";
import { api, Settings, Stock } from "@/src/api";
import { useToast } from "@/src/toast";

export default function SettingsScreen() {
  const c = useThemeColors();
  const toast = useToast();

  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [stocks, setStocks] = React.useState<Stock[]>([]);
  const [budgetInput, setBudgetInput] = React.useState("");
  const [tradingDaysInput, setTradingDaysInput] = React.useState("");
  const [allocs, setAllocs] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [addSymbol, setAddSymbol] = React.useState("");
  const [addName, setAddName] = React.useState("");
  const [addPct, setAddPct] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const [s, st] = await Promise.all([api.getSettings(), api.listStocks()]);
      setSettings(s);
      setStocks(st);
      setBudgetInput(String(s.monthly_budget));
      setTradingDaysInput(String(s.trading_days));
      const map: Record<string, string> = {};
      st.forEach((x: Stock) => (map[x.id] = String(x.allocation_pct)));
      setAllocs(map);
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load])
  );

  const allocTotal = Object.values(allocs).reduce((a, v) => a + (parseFloat(v) || 0), 0);

  const saveAll = async () => {
    const budget = parseFloat(budgetInput);
    const days = parseInt(tradingDaysInput, 10);
    if (!budget || budget <= 0) return toast.show("Enter a valid monthly budget", "error");
    if (!days || days <= 0) return toast.show("Enter valid trading days", "error");
    if (Math.round(allocTotal) !== 100 && stocks.length > 0) {
      return toast.show(`Allocations must total 100% (currently ${Math.round(allocTotal)}%)`, "error");
    }
    setSaving(true);
    try {
      await api.updateSettings({ monthly_budget: budget, trading_days: days });
      if (stocks.length > 0) {
        await api.updateAllocations(
          stocks.map((s) => ({ id: s.id, allocation_pct: parseFloat(allocs[s.id] || "0") }))
        );
      }
      toast.show("Settings saved", "success");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const addStock = async () => {
    if (!addSymbol.trim() || !addName.trim()) return toast.show("Symbol and name required", "error");
    const pct = parseFloat(addPct) || 0;
    try {
      await api.createStock({ symbol: addSymbol, name: addName, allocation_pct: pct });
      toast.show("Stock added", "success");
      setAddOpen(false);
      setAddSymbol(""); setAddName(""); setAddPct("");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  const removeStock = async (s: Stock) => {
    const ok = await toast.confirm({
      title: `Remove ${s.symbol}?`,
      message: "The stock will be removed. Existing history entries will remain.",
      confirmText: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteStock(s.id);
      toast.show("Stock removed", "success");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  const doReset = async (kind: "budget" | "allocations" | "logs") => {
    const labels: Record<typeof kind, { title: string; msg: string }> = {
      budget: { title: "Reset Budget?", msg: "Monthly budget and trading days will return to defaults." },
      allocations: { title: "Reset Allocations?", msg: "All stock allocations will be set to 0%." },
      logs: { title: "Clear All History?", msg: "All buy entries will be permanently deleted." },
    };
    const ok = await toast.confirm({
      title: labels[kind].title,
      message: labels[kind].msg,
      confirmText: "Reset",
      danger: true,
    });
    if (!ok) return;
    try {
      if (kind === "budget") await api.resetBudget();
      if (kind === "allocations") await api.resetAllocations();
      if (kind === "logs") await api.resetLogs();
      toast.show("Reset complete", "success");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  if (loading || !settings) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: c.surface }]}>
        <ActivityIndicator color={c.brandPrimary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: c.surface }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: c.onSurface }]} testID="settings-title">Settings</Text>
            <Text style={[styles.subtitle, { color: c.mutedText }]}>Configure your SIP strategy</Text>
          </View>

          {/* Budget group */}
          <View style={[styles.card, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.onSurface }]}>Monthly Budget</Text>
            <Text style={[styles.hint, { color: c.mutedText }]}>Total amount to invest this month (INR)</Text>
            <TextInput
              value={budgetInput}
              onChangeText={setBudgetInput}
              keyboardType="numeric"
              placeholder="30000"
              placeholderTextColor={c.mutedText}
              style={[styles.input, { borderColor: c.border, color: c.onSurface, backgroundColor: c.surface }]}
              testID="budget-input"
            />

            <Text style={[styles.cardTitle, { color: c.onSurface, marginTop: spacing.md }]}>Trading Days</Text>
            <Text style={[styles.hint, { color: c.mutedText }]}>Business days in the month (e.g. 22)</Text>
            <TextInput
              value={tradingDaysInput}
              onChangeText={setTradingDaysInput}
              keyboardType="number-pad"
              placeholder="22"
              placeholderTextColor={c.mutedText}
              style={[styles.input, { borderColor: c.border, color: c.onSurface, backgroundColor: c.surface }]}
              testID="days-input"
            />
          </View>

          {/* Stocks group */}
          <View style={[styles.card, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
            <View style={styles.cardHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: c.onSurface }]}>Stocks & Allocation</Text>
                <Text style={[styles.hint, { color: c.mutedText }]}>
                  Total: {Math.round(allocTotal)}% (must equal 100%)
                </Text>
              </View>
              <Pressable
                onPress={() => setAddOpen(true)}
                style={[styles.addBtn, { backgroundColor: c.brandPrimary }]}
                testID="add-stock-btn"
              >
                <Feather name="plus" size={14} color="#fff" />
                <Text style={styles.addBtnText}>Add</Text>
              </Pressable>
            </View>

            {stocks.length === 0 ? (
              <Text style={[styles.emptyStocks, { color: c.mutedText }]}>
                No stocks yet. Add 3–4 stocks to start tracking.
              </Text>
            ) : (
              stocks.map((s) => (
                <View
                  key={s.id}
                  style={[styles.stockRow, { borderTopColor: c.border }]}
                  testID={`stock-row-${s.symbol}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stockSym, { color: c.onSurface }]}>{s.symbol}</Text>
                    <Text style={[styles.stockName, { color: c.mutedText }]} numberOfLines={1}>
                      {s.name}
                    </Text>
                  </View>
                  <TextInput
                    value={allocs[s.id] ?? ""}
                    onChangeText={(v) => setAllocs({ ...allocs, [s.id]: v })}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={c.mutedText}
                    style={[
                      styles.pctInput,
                      { borderColor: c.border, color: c.onSurface, backgroundColor: c.surface },
                    ]}
                    testID={`alloc-input-${s.symbol}`}
                  />
                  <Text style={{ color: c.onSurface }}>%</Text>
                  <Pressable onPress={() => removeStock(s)} testID={`remove-stock-${s.symbol}`}>
                    <Feather name="trash-2" size={18} color={c.error} />
                  </Pressable>
                </View>
              ))
            )}
          </View>

          {/* Danger zone */}
          <View style={[styles.card, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.error }]}>Danger Zone</Text>
            <Text style={[styles.hint, { color: c.mutedText }]}>Reset items independently. History is NOT wiped when you reset budget or allocations.</Text>

            <ResetRow label="Reset Budget & Trading Days" onPress={() => doReset("budget")} testID="reset-budget" />
            <ResetRow label="Reset Allocations to 0%" onPress={() => doReset("allocations")} testID="reset-allocations" />
            <ResetRow label="Clear All History Logs" onPress={() => doReset("logs")} testID="reset-logs" />
          </View>
        </ScrollView>

        {/* Sticky save */}
        <View style={[styles.stickyBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <Pressable
            onPress={saveAll}
            disabled={saving}
            style={[styles.saveBtn, { backgroundColor: c.brandPrimary }]}
            testID="save-settings-btn"
          >
            {saving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.saveBtnText}>Save Settings</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Add stock modal */}
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={styles.sheetOverlay} onPress={() => setAddOpen(false)}>
            <Pressable style={[styles.sheet, { backgroundColor: c.surfaceSecondary, maxHeight: "90%" }]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHandle} />
              <ScrollView contentContainerStyle={{ gap: spacing.sm }} keyboardShouldPersistTaps="handled">
              <Text style={[styles.cardTitle, { color: c.onSurface }]}>Add Stock</Text>
              <TextInput
                value={addSymbol}
                onChangeText={setAddSymbol}
                placeholder="Symbol (e.g. RELIANCE)"
                placeholderTextColor={c.mutedText}
                autoCapitalize="characters"
                style={[styles.input, { borderColor: c.border, color: c.onSurface, backgroundColor: c.surface }]}
                testID="add-symbol-input"
              />
              <TextInput
                value={addName}
                onChangeText={setAddName}
                placeholder="Full name (e.g. Reliance Industries)"
                placeholderTextColor={c.mutedText}
                style={[styles.input, { borderColor: c.border, color: c.onSurface, backgroundColor: c.surface }]}
                testID="add-name-input"
              />
              <TextInput
                value={addPct}
                onChangeText={setAddPct}
                placeholder="Allocation % (optional)"
                keyboardType="decimal-pad"
                placeholderTextColor={c.mutedText}
                style={[styles.input, { borderColor: c.border, color: c.onSurface, backgroundColor: c.surface }]}
                testID="add-pct-input"
              />
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                <Pressable
                  onPress={() => setAddOpen(false)}
                  style={[styles.ghostBtn, { borderColor: c.border }]}
                >
                  <Text style={{ color: c.onSurface, fontSize: font.base }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={addStock}
                  style={[styles.saveBtn, { backgroundColor: c.brandPrimary, flex: 1 }]}
                  testID="add-stock-submit"
                >
                  <Text style={styles.saveBtnText}>Add Stock</Text>
                </Pressable>
              </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function ResetRow({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.resetRow, { borderColor: c.border }]}
      testID={testID}
    >
      <Text style={{ color: c.onSurface, fontSize: font.base, flex: 1 }}>{label}</Text>
      <Feather name="rotate-ccw" size={16} color={c.error} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: font.xxl, fontWeight: "500" },
  subtitle: { fontSize: font.sm, marginTop: 4 },
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  cardTitle: { fontSize: font.lg, fontWeight: "500" },
  hint: { fontSize: font.sm, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: font.base,
    marginTop: spacing.sm,
    fontVariant: ["tabular-nums"],
  },
  addBtn: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  addBtnText: { color: "#fff", fontSize: font.sm, fontWeight: "500" },
  emptyStocks: { fontSize: font.sm, paddingVertical: spacing.md, textAlign: "center" },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  stockSym: { fontSize: font.base, fontWeight: "500" },
  stockName: { fontSize: font.sm, marginTop: 2 },
  pctInput: {
    width: 70,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: font.base,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  resetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    marginTop: spacing.xs,
  },
  stickyBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    borderTopWidth: 1,
  },
  saveBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  saveBtnText: { color: "#fff", fontSize: font.base, fontWeight: "500" },
  ghostBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    padding: spacing.xl,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.sm,
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: "#ccc",
    borderRadius: radius.pill, alignSelf: "center", marginBottom: spacing.sm,
  },
});
