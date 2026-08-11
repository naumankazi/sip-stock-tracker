const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export const API = `${BASE}/api`;

let authToken: string | null = null;

export function setApiAuthToken(token: string | null) {
  authToken = token;
}

function getHeaders(extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  return headers;
}

async function handle(res: Response) {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.detail || JSON.stringify(body);
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  // Auth
  register: (body: { email: string; password: string }) =>
    fetch(`${API}/auth/register`, {
      method: "POST",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    }).then(handle),

  login: (body: { email: string; password: string }) =>
    fetch(`${API}/auth/login`, {
      method: "POST",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    }).then(handle),

  getMe: () =>
    fetch(`${API}/auth/me`, {
      headers: getHeaders(),
    }).then(handle),

  // Settings
  getSettings: () =>
    fetch(`${API}/settings`, {
      headers: getHeaders(),
    }).then(handle),

  updateSettings: (body: { monthly_budget?: number; trading_days?: number }) =>
    fetch(`${API}/settings`, {
      method: "PUT",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    }).then(handle),

  // Stocks
  listStocks: () =>
    fetch(`${API}/stocks`, {
      headers: getHeaders(),
    }).then(handle),

  createStock: (body: { symbol: string; name: string; allocation_pct: number }) =>
    fetch(`${API}/stocks`, {
      method: "POST",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    }).then(handle),

  updateStock: (id: string, body: { symbol?: string; name?: string; allocation_pct?: number }) =>
    fetch(`${API}/stocks/${id}`, {
      method: "PUT",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    }).then(handle),

  deleteStock: (id: string) =>
    fetch(`${API}/stocks/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    }).then(handle),

  updateAllocations: (allocations: { id: string; allocation_pct: number }[]) =>
    fetch(`${API}/allocations`, {
      method: "PUT",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ allocations }),
    }).then(handle),

  // Dashboard
  getDashboard: () =>
    fetch(`${API}/dashboard`, {
      headers: getHeaders(),
    }).then(handle),

  // Entries
  createEntry: (body: { stock_id: string; price: number; units?: number; date?: string }) =>
    fetch(`${API}/entries`, {
      method: "POST",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    }).then(handle),

  listEntries: (stockId?: string) =>
    fetch(`${API}/entries${stockId ? `?stock_id=${stockId}` : ""}`, {
      headers: getHeaders(),
    }).then(handle),

  deleteEntry: (id: string) =>
    fetch(`${API}/entries/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    }).then(handle),

  // Reset
  resetBudget: () =>
    fetch(`${API}/reset/budget`, {
      method: "POST",
      headers: getHeaders(),
    }).then(handle),

  resetAllocations: () =>
    fetch(`${API}/reset/allocations`, {
      method: "POST",
      headers: getHeaders(),
    }).then(handle),

  resetLogs: () =>
    fetch(`${API}/reset/logs`, {
      method: "POST",
      headers: getHeaders(),
    }).then(handle),
};

export type User = {
  id: string;
  email: string;
  created_at: string;
};

export type Stock = {
  id: string;
  symbol: string;
  name: string;
  allocation_pct: number;
  created_at: string;
};

export type Entry = {
  id: string;
  stock_id: string;
  symbol: string;
  name: string;
  date: string;
  price: number;
  units: number;
  cost: number;
  created_at: string;
};

export type DashboardStock = {
  id: string;
  symbol: string;
  name: string;
  allocation_pct: number;
  monthly_alloc: number;
  daily_budget: number;
  accrued: number;
  spent: number;
  units: number;
  units_bought: number;
  latest_price: number;
  can_buy: number;
  today_spent: number;
  remaining_today: number;
};

export type Dashboard = {
  currency: string;
  monthly_budget: number;
  trading_days: number;
  days_elapsed: number;
  days_elapsed_raw: number;
  today: string;
  month: string;
  total_alloc_pct: number;
  totals: {
    daily_budget: number;
    accrued: number;
    spent: number;
    remaining_today: number;
    units: number;
    units_bought: number;
    can_buy: number;
  };
  stocks: DashboardStock[];
};

export type Settings = {
  monthly_budget: number;
  trading_days: number;
  currency: string;
};
