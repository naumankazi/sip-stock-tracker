const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export const API = `${BASE}/api`;

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
  getSettings: () => fetch(`${API}/settings`).then(handle),
  updateSettings: (body: { monthly_budget?: number; trading_days?: number }) =>
    fetch(`${API}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle),

  listStocks: () => fetch(`${API}/stocks`).then(handle),
  createStock: (body: { symbol: string; name: string; allocation_pct: number }) =>
    fetch(`${API}/stocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle),
  updateStock: (id: string, body: { symbol?: string; name?: string; allocation_pct?: number }) =>
    fetch(`${API}/stocks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle),
  deleteStock: (id: string) =>
    fetch(`${API}/stocks/${id}`, { method: "DELETE" }).then(handle),

  updateAllocations: (allocations: { id: string; allocation_pct: number }[]) =>
    fetch(`${API}/allocations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allocations }),
    }).then(handle),

  getDashboard: () => fetch(`${API}/dashboard`).then(handle),

  createEntry: (body: { stock_id: string; price: number; date?: string }) =>
    fetch(`${API}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle),
  listEntries: (stockId?: string) =>
    fetch(`${API}/entries${stockId ? `?stock_id=${stockId}` : ""}`).then(handle),
  deleteEntry: (id: string) =>
    fetch(`${API}/entries/${id}`, { method: "DELETE" }).then(handle),

  resetBudget: () => fetch(`${API}/reset/budget`, { method: "POST" }).then(handle),
  resetAllocations: () => fetch(`${API}/reset/allocations`, { method: "POST" }).then(handle),
  resetLogs: () => fetch(`${API}/reset/logs`, { method: "POST" }).then(handle),
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
  };
  stocks: DashboardStock[];
};

export type Settings = {
  monthly_budget: number;
  trading_days: number;
  currency: string;
};
