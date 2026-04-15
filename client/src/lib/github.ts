// ===================================================
// GitHub Issues をデータベースとして使うデータ層
// 依頼 → Issue、発注 → Issue Comment として保存
// ===================================================

export interface GHConfig {
  owner: string;   // GitHubユーザー名
  repo: string;    // リポジトリ名
  token: string;   // Personal Access Token
}

const DATA_LABEL = "zaiko-data";       // 在庫依頼のラベル
const ORDER_LABEL = "zaiko-order";     // 発注コメントの識別子

// ===== ビルド時に埋め込まれる設定 =====
// Vite の define で置換される（GitHub Actions Secrets → 環境変数 → define）
const BUILT_IN_CONFIG: GHConfig | null = (() => {
  const owner = import.meta.env.VITE_GH_OWNER ?? "";
  const repo = import.meta.env.VITE_GH_REPO ?? "";
  const token = import.meta.env.VITE_GH_TOKEN ?? "";
  if (owner && repo && token) return { owner, repo, token };
  return null;
})();

// 設定を取得（ビルド埋め込み優先、フォールバックなし）
export function loadConfig(): GHConfig | null {
  return BUILT_IN_CONFIG;
}

// ===== GitHub API ヘルパー =====
async function ghFetch(cfg: GHConfig, path: string, options: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `GitHub API エラー: ${res.status}`);
  }
  return res.json();
}

// ===== ラベルの作成（初回のみ） =====
export async function ensureLabels(cfg: GHConfig) {
  const labels = [
    { name: DATA_LABEL, color: "0075ca", description: "在庫管理: 依頼データ" },
    { name: ORDER_LABEL, color: "e4e669", description: "在庫管理: 発注データ" },
  ];
  for (const label of labels) {
    try {
      await ghFetch(cfg, `/repos/${cfg.owner}/${cfg.repo}/labels`, {
        method: "POST",
        body: JSON.stringify(label),
      });
    } catch {
      // 既存ラベルはスキップ
    }
  }
}

// ===================================================
// 型定義
// ===================================================
export interface StockRequest {
  id: number;           // Issue番号
  type: "出" | "求";
  postDeadline: string;
  requesterBase: string;
  requesterName: string;
  requesterExtension: string;
  requesterEmail: string;
  pin: string;          // PINはIssue bodyに暗号化せず保存（社内ツール想定）
  note: string;
  status: "受付中" | "対応中" | "完了" | "キャンセル";
  createdAt: string;
  items: StockItem[];
}

export interface StockItem {
  id: number;           // items配列のindex（0始まり）
  requestId: number;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  itemNote: string;
  sortOrder: number;
}

export interface Order {
  id: number;           // コメントID
  requestId: number;
  itemId: number;
  orderedQuantity: number;
  ordererName: string;
  ordererExtension: string;
  orderDate: string;
  deliveryDate: string;
  note: string;
  createdAt: string;
}

export type StockRequestWithItems = StockRequest;

// ===================================================
// Issue body ↔ データ のシリアライズ
// ===================================================
function encodeRequest(data: Omit<StockRequest, "id" | "createdAt">): string {
  return `<!-- ZAIKO_DATA\n${JSON.stringify(data)}\n-->`;
}

function decodeRequest(body: string): Omit<StockRequest, "id" | "createdAt"> | null {
  try {
    const m = body.match(/<!-- ZAIKO_DATA\n([\s\S]+?)\n-->/);
    return m ? JSON.parse(m[1]) : null;
  } catch { return null; }
}

function encodeOrder(data: Omit<Order, "id" | "createdAt">): string {
  return `<!-- ZAIKO_ORDER\n${JSON.stringify(data)}\n-->`;
}

function decodeOrder(body: string): Omit<Order, "id" | "createdAt"> | null {
  try {
    const m = body.match(/<!-- ZAIKO_ORDER\n([\s\S]+?)\n-->/);
    return m ? JSON.parse(m[1]) : null;
  } catch { return null; }
}

// Issue → StockRequest 変換
function issueToRequest(issue: any): StockRequest | null {
  const data = decodeRequest(issue.body ?? "");
  if (!data) return null;
  return {
    ...data,
    id: issue.number,
    createdAt: issue.created_at,
  };
}

// ===================================================
// CRUD操作
// ===================================================

export async function getAllRequests(cfg: GHConfig): Promise<StockRequest[]> {
  // open + closed両方取得（完了済みも表示）
  const [open, closed] = await Promise.all([
    ghFetch(cfg, `/repos/${cfg.owner}/${cfg.repo}/issues?labels=${DATA_LABEL}&state=open&per_page=100`),
    ghFetch(cfg, `/repos/${cfg.owner}/${cfg.repo}/issues?labels=${DATA_LABEL}&state=closed&per_page=100`),
  ]);
  return [...open, ...closed]
    .map(issueToRequest)
    .filter((r): r is StockRequest => r !== null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getRequest(cfg: GHConfig, id: number): Promise<StockRequest | null> {
  const issue = await ghFetch(cfg, `/repos/${cfg.owner}/${cfg.repo}/issues/${id}`);
  return issueToRequest(issue);
}

export async function createRequest(
  cfg: GHConfig,
  data: Omit<StockRequest, "id" | "createdAt">
): Promise<StockRequest> {
  await ensureLabels(cfg);
  const title = `[在庫依頼] ${data.requesterBase} / ${data.items.map(i => i.productName).join("・")}`;
  const body = encodeRequest(data);
  const issue = await ghFetch(cfg, `/repos/${cfg.owner}/${cfg.repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body, labels: [DATA_LABEL] }),
  });
  return issueToRequest(issue)!;
}

export async function updateRequest(
  cfg: GHConfig,
  id: number,
  data: Partial<Omit<StockRequest, "id" | "createdAt">>
): Promise<StockRequest> {
  const existing = await getRequest(cfg, id);
  if (!existing) throw new Error("依頼が見つかりません");
  const merged = { ...existing, ...data };
  const title = `[在庫依頼] ${merged.requesterBase} / ${merged.items.map(i => i.productName).join("・")}`;
  const body = encodeRequest(merged);
  // statusが完了なら Issueをclose
  const state = merged.status === "完了" || merged.status === "キャンセル" ? "closed" : "open";
  const issue = await ghFetch(cfg, `/repos/${cfg.owner}/${cfg.repo}/issues/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title, body, state }),
  });
  return issueToRequest(issue)!;
}

export async function deleteRequest(cfg: GHConfig, id: number): Promise<void> {
  // GitHub APIではIssueの物理削除不可のため、キャンセルステータスにしてclose
  await updateRequest(cfg, id, { status: "キャンセル" });
}

export async function verifyPin(cfg: GHConfig, id: number, pin: string): Promise<boolean> {
  const req = await getRequest(cfg, id);
  return req?.pin === pin;
}

// ===== 発注 =====
export async function getOrders(cfg: GHConfig, requestId: number): Promise<Order[]> {
  const comments = await ghFetch(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/issues/${requestId}/comments?per_page=100`
  );
  return comments
    .map((c: any) => {
      const data = decodeOrder(c.body ?? "");
      if (!data) return null;
      return { ...data, id: c.id, createdAt: c.created_at } as Order;
    })
    .filter((o: Order | null): o is Order => o !== null);
}

export async function createOrder(
  cfg: GHConfig,
  data: Omit<Order, "id" | "createdAt">
): Promise<{ order: Order; autoCompleted: boolean }> {
  const body = encodeOrder(data);
  const comment = await ghFetch(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/issues/${data.requestId}/comments`,
    { method: "POST", body: JSON.stringify({ body }) }
  );
  const order: Order = { ...data, id: comment.id, createdAt: comment.created_at };

  // 自動完了チェック
  const req = await getRequest(cfg, data.requestId);
  if (!req || req.status === "完了" || req.status === "キャンセル") {
    return { order, autoCompleted: false };
  }
  const allOrders = await getOrders(cfg, data.requestId);
  const allFulfilled = req.items.every((item) => {
    const total = allOrders
      .filter((o) => o.itemId === item.id)
      .reduce((s, o) => s + o.orderedQuantity, 0);
    return total >= item.quantity;
  });

  if (allFulfilled) {
    await updateRequest(cfg, data.requestId, { status: "完了" });
    return { order, autoCompleted: true };
  } else {
    if (allOrders.length > 0 && req.status === "受付中") {
      await updateRequest(cfg, data.requestId, { status: "対応中" });
    }
    return { order, autoCompleted: false };
  }
}
