import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useThemeColors, spacing, radius, font, formatINR } from "@/src/theme";
import { api, Dashboard, DashboardStock } from "@/src/api";
import { useToast } from "@/src/toast";

const HERO_LIGHT = "https://images.unsplash.com/photo-1516541196182-6bdb0516ed27?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODF8MHwxfHNlYXJjaHwxfHxzdG9uZSUyMHRleHR1cmUlMjBtaW5pbWFsfGVufDB8fHx3aGl0ZXwxNzg1OTI4Mzc3fDA&ixlib=rb-4.1.0&q=85";

export default function DashboardScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = React.useState<Dashboard | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<DashboardStock | null>(null);
  const [priceInput, setPriceInput] = React.useState("");
  const [unitsInput, setUnitsInput] = React.useState("");
  const [manualUnits, setManualUnits] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setError(null);
      const d = await api.getDashboard();
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load])
  );

  const openBuy = (s: DashboardStock) => {
    setSelected(s);
    setPriceInput("");
    setUnitsInput("");
    setManualUnits(false);
  };

  const onPriceChange = (v: string) => {
    setPriceInput(v);
    if (!manualUnits && selected) {
      const p = parseFloat(v);
      if (p && p > 0) {
        const u = Math.floor(selected.remaining_today / p);
        setUnitsInput(u > 0 ? String(u) : "");
      } else {
        setUnitsInput("");
      }
    }
  };

  const onUnitsChange = (v: string) => {
    // Only allow digits
    const clean = v.replace(/[^0-9]/g, "");
    setUnitsInput(clean);
    setManualUnits(true);
  };

  const submitBuy = async () => {
    if (!selected) return;
    const price = parseFloat(priceInput);
    if (!price || price <= 0) {
      toast.show("Enter a valid price", "error");
      return;
    }
    const units = parseInt(unitsInput, 10);
    if (!units || units <= 0) {
      toast.show("Enter units (must be >= 1)", "error");
      return;
    }
    setSubmitting(true);
    try {
      await api.createEntry({ stock_id: selected.id, price, units });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.show(`Logged buy for ${selected.symbol}`, "success");
      setSelected(null);
      setPriceInput("");
      setUnitsInput("");
      setManualUnits(false);
      await load();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const computed = React.useMemo(() => {
    const p = parseFloat(priceInput);
    const u = parseInt(unitsInput, 10);
    if (!p || p <= 0 || !u || u <= 0) return { units: u || 0, cost: 0, overBudget: false };
    const cost = Math.round(u * p * 100) / 100;
    const overBudget = selected ? cost > selected.remaining_today : false;
    return { units: u, cost, overBudget };
  }, [priceInput, unitsInput, selected]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: c.surface }]}>
        <ActivityIndicator color={c.brandPrimary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const empty = !data || data.stocks.length === 0;

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: c.surface }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.brandPrimary} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.hello, { color: c.mutedText }]}>Daily SIP</Text>
            <Text style={[styles.title, { color: c.onSurface }]} testID="dashboard-title">Dashboard</Text>
          </View>
          <View style={[styles.dayPill, { backgroundColor: c.brandTertiary }]}>
            <Feather name="calendar" size={12} color={c.onBrandTertiary} />
            <Text style={[styles.dayPillText, { color: c.onBrandTertiary }]}>
              Day {data?.days_elapsed ?? 0}/{data?.trading_days ?? 0}
            </Text>
          </View>
        </View>

        {/* Hero card */}
        <View style={[styles.hero, { borderColor: c.border }]} testID="hero-card">
          <Image source={{ uri: HERO_LIGHT }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient
            colors={["rgba(26,26,26,0.35)", "rgba(26,26,26,0.85)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroContent}>
            <Text style={styles.heroLabel}>Monthly Budget</Text>
            <Text style={styles.heroValue} testID="hero-budget">
              {formatINR(data?.monthly_budget || 0)}
            </Text>
            <View style={styles.heroStatsRow}>
              <HeroStat label="Spent" value={formatINR(data?.totals.spent || 0)} testID="hero-spent" />
              <View style={styles.heroDivider} />
              <HeroStat label="Available Today" value={formatINR(data?.totals.remaining_today || 0)} testID="hero-available" />
            </View>
            <View style={[styles.heroStatsRow, { marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 0 }]}>
              <HeroStat label="Units Bought" value={`${data?.totals.units_bought ?? data?.totals.units ?? 0} units`} />
              <View style={styles.heroDivider} />
              <HeroStat label="Can Buy Today" value={`${data?.totals.can_buy ?? 0} units`} />
            </View>
          </View>
        </View>

        {empty ? (
          <View style={styles.emptyBox} testID="dashboard-empty">
            <Feather name="inbox" size={40} color={c.mutedText} />
            <Text style={[styles.emptyTitle, { color: c.onSurface }]}>No stocks yet</Text>
            <Text style={[styles.emptyMsg, { color: c.mutedText }]}>
              Configure your SIP in Settings to start tracking.
            </Text>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: c.brandPrimary }]}
              onPress={() => router.push("/settings")}
              testID="empty-go-settings"
            >
              <Text style={styles.primaryBtnText}>Go to Settings</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.stocksList}>
            <Text style={[styles.sectionTitle, { color: c.onSurface }]}>Your Stocks</Text>
            {data?.total_alloc_pct !== undefined && Math.round(data.total_alloc_pct) !== 100 ? (
              <View style={[styles.warnBanner, { backgroundColor: c.brandTertiary, borderColor: c.borderStrong }]} testID="alloc-warn">
                <Feather name="alert-circle" size={14} color={c.warning} />
                <Text style={[styles.warnText, { color: c.onBrandTertiary }]}>
                  Allocations total {Math.round(data.total_alloc_pct)}%. Adjust in Settings.
                </Text>
              </View>
            ) : null}
            {data?.stocks.map((s) => (
              <StockCard key={s.id} stock={s} onPress={() => openBuy(s)} />
            ))}
          </View>
        )}

        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: c.error }]}>
            <Text style={{ color: "#fff" }}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Buy Modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <Pressable style={styles.sheetOverlay} onPress={() => setSelected(null)}>
            <Pressable
              style={[styles.sheet, { backgroundColor: c.surfaceSecondary }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.sheetHandle} />
              <Text style={[styles.sheetTitle, { color: c.onSurface }]}>
                Buy {selected?.symbol}
              </Text>
              <Text style={[styles.sheetSubtitle, { color: c.mutedText }]}>{selected?.name}</Text>

              <View style={[styles.sheetInfoRow, { borderColor: c.border }]}>
                <View style={styles.sheetInfoCol}>
                  <Text style={[styles.sheetInfoLabel, { color: c.mutedText }]}>Available Today</Text>
                  <Text style={[styles.sheetInfoValue, { color: c.onSurface }]} testID="buy-available">
                    {formatINR(selected?.remaining_today || 0)}
                  </Text>
                </View>
                <View style={styles.sheetInfoCol}>
                  <Text style={[styles.sheetInfoLabel, { color: c.mutedText }]}>Daily Budget</Text>
                  <Text style={[styles.sheetInfoValue, { color: c.onSurface }]}>
                    {formatINR(selected?.daily_budget || 0)}
                  </Text>
                </View>
              </View>

              <Text style={[styles.inputLabel, { color: c.onSurface }]}>Current Price (₹)</Text>
              <TextInput
                value={priceInput}
                onChangeText={onPriceChange}
                keyboardType="decimal-pad"
                placeholder="e.g. 2450.50"
                placeholderTextColor={c.mutedText}
                style={[
                  styles.input,
                  { borderColor: c.border, color: c.onSurface, backgroundColor: c.surface },
                ]}
                testID="buy-price-input"
              />

              <View style={styles.unitsLabelRow}>
                <Text style={[styles.inputLabel, { color: c.onSurface }]}>Units to Buy</Text>
                {manualUnits ? (
                  <Pressable
                    onPress={() => {
                      setManualUnits(false);
                      const p = parseFloat(priceInput);
                      if (p && p > 0 && selected) {
                        const u = Math.floor(selected.remaining_today / p);
                        setUnitsInput(u > 0 ? String(u) : "");
                      } else {
                        setUnitsInput("");
                      }
                    }}
                    testID="buy-units-auto"
                  >
                    <Text style={[styles.autoLink, { color: c.brandPrimary }]}>Auto ({formatINR(selected?.remaining_today || 0)} max)</Text>
                  </Pressable>
                ) : (
                  <Text style={[styles.autoHint, { color: c.mutedText }]}>Auto-calculated · tap to edit</Text>
                )}
              </View>
              <TextInput
                value={unitsInput}
                onChangeText={onUnitsChange}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={c.mutedText}
                style={[
                  styles.input,
                  { borderColor: c.border, color: c.onSurface, backgroundColor: c.surface },
                ]}
                testID="buy-units-input"
              />

              <View style={[styles.calcBox, { backgroundColor: computed.overBudget ? c.error : c.brandTertiary }]}>
                <View style={styles.calcRow}>
                  <Text style={[styles.calcLabel, { color: computed.overBudget ? "#fff" : c.onBrandTertiary }]}>Total Cost</Text>
                  <Text style={[styles.calcValue, { color: computed.overBudget ? "#fff" : c.onBrandTertiary }]} testID="buy-cost-calc">
                    {formatINR(computed.cost)}
                  </Text>
                </View>
                {computed.overBudget ? (
                  <Text style={[styles.overBudgetNote, { color: "#fff" }]} testID="buy-over-budget-warn">
                    ⚠ Exceeds today's available budget by {formatINR(computed.cost - (selected?.remaining_today || 0))}
                  </Text>
                ) : null}
              </View>

              <View style={styles.sheetActions}>
                <Pressable
                  onPress={() => setSelected(null)}
                  style={[styles.ghostBtn, { borderColor: c.border }]}
                >
                  <Text style={{ color: c.onSurface, fontSize: font.base }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={submitBuy}
                  disabled={submitting || computed.units <= 0}
                  style={[
                    styles.primaryBtn,
                    {
                      backgroundColor: computed.units <= 0 ? c.borderStrong : c.brandPrimary,
                      flex: 1,
                    },
                  ]}
                  testID="buy-submit"
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Confirm Buy</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function HeroStat({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.heroStatLabel}>{label}</Text>
      <Text style={styles.heroStatValue} testID={testID}>{value}</Text>
    </View>
  );
}

function StockCard({ stock, onPress }: { stock: DashboardStock; onPress: () => void }) {
  const c = useThemeColors();
  const pct = stock.accrued > 0 ? Math.min((stock.spent / stock.accrued) * 100, 100) : 0;
  const unitsBought = stock.units_bought ?? stock.units ?? 0;
  const canBuy = stock.can_buy ?? 0;

  return (
    <Pressable
      style={[styles.card, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}
      onPress={onPress}
      testID={`stock-card-${stock.symbol}`}
    >
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { backgroundColor: c.brandTertiary }]}>
          <Text style={[styles.avatarText, { color: c.onBrandTertiary }]}>
            {stock.symbol.slice(0, 3)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardSymbol, { color: c.onSurface }]}>{stock.symbol}</Text>
          <Text style={[styles.cardName, { color: c.mutedText }]} numberOfLines={1}>
            {stock.name} · {stock.allocation_pct}%
          </Text>
        </View>
        <View style={[styles.buyPill, { backgroundColor: c.brandPrimary }]}>
          <Feather name="plus" size={14} color="#fff" />
          <Text style={styles.buyPillText}>Buy</Text>
        </View>
      </View>

      <View style={styles.cardStatsGrid}>
        <View style={styles.statRow}>
          <CardStat label="Available" value={formatINR(stock.remaining_today)} accent={c.brandPrimary} />
          <CardStat label="Daily Budget" value={formatINR(stock.daily_budget)} />
        </View>
        <View style={[styles.statRow, { marginTop: spacing.sm }]}>
          <CardStat label="Units Bought" value={`${unitsBought} units`} />
          <CardStat
            label="Can Buy"
            value={
              stock.latest_price > 0
                ? `${canBuy} units`
                : "Tap Buy"
            }
            accent={canBuy > 0 ? c.brandPrimary : c.mutedText}
          />
        </View>
      </View>

      <View style={[styles.progressBar, { backgroundColor: c.surfaceTertiary }]}>
        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: c.brandPrimary }]} />
      </View>
      <View style={styles.cardFooter}>
        <Text style={[styles.footerText, { color: c.mutedText }]}>
          Spent {formatINR(stock.spent)} / {formatINR(stock.accrued)}
          {stock.latest_price > 0 ? ` · Last Price: ${formatINR(stock.latest_price)}` : ""}
        </Text>
      </View>
    </Pressable>
  );
}

function CardStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const c = useThemeColors();
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.statLabel, { color: c.mutedText }]}>{label}</Text>
      <Text style={[styles.statValue, { color: accent || c.onSurface, fontVariant: ["tabular-nums"] }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  hello: { fontSize: font.sm, letterSpacing: 1, textTransform: "uppercase" },
  title: { fontSize: font.xxl, fontWeight: "500" },
  dayPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  dayPillText: { fontSize: font.sm, fontWeight: "500", fontVariant: ["tabular-nums"] },
  hero: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    overflow: "hidden",
    minHeight: 180,
    borderWidth: 1,
  },
  heroContent: { padding: spacing.xl, gap: spacing.sm },
  heroLabel: { color: "rgba(255,255,255,0.7)", fontSize: font.sm, letterSpacing: 1, textTransform: "uppercase" },
  heroValue: { color: "#fff", fontSize: 32, fontWeight: "500", fontVariant: ["tabular-nums"] },
  heroStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.15)",
  },
  heroDivider: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.15)", marginHorizontal: spacing.md },
  heroStatLabel: { color: "rgba(255,255,255,0.6)", fontSize: font.sm },
  heroStatValue: { color: "#fff", fontSize: font.lg, fontWeight: "500", marginTop: 2, fontVariant: ["tabular-nums"] },
  stocksList: { paddingHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.md },
  sectionTitle: { fontSize: font.lg, fontWeight: "500", marginBottom: 4 },
  warnBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  warnText: { fontSize: font.sm, flex: 1 },
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 12, fontWeight: "500" },
  cardSymbol: { fontSize: font.lg, fontWeight: "500" },
  cardName: { fontSize: font.sm, marginTop: 2 },
  buyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  buyPillText: { color: "#fff", fontSize: font.sm, fontWeight: "500" },
  cardStatsGrid: { gap: spacing.xs },
  statRow: { flexDirection: "row", gap: spacing.md },
  cardStats: { flexDirection: "row", gap: spacing.md },
  statLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { fontSize: font.lg, fontWeight: "500", marginTop: 2 },
  progressBar: { height: 4, borderRadius: radius.pill, overflow: "hidden" },
  progressFill: { height: "100%" },
  cardFooter: { flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: font.sm, fontVariant: ["tabular-nums"] },
  emptyBox: {
    marginTop: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
  },
  emptyTitle: { fontSize: font.xl, fontWeight: "500" },
  emptyMsg: { fontSize: font.base, textAlign: "center" },
  primaryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  primaryBtnText: { color: "#fff", fontSize: font.base, fontWeight: "500" },
  errorBanner: { margin: spacing.lg, padding: spacing.md, borderRadius: radius.md },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    padding: spacing.xl,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.md,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#ccc",
    borderRadius: radius.pill,
    alignSelf: "center",
    marginBottom: spacing.sm,
  },
  sheetTitle: { fontSize: font.xl, fontWeight: "500" },
  sheetSubtitle: { fontSize: font.base, marginTop: -8 },
  sheetInfoRow: {
    flexDirection: "row",
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
  },
  sheetInfoCol: { flex: 1 },
  sheetInfoLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  sheetInfoValue: { fontSize: font.lg, fontWeight: "500", marginTop: 2, fontVariant: ["tabular-nums"] },
  inputLabel: { fontSize: font.sm, fontWeight: "500", marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: font.lg,
    fontVariant: ["tabular-nums"],
  },
  calcBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  calcRow: { flexDirection: "row", justifyContent: "space-between" },
  calcLabel: { fontSize: font.sm },
  calcValue: { fontSize: font.lg, fontWeight: "500", fontVariant: ["tabular-nums"] },
  overBudgetNote: { fontSize: font.sm, marginTop: 4 },
  unitsLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  autoHint: { fontSize: 11 },
  autoLink: { fontSize: 11, fontWeight: "500" },
  sheetActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  ghostBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
