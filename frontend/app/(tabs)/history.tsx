import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { useThemeColors, spacing, radius, font, formatINR } from "@/src/theme";
import { api, Entry, Stock } from "@/src/api";
import { useToast } from "@/src/toast";

export default function HistoryScreen() {
  const c = useThemeColors();
  const toast = useToast();
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [stocks, setStocks] = React.useState<Stock[]>([]);
  const [filter, setFilter] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [e, s] = await Promise.all([
        api.listEntries(filter || undefined),
        api.listStocks(),
      ]);
      setEntries(e);
      setStocks(s);
    } catch (err: any) {
      toast.show(err.message, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, toast]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load])
  );

  const total = entries.reduce((a, e) => a + e.cost, 0);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteEntry(id);
      toast.show("Entry removed", "success");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: c.surface }]}>
        <ActivityIndicator color={c.brandPrimary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: c.surface }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.onSurface }]} testID="history-title">History</Text>
        <Text style={[styles.subtitle, { color: c.mutedText }]}>
          {entries.length} entries · Total {formatINR(total)}
        </Text>
      </View>

      {stocks.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          <Chip label="All" active={filter === null} onPress={() => setFilter(null)} testID="filter-all" />
          {stocks.map((s) => (
            <Chip
              key={s.id}
              label={s.symbol}
              active={filter === s.id}
              onPress={() => setFilter(s.id)}
              testID={`filter-${s.symbol}`}
            />
          ))}
        </ScrollView>
      ) : null}

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={c.brandPrimary} />}
      >
        {entries.length === 0 ? (
          <View style={styles.empty} testID="history-empty">
            <Feather name="book-open" size={40} color={c.mutedText} />
            <Text style={[styles.emptyTitle, { color: c.onSurface }]}>No entries yet</Text>
            <Text style={[styles.emptyMsg, { color: c.mutedText }]}>
              Log your first buy from the Dashboard.
            </Text>
          </View>
        ) : (
          entries.map((e) => (
            <View
              key={e.id}
              style={[styles.row, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}
              testID={`history-row-${e.id}`}
            >
              <View style={[styles.avatar, { backgroundColor: c.brandTertiary }]}>
                <Text style={[styles.avatarText, { color: c.onBrandTertiary }]}>
                  {e.symbol.slice(0, 3)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowSymbol, { color: c.onSurface }]}>{e.symbol}</Text>
                <Text style={[styles.rowMeta, { color: c.mutedText }]}>
                  {e.date} · {e.units} × {formatINR(e.price)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.rowCost, { color: c.onSurface }]}>{formatINR(e.cost)}</Text>
                <Pressable onPress={() => handleDelete(e.id)} testID={`delete-entry-${e.id}`}>
                  <Text style={[styles.rowDelete, { color: c.error }]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID?: string }) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? c.brandPrimary : c.surfaceSecondary,
          borderColor: active ? c.brandPrimary : c.border,
        },
      ]}
      testID={testID}
    >
      <Text style={{ color: active ? "#fff" : c.onSurface, fontSize: font.sm, fontWeight: "500" }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: font.xxl, fontWeight: "500" },
  subtitle: { fontSize: font.sm, marginTop: 4 },
  filterScroll: { maxHeight: 56, marginBottom: spacing.sm },
  filterRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center", height: 56 },
  chip: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 11, fontWeight: "500" },
  rowSymbol: { fontSize: font.base, fontWeight: "500" },
  rowMeta: { fontSize: font.sm, marginTop: 2, fontVariant: ["tabular-nums"] },
  rowCost: { fontSize: font.base, fontWeight: "500", fontVariant: ["tabular-nums"] },
  rowDelete: { fontSize: 11, marginTop: 4 },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.md },
  emptyTitle: { fontSize: font.xl, fontWeight: "500" },
  emptyMsg: { fontSize: font.base, textAlign: "center" },
});
