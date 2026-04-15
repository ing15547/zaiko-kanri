import Dexie, { type Table } from "dexie";

// ===== 型定義 =====
export interface StockRequest {
  id?: number;
  type: "出" | "求";
  postDeadline: string;
  requesterBase: string;
  requesterName: string;
  requesterExtension: string;
  requesterEmail: string;
  pin: string;
  note: string;
  status: "受付中" | "対応中" | "完了" | "キャンセル";
  createdAt: string;
}

export interface StockItem {
  id?: number;
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
  id?: number;
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

export interface StockRequestWithItems extends StockRequest {
  items: StockItem[];
}

// ===== Dexie DB =====
class ZaikoDB extends Dexie {
  stockRequests!: Table<StockRequest, number>;
  stockItems!: Table<StockItem, number>;
  orders!: Table<Order, number>;

  constructor() {
    super("zaiko-kanri");
    this.version(1).stores({
      stockRequests: "++id, type, status, requesterBase, createdAt",
      stockItems: "++id, requestId, productName, productCode",
      orders: "++id, requestId, itemId, createdAt",
    });
  }
}

export const db = new ZaikoDB();

// ===== ストレージ操作 =====

export async function getAllRequestsWithItems(): Promise<StockRequestWithItems[]> {
  const reqs = await db.stockRequests.orderBy("createdAt").reverse().toArray();
  return Promise.all(
    reqs.map(async (r) => ({
      ...r,
      items: await db.stockItems
        .where("requestId")
        .equals(r.id!)
        .sortBy("sortOrder"),
    }))
  );
}

export async function getRequestWithItems(id: number): Promise<StockRequestWithItems | undefined> {
  const req = await db.stockRequests.get(id);
  if (!req) return undefined;
  const items = await db.stockItems.where("requestId").equals(id).sortBy("sortOrder");
  return { ...req, items };
}

export async function createRequest(
  header: Omit<StockRequest, "id" | "createdAt">,
  items: Omit<StockItem, "id" | "requestId">[]
): Promise<StockRequestWithItems> {
  const now = new Date().toISOString();
  const id = await db.stockRequests.add({ ...header, createdAt: now });
  for (const [i, item] of items.entries()) {
    await db.stockItems.add({ ...item, requestId: id, sortOrder: i });
  }
  return (await getRequestWithItems(id))!;
}

export async function updateRequest(
  id: number,
  header: Partial<Omit<StockRequest, "id" | "createdAt">>,
  items: Omit<StockItem, "id" | "requestId">[]
): Promise<StockRequestWithItems | undefined> {
  await db.stockRequests.update(id, header);
  await db.stockItems.where("requestId").equals(id).delete();
  for (const [i, item] of items.entries()) {
    await db.stockItems.add({ ...item, requestId: id, sortOrder: i });
  }
  return getRequestWithItems(id);
}

export async function deleteRequest(id: number): Promise<void> {
  await db.stockItems.where("requestId").equals(id).delete();
  await db.orders.where("requestId").equals(id).delete();
  await db.stockRequests.delete(id);
}

export async function verifyPin(id: number, pin: string): Promise<boolean> {
  const req = await db.stockRequests.get(id);
  return req?.pin === pin;
}

export async function getOrdersByRequestId(requestId: number): Promise<Order[]> {
  return db.orders.where("requestId").equals(requestId).toArray();
}

export async function createOrder(
  data: Omit<Order, "id" | "createdAt">
): Promise<{ order: Order; autoCompleted: boolean }> {
  const now = new Date().toISOString();
  const id = await db.orders.add({ ...data, createdAt: now });
  const order = (await db.orders.get(id))!;

  // 自動完了チェック
  const req = await getRequestWithItems(data.requestId);
  if (!req || req.status === "完了" || req.status === "キャンセル") {
    return { order, autoCompleted: false };
  }

  const allOrders = await getOrdersByRequestId(data.requestId);
  const allFulfilled = req.items.every((item) => {
    const total = allOrders
      .filter((o) => o.itemId === item.id)
      .reduce((s, o) => s + o.orderedQuantity, 0);
    return total >= item.quantity;
  });

  if (allFulfilled) {
    await db.stockRequests.update(data.requestId, { status: "完了" });
    return { order, autoCompleted: true };
  } else {
    const hasAny = allOrders.length > 0;
    if (hasAny && req.status === "受付中") {
      await db.stockRequests.update(data.requestId, { status: "対応中" });
    }
    return { order, autoCompleted: false };
  }
}
