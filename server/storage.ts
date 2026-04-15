import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import {
  stockRequests,
  stockItems,
  orders,
  type StockRequest,
  type InsertStockRequest,
  type StockItem,
  type InsertStockItem,
  type Order,
  type InsertOrder,
  type StockRequestWithItems,
} from "@shared/schema";
import { sendCompletionEmail } from "./mailer";

const dbPath = process.env.DB_PATH || "zaiko.db";
const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

console.log(`[storage] データベースパス: ${dbPath}`);

// テーブル作成（既存テーブルは残しつつ新テーブルを追加）
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS stock_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    post_deadline TEXT DEFAULT '',
    requester_base TEXT DEFAULT '',
    requester_name TEXT NOT NULL,
    requester_extension TEXT DEFAULT '',
    note TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT '受付中',
    requester_email TEXT DEFAULT '',
    pin TEXT DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stock_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    product_code TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT '本',
    expiry_date TEXT DEFAULT '',
    item_note TEXT DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL DEFAULT 0,
    ordered_quantity REAL NOT NULL,
    orderer_name TEXT NOT NULL,
    orderer_extension TEXT DEFAULT '',
    order_date TEXT NOT NULL,
    delivery_date TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS _migration_done (id INTEGER PRIMARY KEY);
`);

// マイグレーション: 既存テーブルに不足カラムを追加
try { sqlite.exec(`ALTER TABLE stock_requests ADD COLUMN post_deadline TEXT NOT NULL DEFAULT '';`); } catch {}
try { sqlite.exec(`ALTER TABLE stock_requests ADD COLUMN requester_base TEXT NOT NULL DEFAULT '';`); } catch {}
try { sqlite.exec(`ALTER TABLE stock_requests ADD COLUMN requester_extension TEXT DEFAULT '';`); } catch {}
try { sqlite.exec(`ALTER TABLE stock_requests ADD COLUMN requester_email TEXT DEFAULT '';`); } catch {}
try { sqlite.exec(`ALTER TABLE stock_requests ADD COLUMN pin TEXT DEFAULT '';`); } catch {}
try { sqlite.exec(`ALTER TABLE orders ADD COLUMN item_id INTEGER NOT NULL DEFAULT 0;`); } catch {}
try { sqlite.exec(`ALTER TABLE orders ADD COLUMN orderer_extension TEXT DEFAULT '';`); } catch {}

// 旧 edit_token カラムがあっても問題ないが、使用しない
try { sqlite.exec(`ALTER TABLE stock_requests ADD COLUMN edit_token TEXT DEFAULT '';`); } catch {}

export interface IStorage {
  // 在庫依頼（ヘッダー）
  getAllRequestsWithItems(): StockRequestWithItems[];
  getRequestWithItems(id: number): StockRequestWithItems | undefined;
  createRequest(header: InsertStockRequest, items: InsertStockItem[]): StockRequestWithItems;
  updateRequestStatus(id: number, status: string): StockRequest | undefined;
  updateRequest(id: number, header: Partial<InsertStockRequest>, items: InsertStockItem[]): StockRequestWithItems | undefined;
  deleteRequest(id: number): void;

  // 発注
  getOrdersByRequestId(requestId: number): Order[];
  getOrdersByItemId(itemId: number): Order[];
  createOrder(data: InsertOrder): Order;

  // PIN検証
  verifyPin(id: number, pin: string): boolean;

  // 自動完了チェック
  checkAndAutoComplete(requestId: number): { completed: boolean; request?: StockRequestWithItems };
}

export const storage: IStorage = {
  getAllRequestsWithItems() {
    const reqs = db.select().from(stockRequests).all()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return reqs.map((r) => ({
      ...r,
      items: db.select().from(stockItems)
        .where(eq(stockItems.requestId, r.id))
        .all()
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  },

  getRequestWithItems(id: number) {
    const req = db.select().from(stockRequests).where(eq(stockRequests.id, id)).get();
    if (!req) return undefined;
    const items = db.select().from(stockItems)
      .where(eq(stockItems.requestId, id))
      .all()
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return { ...req, items };
  },

  createRequest(header: InsertStockRequest, items: InsertStockItem[]) {
    const now = new Date().toISOString();
    const req = db.insert(stockRequests).values({ ...header, createdAt: now }).returning().get();
    for (const [i, item] of items.entries()) {
      db.insert(stockItems).values({ ...item, requestId: req.id, sortOrder: i }).run();
    }
    const savedItems = db.select().from(stockItems).where(eq(stockItems.requestId, req.id)).all();
    return { ...req, items: savedItems };
  },

  updateRequestStatus(id: number, status: string) {
    return db.update(stockRequests).set({ status }).where(eq(stockRequests.id, id)).returning().get();
  },

  updateRequest(id: number, header: Partial<InsertStockRequest>, items: InsertStockItem[]) {
    const req = db.update(stockRequests).set(header).where(eq(stockRequests.id, id)).returning().get();
    if (!req) return undefined;
    // 既存商品ラインを削除して再作成
    db.delete(stockItems).where(eq(stockItems.requestId, id)).run();
    for (const [i, item] of items.entries()) {
      db.insert(stockItems).values({ ...item, requestId: id, sortOrder: i }).run();
    }
    const savedItems = db.select().from(stockItems).where(eq(stockItems.requestId, id)).all();
    return { ...req, items: savedItems };
  },

  deleteRequest(id: number) {
    db.delete(stockItems).where(eq(stockItems.requestId, id)).run();
    db.delete(orders).where(eq(orders.requestId, id)).run();
    db.delete(stockRequests).where(eq(stockRequests.id, id)).run();
  },

  getOrdersByRequestId(requestId: number) {
    return db.select().from(orders).where(eq(orders.requestId, requestId)).all();
  },

  getOrdersByItemId(itemId: number) {
    return db.select().from(orders).where(eq(orders.itemId, itemId)).all();
  },

  createOrder(data: InsertOrder) {
    const now = new Date().toISOString();
    const order = db.insert(orders).values({ ...data, createdAt: now }).returning().get();
    
    // 自動ステータス更新
    this.checkAndAutoComplete(data.requestId);
    
    return order;
  },

  verifyPin(id: number, pin: string): boolean {
    const req = db.select().from(stockRequests).where(eq(stockRequests.id, id)).get();
    if (!req) return false;
    return req.pin === pin;
  },

  // 残数がゼロになったら自動で「完了」にする
  checkAndAutoComplete(requestId: number): { completed: boolean; request?: StockRequestWithItems } {
    const req = this.getRequestWithItems(requestId);
    if (!req || req.status === "完了" || req.status === "キャンセル") {
      return { completed: false };
    }

    const reqOrders = this.getOrdersByRequestId(requestId);
    const allFulfilled = req.items.every((item) => {
      const totalOrdered = reqOrders
        .filter((o) => o.itemId === item.id)
        .reduce((s, o) => s + o.orderedQuantity, 0);
      return totalOrdered >= item.quantity;
    });

    if (allFulfilled) {
      this.updateRequestStatus(requestId, "完了");
      const updated = this.getRequestWithItems(requestId);

      // 完了通知メールを送信
      if (req.requesterEmail) {
        sendCompletionEmail({
          toEmail: req.requesterEmail,
          requestId: req.id,
          requesterName: req.requesterName,
          requesterBase: req.requesterBase,
          items: req.items.map((i) => ({
            productName: i.productName,
            productCode: i.productCode,
            quantity: i.quantity,
            unit: i.unit,
          })),
        }).catch((err) => console.error("[mailer] メール送信失敗:", err));
      }

      return { completed: true, request: updated };
    } else {
      // 一部発注がある場合は「対応中」
      const hasAnyOrder = reqOrders.length > 0;
      if (hasAnyOrder && req.status === "受付中") {
        this.updateRequestStatus(requestId, "対応中");
      }
      return { completed: false };
    }
  },
};
