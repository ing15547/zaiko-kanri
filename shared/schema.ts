import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ===== 依頼ヘッダー（1依頼につき1レコード） =====
export const stockRequests = sqliteTable("stock_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),                         // "出"=出庫依頼 | "求"=入庫要求
  postDeadline: text("post_deadline").notNull(),         // 掲示期限（いつまで掲示するか）
  requesterBase: text("requester_base").notNull(),       // 依頼拠点
  requesterName: text("requester_name").notNull(),       // 依頼者名
  requesterExtension: text("requester_extension").default(""), // 内線番号
  note: text("note").default(""),                        // 全体備考
  status: text("status").notNull().default("受付中"),    // 受付中 | 対応中 | 完了 | キャンセル
  requesterEmail: text("requester_email").default(""),  // メールアドレス（完了通知用）
  pin: text("pin").notNull().default(""),                  // PIN（4〜6桁）— 編集・削除時に使用
  createdAt: text("created_at").notNull(),
});

// ===== 商品ライン（1依頼に最大10商品） =====
export const stockItems = sqliteTable("stock_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestId: integer("request_id").notNull(),            // 親依頼ID
  productCode: text("product_code").notNull(),           // 商品コード
  productName: text("product_name").notNull(),           // 商品名
  quantity: real("quantity").notNull(),                  // 数量
  unit: text("unit").notNull().default("本"),            // 単位（ケース/本/箱 など）
  expiryDate: text("expiry_date").default(""),           // 賞味期限
  itemNote: text("item_note").default(""),               // 商品個別備考
  sortOrder: integer("sort_order").notNull().default(0), // 表示順
});

// ===== 発注（発注者の対応） =====
export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestId: integer("request_id").notNull(),            // 対応する依頼ID
  itemId: integer("item_id").notNull(),                  // 対応する商品ラインID
  orderedQuantity: real("ordered_quantity").notNull(),   // 発注数量
  ordererName: text("orderer_name").notNull(),           // 発注者名
  ordererExtension: text("orderer_extension").default(""), // 発注者内線番号
  orderDate: text("order_date").notNull(),               // 発注日
  deliveryDate: text("delivery_date").default(""),       // 納期
  note: text("note").default(""),                        // 備考
  createdAt: text("created_at").notNull(),
});

// ===== Zodスキーマ =====
export const insertStockRequestSchema = createInsertSchema(stockRequests).omit({
  id: true,
  createdAt: true,
});

export const insertStockItemSchema = createInsertSchema(stockItems).omit({
  id: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
});

// ===== 型定義 =====
export type InsertStockRequest = z.infer<typeof insertStockRequestSchema>;
export type StockRequest = typeof stockRequests.$inferSelect;
export type InsertStockItem = z.infer<typeof insertStockItemSchema>;
export type StockItem = typeof stockItems.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// ===== フロント用複合型 =====
export type StockRequestWithItems = StockRequest & { items: StockItem[] };
