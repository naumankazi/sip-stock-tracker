import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { api, setApiAuthToken, User } from "./api";
import { useThemeColors, spacing, radius, font } from "./theme";
import { useToast } from "./toast";

const AUTH_STORAGE_KEY = "@sip_tracker_auth";

type AuthContextType = {
  user: User | null;
  token: string | null;
  loading: boolean;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const c = useThemeColors();
  const toast = useToast();

  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadSavedAuth() {
      try {
        const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.token && parsed?.user) {
            setToken(parsed.token);
            setUser(parsed.user);
            setApiAuthToken(parsed.token);
          }
        }
      } catch (e) {
        console.error("Failed to load auth state", e);
      } finally {
        setLoading(false);
      }
    }
    loadSavedAuth();
  }, []);

  const handleAuthSubmit = async () => {
    if (!email.trim() || !email.includes("@")) {
      return toast.show("Please enter a valid email address", "error");
    }
    if (!password || password.length < 4) {
      return toast.show("Password must be at least 4 characters", "error");
    }

    setSubmitting(true);
    try {
      let res;
      if (isRegister) {
        res = await api.register({ email: email.trim().toLowerCase(), password });
        toast.show("Account created successfully!", "success");
      } else {
        res = await api.login({ email: email.trim().toLowerCase(), password });
        toast.show("Welcome back!", "success");
      }

      setToken(res.token);
      setUser(res.user);
      setApiAuthToken(res.token);

      await AsyncStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ token: res.token, user: res.user })
      );
    } catch (e: any) {
      toast.show(e.message || "Authentication failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      setToken(null);
      setUser(null);
      setApiAuthToken(null);
      toast.show("Logged out", "info");
    } catch (e) {
      console.error("Failed to logout", e);
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingCenter, { backgroundColor: c.surface }]}>
        <ActivityIndicator size="large" color={c.brandPrimary} />
      </View>
    );
  }

  if (!user || !token) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: c.surface }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.authWrapper}
        >
          <View style={styles.authCard}>
            <View style={[styles.iconCircle, { backgroundColor: c.brandPrimary + "20" }]}>
              <Feather name="trending-up" size={32} color={c.brandPrimary} />
            </View>

            <Text style={[styles.authTitle, { color: c.onSurface }]}>
              {isRegister ? "Create Account" : "SIP Stock Tracker"}
            </Text>
            <Text style={[styles.authSubtitle, { color: c.mutedText }]}>
              {isRegister
                ? "Sign up to start tracking your daily SIP allocations"
                : "Log in to access your personal SIP portfolio"}
            </Text>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: c.onSurface }]}>Email Address</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="name@example.com"
                placeholderTextColor={c.mutedText}
                keyboardType="email-address"
                autoCapitalize="none"
                style={[styles.input, { borderColor: c.border, color: c.onSurface, backgroundColor: c.surfaceSecondary }]}
              />

              <Text style={[styles.label, { color: c.onSurface, marginTop: spacing.md }]}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={c.mutedText}
                secureTextEntry
                style={[styles.input, { borderColor: c.border, color: c.onSurface, backgroundColor: c.surfaceSecondary }]}
              />

              <Pressable
                onPress={handleAuthSubmit}
                disabled={submitting}
                style={[styles.submitBtn, { backgroundColor: c.brandPrimary }]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {isRegister ? "Sign Up" : "Log In"}
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => setIsRegister(!isRegister)}
                style={styles.toggleBtn}
              >
                <Text style={{ color: c.mutedText, fontSize: font.sm }}>
                  {isRegister ? "Already have an account? " : "Don't have an account? "}
                  <Text style={{ color: c.brandPrimary, fontWeight: "600" }}>
                    {isRegister ? "Log In" : "Sign Up"}
                  </Text>
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingCenter: { flex: 1, justifyContent: "center", alignItems: "center" },
  authWrapper: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.xl },
  authCard: { gap: spacing.sm },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  authTitle: { fontSize: font.xxl, fontWeight: "700" },
  authSubtitle: { fontSize: font.sm, lineHeight: 20 },
  formGroup: { marginTop: spacing.lg, gap: spacing.xs },
  label: { fontSize: font.sm, fontWeight: "500" },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: font.base,
  },
  submitBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: { color: "#fff", fontSize: font.base, fontWeight: "600" },
  toggleBtn: { alignItems: "center", marginTop: spacing.md, paddingVertical: spacing.sm },
});
