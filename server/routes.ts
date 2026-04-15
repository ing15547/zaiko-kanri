import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertOrderSchema } from "@shared/schema";
import { z } from "zod";

// 依頼作成用リクエストボディのスキーマ
const createRequestBodySchema = z.object({
  type: z.enum(["出", "求"]),
  postDeadline: z.string().min(1, "掲示期限は必須です"),
  requesterBase: z.string().min(1, "依頼拠点は必須です"),
  requesterName: z.string().min(1, "依頼者名は必須です"),
  requesterExtension: z.string().default(""),
  requesterEmail: z.string().email("正しいメールアドレスを入力してください"),
  pin: z.string().min(4, "PINは4〜6桁").max(6, "PINは4〜6桁").regex(/^\d+$/, "PINは数字のみ"),
  note: z.string().default(""),
  status: z.string().default("受付中"),
  items: z.array(z.object({
    productCode: z.string().min(1, "商品コードは必須です"),
    productName: z.string().min(1, "商品名は必須です"),
    quantity: z.coerce.number().positive("数量は1以上"),
    unit: z.string().default("本"),
    expiryDate: z.string().default(""),
    itemNote: z.string().default(""),
    sortOrder: z.number().default(0),
    requestId: z.number().default(0),  // 後で設定
  })).min(1, "商品を1件以上追加してください").max(10),
});

export async function registerRoutes(httpServer: Server, app: Express) {

  // ===== 依頼一覧 =====
  app.get("/api/requests", (_req, res) => {
    try {
      res.json(storage.getAllRequestsWithItems());
    } catch (err) {
      res.status(500).json({ error: "取得に失敗しました" });
    }
  });

  // ===== 依頼詳細 =====
  app.get("/api/requests/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const request = storage.getRequestWithItems(id);
      if (!request) return res.status(404).json({ error: "依頼が見つかりません" });
      // PINは返さない（セキュリティ）
      const { pin, ...safe } = request;
      res.json(safe);
    } catch (err) {
      res.status(500).json({ error: "取得に失敗しました" });
    }
  });

  // ===== 依頼作成 =====
  app.post("/api/requests", (req, res) => {
    try {
      const parsed = createRequestBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "入力内容が不正です", details: parsed.error.flatten() });
      }
      const { items, ...header } = parsed.data;
      const result = storage.createRequest(
        header as any,
        items.map((item, i) => ({ ...item, requestId: 0, sortOrder: i }))
      );
      // PINを返さない
      const { pin, ...safe } = result;
      res.status(201).json(safe);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "作成に失敗しました" });
    }
  });

  // ===== PIN検証 =====
  app.post("/api/requests/:id/verify-pin", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { pin } = z.object({ pin: z.string() }).parse(req.body);
      const valid = storage.verifyPin(id, pin);
      res.json({ valid });
    } catch (err) {
      res.status(500).json({ error: "検証に失敗しました" });
    }
  });

  // ===== 依頼編集（PIN検証） =====
  app.put("/api/requests/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = storage.getRequestWithItems(id);
      if (!existing) return res.status(404).json({ error: "依頼が見つかりません" });

      const { pin } = req.body;
      if (!pin || !storage.verifyPin(id, pin)) {
        return res.status(403).json({ error: "PINが正しくありません" });
      }

      const parsed = createRequestBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "入力内容が不正です", details: parsed.error.flatten() });
      }
      const { items, ...header } = parsed.data;
      const result = storage.updateRequest(
        id,
        header as any,
        items.map((item, i) => ({ ...item, requestId: id, sortOrder: i }))
      );
      if (result) {
        const { pin: _pin, ...safe } = result;
        res.json(safe);
      } else {
        res.status(404).json({ error: "更新に失敗しました" });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "更新に失敗しました" });
    }
  });

  // ===== 依頼削除（PIN検証） =====
  app.delete("/api/requests/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = storage.getRequestWithItems(id);
      if (!existing) return res.status(404).json({ error: "依頼が見つかりません" });

      const pin = req.query.pin as string;
      if (!pin || !storage.verifyPin(id, pin)) {
        return res.status(403).json({ error: "PINが正しくありません" });
      }
      storage.deleteRequest(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "削除に失敗しました" });
    }
  });

  // ===== 発注 =====
  app.get("/api/requests/:id/orders", (req, res) => {
    try {
      res.json(storage.getOrdersByRequestId(parseInt(req.params.id)));
    } catch (err) {
      res.status(500).json({ error: "取得に失敗しました" });
    }
  });

  app.post("/api/orders", (req, res) => {
    try {
      // ordererExtensionを追加で受け付け
      const extendedSchema = insertOrderSchema.extend({
        ordererExtension: z.string().default(""),
      });
      const parsed = extendedSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "入力内容が不正です", details: parsed.error.flatten() });
      }
      const order = storage.createOrder(parsed.data);
      
      // createOrder内でcheckAndAutoCompleteが呼ばれているため、完了後のステータスを取得
      const updatedReq = storage.getRequestWithItems(parsed.data.requestId);
      const autoCompleted = updatedReq?.status === "完了";
      
      res.status(201).json({ 
        order, 
        autoCompleted,
        completedRequest: autoCompleted ? updatedReq : undefined,
      });
    } catch (err) {
      res.status(500).json({ error: "発注に失敗しました" });
    }
  });
}
