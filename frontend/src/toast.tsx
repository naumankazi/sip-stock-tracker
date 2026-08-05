import React from "react";
import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import { useThemeColors, spacing, radius, font } from "./theme";
import { Feather } from "@expo/vector-icons";

type ToastType = "success" | "error" | "warning" | "info";

type Toast = { id: number; message: string; type: ToastType };

type Ctx = {
  show: (message: string, type?: ToastType) => void;
  confirm: (opts: { title: string; message?: string; confirmText?: string; danger?: boolean }) => Promise<boolean>;
};

const ToastCtx = React.createContext<Ctx | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) throw new Error("ToastProvider missing");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const c = useThemeColors();
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [confirmState, setConfirmState] = React.useState<
    | null
    | {
        title: string;
        message?: string;
        confirmText?: string;
        danger?: boolean;
        resolve: (v: boolean) => void;
      }
  >(null);

  const show = React.useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);

  const confirm = React.useCallback<Ctx["confirm"]>((opts) => {
    return new Promise((resolve) => {
      setConfirmState({ ...opts, resolve });
    });
  }, []);

  const handleClose = (result: boolean) => {
    if (confirmState) confirmState.resolve(result);
    setConfirmState(null);
  };

  return (
    <ToastCtx.Provider value={{ show, confirm }}>
      {children}
      <View pointerEvents="box-none" style={styles.toastLayer} testID="toast-layer">
        {toasts.map((t) => {
          const bg =
            t.type === "success"
              ? c.success
              : t.type === "error"
              ? c.error
              : t.type === "warning"
              ? c.warning
              : c.surfaceInverse;
          return (
            <View key={t.id} style={[styles.toast, { backgroundColor: bg }]} testID={`toast-${t.type}`}>
              <Text style={[styles.toastText, { color: "#fff" }]}>{t.message}</Text>
            </View>
          );
        })}
      </View>

      <Modal
        visible={!!confirmState}
        transparent
        animationType="fade"
        onRequestClose={() => handleClose(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => handleClose(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Feather
                name={confirmState?.danger ? "alert-triangle" : "info"}
                size={20}
                color={confirmState?.danger ? c.error : c.brandPrimary}
              />
              <Text style={[styles.confirmTitle, { color: c.onSurface }]}>
                {confirmState?.title}
              </Text>
            </View>
            {confirmState?.message ? (
              <Text style={[styles.confirmMsg, { color: c.mutedText }]}>
                {confirmState.message}
              </Text>
            ) : null}
            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => handleClose(false)}
                style={[styles.btnGhost, { borderColor: c.border }]}
                testID="confirm-cancel"
              >
                <Text style={{ color: c.onSurface, fontSize: font.base }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => handleClose(true)}
                style={[
                  styles.btnPrimary,
                  { backgroundColor: confirmState?.danger ? c.error : c.brandPrimary },
                ]}
                testID="confirm-ok"
              >
                <Text style={{ color: "#fff", fontSize: font.base, fontWeight: "500" }}>
                  {confirmState?.confirmText || "Confirm"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ToastCtx.Provider>
  );
}

const styles = StyleSheet.create({
  toastLayer: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 8,
    zIndex: 9999,
  },
  toast: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    maxWidth: "90%",
  },
  toastText: { fontSize: font.base },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
  },
  confirmTitle: { fontSize: font.lg, fontWeight: "500", flex: 1 },
  confirmMsg: { fontSize: font.base, lineHeight: 20 },
  confirmActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  btnGhost: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  btnPrimary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
});
