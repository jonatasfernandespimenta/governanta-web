// Tipos e acesso à API do Governanta. Único ponto de contato com o backend.
// Dinheiro sempre em centavos inteiros (`…Cents`); datas YYYY-MM-DD; instantes ISO.

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3101").replace(/\/$/, "");

// ---------- Tipos ----------

export type ListReason = "depleted" | "manual" | "low_stock" | "forecast";
export type ListStatus = "open" | "in_cart" | "purchased";
export type QtyUnit = "g" | "kg" | "ml" | "l" | "un" | "dz" | "pct";
export const QTY_UNITS: QtyUnit[] = ["un", "kg", "g", "l", "ml", "dz", "pct"];

export type ShoppingListItem = {
  id: string;
  genericProductId: string | null;
  name: string;
  reason: ListReason;
  status: ListStatus;
  addedAt: string;
  quantity?: number | null;
  unit?: QtyUnit | null;
  /** Lugar da casa, se a API mandar. Sem ele a Lista usa o lugar do estoque. */
  location?: string | null;
};

export type Product = {
  id: string;
  name: string;
  unit: string | null;
  location?: string | null;
  onList?: boolean;
  expectedDurationDays?: number | null;
};

/** Lugares da casa aceitos pela API, na ordem em que a Lista e a Despensa os mostram. */
export const LOCATIONS = ["Hortifruti", "Geladeira", "Padaria", "Despensa", "Molhos e temperos", "Bebidas", "Congelados", "Limpeza"] as const;
export type Location = (typeof LOCATIONS)[number];

export type InventoryItem = {
  genericProductId: string;
  name: string;
  brand: string | null;
  packageQty: number | null;
  packageUnit: string | null;
  packages: number;
  remainingFraction: number | null;
  expiresAt: string | null;
  status: "expired" | "expiring" | "ok" | "unknown";
  location: string | null;
  daysToExpiry: number | null;
  expectedDurationDays?: number | null;
};

export type EventSource = "touch" | "voice";

export type GovernantaEvent = {
  id: string;
  type: string;
  occurredAt: string;
  genericProductId: string | null;
  productName: string | null;
  source: string;
  payload: Record<string, unknown> | null;
};

export type Confidence = "low" | "medium" | "high";

export type ForecastItem = {
  genericProductId: string;
  name: string;
  method: "median" | "mean" | "declared" | "repurchase" | "prior" | "diet";
  nObservations: number;
  expectedDepletionAt: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  daysLeft: number | null;
  confidence: Confidence;
  irregular: boolean;
  wasteRisk: boolean;
};

export type PlanningSuggestion = {
  genericProductId: string;
  name: string;
  reason: "missing" | "forecast";
  windowLabel: string;
  decision: "include" | "skip" | null;
  /** Quanto comprar (pela dieta ou pelo ritmo), se a API souber: "2 × 13 unidades". */
  suggestedQuantity?: { quantity: number; unit: DietUnit; packages: number | null; packageLabel: string | null; label: string } | null;
};

export type Planning = {
  nextTrip: string | null;
  followingTrip: string | null;
  nextTripLabel?: string | null;
  daysUntil?: number | null;
  estimatedSpendCents?: { min: number; max: number } | null;
  onList?: { listItemId: string; name: string; quantityLabel: string }[];
  suggestions?: PlanningSuggestion[];
};

export type Settings = { shopDays: number[]; anticipationEnabled: boolean };

export type AskResult = {
  answer: string;
  canMake: boolean | null;
  have: string[];
  missing: { name: string; genericProductId: string | null }[];
  model: string;
  usage: { inputTokens: number; outputTokens: number };
};

export type ProductDetail = {
  id: string;
  name: string;
  displayName: string;
  location: string | null;
  onList: boolean;
  listItemId: string | null;
  forecast: ForecastItem | null;
  stock: { remainingFraction: number | null; packages: number; label: string };
  typicalDuration: { minDays: number; maxDays: number; perLabel: string } | null;
  lastPurchase: { date: string; quantityLabel: string; merchantName: string | null } | null;
  lastPriceCents: number | null;
  avgPriceCents: number | null;
  priceCount: number;
  usualMerchant: { name: string; count: number; total: number } | null;
  recentPrices: { date: string; priceCents: number; merchantName: string | null }[];
};

export type ProductPrices = {
  name: string;
  location: string | null;
  recordCount: number;
  monthsSpan: number;
  byMerchant: { merchantName: string; lastPriceCents: number; lastSeen: string; count: number; isLowest: boolean }[];
  monthly: { month: string; avgPriceCents: number }[];
  changePct: number | null;
  fewRecords: boolean;
};

export type ReceiptSummary = {
  id: string;
  accessKey: string;
  merchantName: string | null;
  issuedAt: string;
  itemCount: number;
  totalCents: number;
  status: "parsed" | "confirmed";
};

export type ReceiptLine = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  totalCents: number;
  genericProductId: string | null;
  name: string | null;
};

export type ReceiptToConfirm = ReceiptLine & {
  suggestion: { genericProductId: string; name: string; confidence: number } | null;
  isNew: boolean;
};

export type ReceiptReview = {
  receipt: ReceiptSummary;
  autoMatched: ReceiptLine[];
  toConfirm: ReceiptToConfirm[];
  listMatches: string[];
};

export type ReceiptDecision = { lineId: string; genericProductId?: string; newName?: string; ignore?: boolean };

export type ReceiptConfirmResult = { purchased: number; newProducts: string[]; listItemsPurchased: string[]; totalCents: number };

export type ReceiptMonth = { month: string; count: number; totalCents: number; receipts: (ReceiptSummary & { weekdayLabel: string })[] };

export type ReceiptDetail = {
  receipt: ReceiptSummary;
  listItemsServed: number;
  groups: { location: string; items: { name: string; quantityLabel: string; unitPriceCents: number; totalCents: number; isNew: boolean }[] }[];
};

export type FinanceSummary = {
  month: string;
  totalCents: number;
  prevMonthTotalCents: number;
  changePct: number | null;
  byWeek: { label: string; totalCents: number; current: boolean }[];
  byCategory: { name: string; totalCents: number }[];
  topIncreases: { name: string; fromCents: number; toCents: number; pct: number; unitLabel: string | null }[];
  byMerchant: { name: string; totalCents: number }[];
};

export type HouseholdPrefs = {
  voiceButtonAlwaysVisible: boolean;
  dimAtNight: boolean;
  notifyEveBeforeTrip: boolean;
  notifyRunningOut: boolean;
  weeklySpendSummary: boolean;
};

export type Household = {
  name: string;
  members: string[];
  region: string | null;
  onboardedAt: string | null;
  prefs: HouseholdPrefs;
  frequentMerchantsCount: number;
  lastSyncAt: string | null;
};

export type Member = { id: string; handle: string; displayName: string; hasToken: boolean };
export type Zone = { id: string; code: string; name: string; notifyOnLeave: boolean };

// ---------- Dieta ----------

export type DietUnit = "g" | "ml" | "un" | "mg" | "ui";

export type DietItem = {
  id: string;
  position: number;
  rawName: string;
  quantity: number | null;
  unit: DietUnit | null;
  genericProductId: string | null;
  productName: string | null;
  gramsPerUnit: number | null;
};
export type DietOption = { id: string; position: number; label: string; weight: number | null; effectiveWeight: number; items: DietItem[] };
export type DietSlot = {
  id: string;
  position: number;
  kind: "food" | "supplement";
  optional: boolean;
  adLibitum: boolean;
  includeOptional: boolean;
  note: string | null;
  options: DietOption[];
};
export type DietMeal = { id: string; position: number; name: string; slots: DietSlot[] };
export type DietLinkSuggestion = {
  rawName: string;
  status: "alias" | "exact" | "suggest" | "new";
  genericProductId: string | null;
  name: string | null;
  confidence: number;
  needsConfirmation: boolean;
  proposedName: string;
  gramsPerUnit: number | null;
};
export type DietLink = {
  rawName: string;
  genericProductId: string | null;
  productName: string | null;
  gramsPerUnit: number | null;
  units: DietUnit[];
  usedIn: number;
  adLibitumOnly: boolean;
  suggestion: DietLinkSuggestion | null;
};
export type DietException = { date: string; kind: "skipped" | "partial"; note: string | null };
export type DietPlan = {
  id: string;
  name: string;
  memberId: string | null;
  memberName: string | null;
  active: boolean;
  dietWeekdays: number[];
  createdAt: string;
  rawText: string;
  dietDayFraction: number;
  meals: DietMeal[];
  exceptions: DietException[];
  links: DietLink[];
  unlinkedCount?: number;
};
export type DietLinkInput = { rawName: string; genericProductId?: string | null; newProductName?: string; gramsPerUnit?: number | null };
export type DietChoiceInput = { slotId: string; weights?: { optionId: string; weight: number }[]; includeOptional?: boolean };
export type DietRates = {
  planIds: string[];
  items: { genericProductId: string; name: string; perDay: number; unit: DietUnit; daysLeft: number | null; hint: string | null }[];
  unlinked: { rawName: string; perDay: number; unit: DietUnit }[];
};
export type DietShopping = {
  nextTrip: string;
  until: string;
  days: number;
  items: {
    genericProductId: string;
    name: string;
    perDay: number;
    unit: DietUnit;
    needed: number;
    inStock: number | null;
    toBuy: number;
    packagesToBuy: number | null;
    packageLabel: string | null;
    hint: string | null;
  }[];
};

export type ImportError = "invalid_key" | "not_found" | "unsupported_uf" | "parse_failed" | "captcha" | "sefaz_unavailable";

// ---------- Estado de conexão (pub-sub mínimo) ----------

type ConnectionState = "unknown" | "online" | "offline";
let connection: ConnectionState = "unknown";
let lastOkAt: number | null = null;
const bus = typeof window !== "undefined" ? new EventTarget() : null;

function setConnection(next: ConnectionState) {
  if (next === "online") lastOkAt = Date.now();
  if (next === connection) return;
  connection = next;
  bus?.dispatchEvent(new Event("connection"));
}

export function getConnection(): ConnectionState {
  return connection;
}

/** Instante da última resposta da API (para "sincronizado há 2 min"). */
export function getLastOkAt(): number | null {
  return lastOkAt;
}

export function subscribeConnection(cb: () => void): () => void {
  bus?.addEventListener("connection", cb);
  return () => bus?.removeEventListener("connection", cb);
}

/** Pede a tudo que está na tela que recarregue (depois de qualquer mudança ou de "Tentar agora"). */
export function requestRetry() {
  bus?.dispatchEvent(new Event("retry"));
}

export function subscribeRetry(cb: () => void): () => void {
  bus?.addEventListener("retry", cb);
  return () => bus?.removeEventListener("retry", cb);
}

// ---------- Código da casa (HOUSEHOLD_TOKEN da API) ----------
// Vem do build (NEXT_PUBLIC_HOUSEHOLD_TOKEN) ou é digitada uma vez no aparelho e fica guardada nele.

const TOKEN_KEY = "governanta.householdToken";

export function getToken(): string | null {
  try {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) return saved;
  } catch {
    // sem localStorage (navegação privada / pré-renderização)
  }
  return process.env.NEXT_PUBLIC_HOUSEHOLD_TOKEN || null;
}

export function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignora: sem armazenamento, vale só o token do build
  }
  unauthorized = false;
  bus?.dispatchEvent(new Event("auth"));
  requestRetry();
}

let unauthorized = false;
/** A API respondeu 401: falta (ou mudou) a chave da casa neste aparelho. */
export function isUnauthorized(): boolean {
  return unauthorized;
}

export function subscribeAuth(cb: () => void): () => void {
  bus?.addEventListener("auth", cb);
  return () => bus?.removeEventListener("auth", cb);
}

/** `fetch` com a chave da casa, para quem chama a API por fora deste módulo (ex.: resolveProduct da voz). */
export const authedFetch: typeof fetch = (input, init) => {
  const token = getToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
};

// ---------- fetch ----------

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
  }
}

/** Falha de rede ou do servidor (vale tentar de novo), em oposição a um "não" da API. */
export function isRetryable(err: unknown): boolean {
  return !(err instanceof ApiError) || err.status >= 500;
}

async function request<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let res: Response;
  try {
    res = await authedFetch(`${API_URL}${path}`, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
      cache: "no-store",
    });
  } catch (err) {
    if ((err as Error).name !== "AbortError") setConnection("offline");
    throw err;
  }
  setConnection("online");
  if (res.status === 401 && !unauthorized) {
    unauthorized = true;
    bus?.dispatchEvent(new Event("auth"));
  }
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    let code: string | null = null;
    try {
      const data = (await res.json()) as { message?: string; error?: string };
      code = data.error ?? null;
      message = data.message ?? data.error ?? message;
    } catch {
      // corpo vazio ou não-JSON
    }
    throw new ApiError(message, res.status, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

// ---------- Endpoints ----------

export const api = {
  getShoppingList: (signal?: AbortSignal, includePurchasedToday = false) =>
    request<{ items: ShoppingListItem[] }>(`/shopping-list${includePurchasedToday ? "?includePurchased=today" : ""}`, { signal }).then((r) => r.items),

  addListItem: (input: ({ genericProductId: string } | { freeText: string }) & { quantity?: number | null; unit?: QtyUnit | null }) =>
    request<{ item: ShoppingListItem }>("/shopping-list/items", { method: "POST", body: input }).then((r) => r.item),

  updateListItem: (id: string, patch: { status?: ListStatus; quantity?: number | null; unit?: QtyUnit | null }) =>
    request<{ item: ShoppingListItem }>(`/shopping-list/items/${enc(id)}`, { method: "PATCH", body: patch }).then((r) => r.item),

  removeListItem: (id: string) => request<void>(`/shopping-list/items/${enc(id)}`, { method: "DELETE" }),

  clearPurchased: () => request<void>("/shopping-list/clear-purchased", { method: "POST" }),

  depleted: (genericProductId: string, source: EventSource = "touch") =>
    request<{ event: GovernantaEvent; listItem: ShoppingListItem | null }>("/events/depleted", { method: "POST", body: { genericProductId, source } }),

  discarded: (genericProductId: string, source: EventSource = "touch") =>
    request<{ event: GovernantaEvent }>("/events/discarded", { method: "POST", body: { genericProductId, source } }),

  used: (input: { genericProductId: string; fraction?: number; quantity?: number; unit?: string; source: EventSource }) =>
    request<{ event: GovernantaEvent; remainingFraction: number | null }>("/events/used", { method: "POST", body: input }),

  getEvents: (limit = 50, signal?: AbortSignal) => request<{ events: GovernantaEvent[] }>(`/events?limit=${limit}`, { signal }).then((r) => r.events),

  searchProducts: (q: string, signal?: AbortSignal) => request<{ products: Product[] }>(`/products?q=${enc(q)}`, { signal }).then((r) => r.products),

  frequentProducts: (signal?: AbortSignal) => request<{ products: Product[] }>("/products?frequent=1", { signal }).then((r) => r.products),

  createProduct: (name: string) => request<{ product: Product }>("/products", { method: "POST", body: { name } }).then((r) => r.product),

  updateProduct: (id: string, patch: { location?: Location | null; expectedDurationDays?: number | null }) =>
    request<{ product: Product }>(`/products/${enc(id)}`, { method: "PATCH", body: patch }).then((r) => r.product),

  getProduct: (id: string, signal?: AbortSignal) => request<ProductDetail>(`/products/${enc(id)}`, { signal }),

  getProductPrices: (id: string, signal?: AbortSignal) => request<ProductPrices>(`/products/${enc(id)}/prices`, { signal }),

  getInventory: (signal?: AbortSignal) => request<{ items: InventoryItem[] }>("/inventory", { signal }).then((r) => r.items),

  getForecast: (signal?: AbortSignal) => request<{ items: ForecastItem[] }>("/forecast", { signal }).then((r) => r.items),

  getPlanning: (signal?: AbortSignal) => request<Planning>("/planning", { signal }),

  decidePlanning: (genericProductId: string, decision: "include" | "skip" | null) =>
    request<{ ok: true }>("/planning/decisions", { method: "POST", body: { genericProductId, decision } }),

  includeAllPlanning: () => request<{ added: string[] }>("/planning/include-all", { method: "POST" }),

  getSettings: (signal?: AbortSignal) => request<Settings | { settings: Settings }>("/settings", { signal }).then(unwrapSettings),

  saveSettings: (settings: Settings) => request<Settings | { settings: Settings }>("/settings", { method: "PUT", body: settings }).then(unwrapSettings),

  ask: (question: string) => request<AskResult>("/ask", { method: "POST", body: { question } }),

  importReceipt: (input: { qrUrl: string } | { accessKey: string } | { fixture: "synthetic" }) =>
    request<{ receipt: ReceiptSummary }>("/receipts/import", { method: "POST", body: input }).then((r) => r.receipt),

  getReceiptReview: (id: string, signal?: AbortSignal) => request<ReceiptReview>(`/receipts/${enc(id)}`, { signal }),

  confirmReceipt: (id: string, decisions: ReceiptDecision[]) =>
    request<ReceiptConfirmResult>(`/receipts/${enc(id)}/confirm`, { method: "POST", body: { decisions } }),

  getReceipts: (signal?: AbortSignal) => request<{ months: ReceiptMonth[] }>("/receipts", { signal }).then((r) => r.months),

  getReceiptDetail: (id: string, signal?: AbortSignal) => request<ReceiptDetail>(`/receipts/${enc(id)}/detail`, { signal }),

  getFinance: (signal?: AbortSignal, month?: string) =>
    request<FinanceSummary>(`/finance/summary${month ? `?month=${enc(month)}` : ""}`, { signal }),

  getHousehold: (signal?: AbortSignal) => request<Household>("/household", { signal }),

  saveHousehold: (patch: Partial<Omit<Household, "prefs">> & { prefs?: Partial<HouseholdPrefs> }) =>
    request<Household>("/household", { method: "PUT", body: patch }),

  completeOnboarding: () => request<{ onboardedAt: string }>("/household/onboarding/complete", { method: "POST" }),

  // Avisos no iPhone (Atalhos): moradores com token próprio e zonas de presença.
  getMembers: (signal?: AbortSignal) => request<{ members: Member[] }>("/members", { signal }).then((r) => r.members),
  addMember: (displayName: string) => request<{ member: Member }>("/members", { method: "POST", body: { displayName } }).then((r) => r.member),
  removeMember: (id: string) => request<void>(`/members/${enc(id)}`, { method: "DELETE" }),
  memberToken: (id: string) => request<{ token: string }>(`/members/${enc(id)}/token`, { method: "POST" }).then((r) => r.token),
  getZones: (signal?: AbortSignal) => request<{ zones: Zone[] }>("/zones", { signal }).then((r) => r.zones),
  addZone: (zone: Omit<Zone, "id">) => request<{ zone: Zone }>("/zones", { method: "POST", body: zone }).then((r) => r.zone),
  updateZone: (id: string, patch: Partial<Omit<Zone, "id">>) => request<{ zone: Zone }>(`/zones/${enc(id)}`, { method: "PATCH", body: patch }).then((r) => r.zone),
  removeZone: (id: string) => request<void>(`/zones/${enc(id)}`, { method: "DELETE" }),

  // Dieta: importar o texto da nutricionista, revisar (produtos, escolhas, dias), ativar e acompanhar.
  getDiets: (signal?: AbortSignal) => request<{ plans: DietPlan[] }>("/diet?all=1", { signal }).then((r) => r.plans),
  getDiet: (id: string, signal?: AbortSignal) => request<{ plan: DietPlan }>(`/diet/${enc(id)}`, { signal }).then((r) => r.plan),
  importDiet: (input: { text: string; memberId?: string | null; name?: string }) =>
    request<{ planId: string; plan: DietPlan; warnings: string[] }>("/diet/import", { method: "POST", body: input }),
  updateDiet: (id: string, patch: { name?: string; dietWeekdays?: number[]; active?: boolean }) =>
    request<{ plan: DietPlan }>(`/diet/${enc(id)}`, { method: "PATCH", body: patch }).then((r) => r.plan),
  deleteDiet: (id: string) => request<void>(`/diet/${enc(id)}`, { method: "DELETE" }),
  saveDietLinks: (id: string, links: DietLinkInput[]) =>
    request<{ plan: DietPlan; createdProducts: { id: string; name: string }[] }>(`/diet/${enc(id)}/links`, { method: "PUT", body: { links } }).then((r) => r.plan),
  saveDietChoices: (id: string, slots: DietChoiceInput[]) =>
    request<{ plan: DietPlan }>(`/diet/${enc(id)}/choices`, { method: "PUT", body: { slots } }).then((r) => r.plan),
  addDietException: (id: string, exception: DietException) =>
    request<{ exception: DietException }>(`/diet/${enc(id)}/exceptions`, { method: "POST", body: exception }).then((r) => r.exception),
  removeDietException: (id: string, date: string) => request<void>(`/diet/${enc(id)}/exceptions/${enc(date)}`, { method: "DELETE" }),
  logDiet: (input: { date?: string; mealId?: string | null; memberId?: string | null; genericProductId: string; quantity: number; unit: DietUnit }) =>
    request<{ remainingFraction: number | null }>("/diet/log", { method: "POST", body: input }),
  getDietRates: (planId?: string, signal?: AbortSignal) => request<DietRates>(`/diet/rates${planId ? `?planId=${enc(planId)}` : ""}`, { signal }),
  getDietShopping: (signal?: AbortSignal) => request<DietShopping>("/diet/shopping", { signal }),
};

// O contrato devolve as configurações direto no corpo; aceita também { settings } por garantia.
function unwrapSettings(r: Settings | { settings: Settings }): Settings {
  return "settings" in r ? r.settings : r;
}
