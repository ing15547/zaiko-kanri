import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  getRequest, getOrders, createOrder, deleteRequest, verifyPin, loadConfig,
  type StockRequest, type StockItem, type Order,
} from "@/lib/github";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import {
  ArrowLeft, ArrowUpCircle, ArrowDownCircle, Clock, CheckCircle, AlertCircle,
  XCircle, ShoppingCart, CalendarDays, User, MapPin, Phone, Pencil, Trash2,
  Package, Lock, Mail,
} from "lucide-react";
import { format, isAfter, parseISO } from "date-fns";
import { useState } from "react";

function makeOrderSchema(maxQty: number) {
  return z.object({
    requestId: z.coerce.number(),
    itemId: z.coerce.number(),
    orderedQuantity: z.coerce.number().positive("1以上を入力してください").max(maxQty, `残数 ${maxQty} を超えて発注できません`),
    ordererName: z.string().min(1, "発注者名は必須です"),
    ordererExtension: z.string().default(""),
    orderDate: z.string().default(""),
    deliveryDate: z.string().default(""),
    note: z.string().default(""),
  });
}
type OrderFormValues = z.infer<ReturnType<typeof makeOrderSchema>>;

const STATUS_CONFIG: Record<string, { label: string; icon: JSX.Element; className: string; bg: string }> = {
  受付中: { label: "受付中", icon: <Clock size={14} />, className: "status-uketsuke", bg: "bg-blue-50 dark:bg-blue-950/20" },
  対応中: { label: "対応中", icon: <AlertCircle size={14} />, className: "status-taiou", bg: "bg-orange-50 dark:bg-orange-950/20" },
  完了: { label: "完了", icon: <CheckCircle size={14} />, className: "status-kanryo", bg: "bg-green-50 dark:bg-green-950/20" },
  キャンセル: { label: "キャンセル", icon: <XCircle size={14} />, className: "status-cancel", bg: "bg-muted" },
};

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinAction, setPinAction] = useState<"edit" | "delete">("delete");

  const cfg = loadConfig();

  const { data: request, isLoading } = useQuery<StockRequest | null>({
    queryKey: ["requests", id],
    queryFn: () => getRequest(cfg!, parseInt(id!)),
    enabled: !!cfg,
  });

  const { data: orders } = useQuery<Order[]>({
    queryKey: ["orders", id],
    queryFn: () => getOrders(cfg!, parseInt(id!)),
    enabled: !!cfg,
  });

  const deleteMutation = useMutation({
    mutationFn: async (pin: string) => {
      if (!cfg) throw new Error("GitHub設定がありません");
      const valid = await verifyPin(cfg, parseInt(id!), pin);
      if (!valid) throw new Error("PINが正しくありません");
      await deleteRequest(cfg, parseInt(id!));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      toast({ title: "依頼を削除しました" });
      window.location.hash = "/";
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handlePinAction = (action: "edit" | "delete") => {
    setPinAction(action); setPinInput(""); setPinError(""); setShowPinDialog(true);
  };

  const handlePinSubmit = async () => {
    if (!cfg) return;
    const valid = await verifyPin(cfg, parseInt(id!), pinInput);
    if (valid) {
      setShowPinDialog(false);
      if (pinAction === "delete") {
        if (confirm("この依頼を削除しますか？")) deleteMutation.mutate(pinInput);
      } else {
        window.location.hash = `/edit/${id}`;
      }
    } else {
      setPinError("PINが正しくありません");
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full rounded-lg" /><Skeleton className="h-60 w-full rounded-lg" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>依頼が見つかりません</p>
        <Link href="/"><Button variant="outline" className="mt-4">戻る</Button></Link>
      </div>
    );
  }

  const typeIsShutsu = request.type === "出";
  const statusConfig = STATUS_CONFIG[request.status] ?? STATUS_CONFIG["受付中"];
  const isExpired = request.postDeadline ? !isAfter(parseISO(request.postDeadline), new Date()) : false;

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* 戻る + 編集/削除 */}
      <div className="flex items-center justify-between">
        <Link href="/">
          <a className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={16} />掲示板に戻る
          </a>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => handlePinAction("edit")}>
            <Pencil size={13} />編集
          </Button>
          <Button variant="outline" size="sm"
            className="flex items-center gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
            onClick={() => handlePinAction("delete")} disabled={deleteMutation.isPending}>
            <Trash2 size={13} />削除
          </Button>
        </div>
      </div>

      {/* PIN認証ダイアログ */}
      {showPinDialog && (
        <div className="bg-card border-2 border-primary/30 rounded-lg p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <Lock size={16} className="text-primary" />
            <h3 className="font-semibold text-foreground">{pinAction === "edit" ? "編集" : "削除"}にはPINが必要です</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-3">依頼追加時に設定した4〜6桁のPINを入力してください。</p>
          <div className="flex gap-2 items-start">
            <div>
              <Input type="password" inputMode="numeric" maxLength={6} placeholder="PIN"
                value={pinInput}
                onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, "")); setPinError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handlePinSubmit(); }}
                className="w-36 text-center text-lg tracking-widest" />
              {pinError && <p className="text-xs text-destructive mt-1">{pinError}</p>}
            </div>
            <Button onClick={handlePinSubmit}>認証</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowPinDialog(false)}>キャンセル</Button>
          </div>
        </div>
      )}

      {/* 依頼ヘッダーカード */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className={`px-5 py-4 border-b border-border ${statusConfig.bg}`}>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded font-bold text-sm ${typeIsShutsu ? "badge-shutsu" : "badge-motome"}`}>
              {typeIsShutsu ? <ArrowUpCircle size={14} /> : <ArrowDownCircle size={14} />}
              {typeIsShutsu ? "出庫依頼" : "入庫要求"}
            </span>
            <span className={`inline-flex items-center gap-1 text-sm font-medium ${statusConfig.className}`}>
              {statusConfig.icon}{statusConfig.label}
            </span>
            {isExpired && (
              <span className="text-xs text-destructive font-medium border border-destructive/30 rounded px-1.5 py-0.5">掲示期限切れ</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">依頼 #{request.id}</p>
        </div>

        <div className="px-5 py-4 grid grid-cols-2 gap-3 text-sm border-b border-border">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin size={13} /><span>拠点: <strong className="text-foreground">{request.requesterBase}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <User size={13} /><span>依頼者: <strong className="text-foreground">{request.requesterName}</strong></span>
          </div>
          {request.requesterExtension && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone size={13} /><span>内線: <strong className="text-foreground">{request.requesterExtension}</strong></span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays size={13} />
            <span>掲示期限: <strong className={isExpired ? "text-destructive" : "text-foreground"}>{request.postDeadline || "未設定"}</strong></span>
          </div>
          {request.requesterEmail && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail size={13} /><span>メール: <strong className="text-foreground">{request.requesterEmail}</strong></span>
            </div>
          )}
          {request.note && (
            <div className="col-span-2 text-muted-foreground text-xs">備考: <span className="text-foreground">{request.note}</span></div>
          )}
        </div>

        <div className="px-5 py-3 bg-muted/30 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground">ステータスは発注状況に応じて自動更新されます（受付中 → 対応中 → 完了）</span>
        </div>
      </div>

      {/* 商品一覧 + 発注フォーム */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Package size={16} className="text-primary" />商品一覧（{request.items.length}件）
          </h3>
        </div>
        <div className="divide-y divide-border">
          {request.items.map((item, idx) => (
            <ItemBlock key={item.id} item={item} index={idx} request={request} orders={orders ?? []} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ItemBlock({ item, index, request, orders }: {
  item: StockItem; index: number; request: StockRequest; orders: Order[];
}) {
  const { toast } = useToast();
  const [showOrderForm, setShowOrderForm] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");
  const cfg = loadConfig();

  const itemOrders = orders.filter((o) => o.itemId === item.id);
  const totalOrdered = itemOrders.reduce((s, o) => s + o.orderedQuantity, 0);
  const remaining = Math.max(0, item.quantity - totalOrdered);
  const isFulfilled = remaining <= 0;
  const schema = makeOrderSchema(remaining);

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      requestId: request.id!, itemId: item.id!,
      orderedQuantity: remaining > 0 ? remaining : 1,
      ordererName: "", ordererExtension: "", orderDate: today, deliveryDate: "", note: "",
    },
  });

  const orderMutation = useMutation({
    mutationFn: async (data: OrderFormValues) => {
      if (!cfg) throw new Error("GitHub設定がありません");
      return createOrder(cfg, { ...data, orderDate: today });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["orders", String(request.id)] });
      queryClient.invalidateQueries({ queryKey: ["requests", String(request.id)] });
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      if (result.autoCompleted) {
        toast({ title: "発注しました — 全数量の発注が完了し、ステータスが「完了」になりました" });
      } else {
        toast({ title: "発注しました" });
      }
      form.reset({
        requestId: request.id!, itemId: item.id!,
        orderedQuantity: 1, ordererName: "", ordererExtension: "", orderDate: today, deliveryDate: "", note: "",
      });
      setShowOrderForm(false);
    },
    onError: (e: Error) => toast({ title: e.message || "発注に失敗しました", variant: "destructive" }),
  });

  const pct = item.quantity > 0 ? Math.round((totalOrdered / item.quantity) * 100) : 0;

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="mt-0.5 text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">{index + 1}</span>
          <div className="min-w-0">
            <span className="font-semibold text-foreground">{item.productName}</span>
            <span className="text-xs text-muted-foreground ml-2 font-mono">{item.productCode}</span>
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
              {item.expiryDate && <span>賞味期限: {item.expiryDate}</span>}
              {item.itemNote && <span>備考: {item.itemNote}</span>}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">依頼数</p>
          <p className="text-lg font-bold text-primary tabular-nums">
            {item.quantity.toLocaleString()}<span className="text-sm font-normal ml-0.5">{item.unit}</span>
          </p>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">発注済: <strong className="text-foreground">{totalOrdered.toLocaleString()}{item.unit}</strong></span>
          <span className={`font-semibold ${isFulfilled ? "text-green-600 dark:text-green-400" : remaining < item.quantity * 0.3 ? "text-orange-500" : "text-primary"}`}>
            残: {remaining.toLocaleString()}{item.unit}{isFulfilled && " ✓完了"}
          </span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${isFulfilled ? "bg-green-500" : pct > 70 ? "bg-orange-400" : "bg-primary"}`}
            style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      </div>

      {itemOrders.length > 0 && (
        <div className="mb-3 space-y-1">
          {itemOrders.map((o) => (
            <div key={o.id} className="flex items-center gap-3 text-xs bg-muted/40 rounded px-3 py-1.5">
              <ShoppingCart size={11} className="text-muted-foreground shrink-0" />
              <span className="font-bold text-primary tabular-nums">{o.orderedQuantity.toLocaleString()}{item.unit}</span>
              <span className="text-foreground">{o.ordererName}</span>
              {o.ordererExtension && (
                <span className="text-muted-foreground flex items-center gap-0.5"><Phone size={10} />{o.ordererExtension}</span>
              )}
              {o.note && <span className="text-muted-foreground truncate max-w-[200px]">{o.note}</span>}
              <span className="text-muted-foreground ml-auto shrink-0">{o.orderDate}</span>
            </div>
          ))}
        </div>
      )}

      {isFulfilled ? (
        <div className="inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded px-3 py-1.5">
          <CheckCircle size={13} />依頼数量を満たしています
        </div>
      ) : !showOrderForm ? (
        <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => setShowOrderForm(true)}>
          <ShoppingCart size={14} />発注する（残: {remaining.toLocaleString()}{item.unit}）
        </Button>
      ) : (
        <div className="border border-primary/30 rounded-lg p-4 bg-primary/5 mt-1">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <ShoppingCart size={15} className="text-primary" />発注フォーム
            </p>
            <button type="button" onClick={() => setShowOrderForm(false)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">✕ 閉じる</button>
          </div>

          <div className="flex items-center gap-2 mb-4 text-sm bg-background rounded px-3 py-2 border border-border">
            <span className="text-muted-foreground">発注可能残数:</span>
            <span className="font-bold text-primary tabular-nums">{remaining.toLocaleString()} {item.unit}</span>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => orderMutation.mutate(d))} className="space-y-4">
              <input type="hidden" {...form.register("requestId", { valueAsNumber: true })} />
              <input type="hidden" {...form.register("itemId", { valueAsNumber: true })} />
              <input type="hidden" {...form.register("orderDate")} />
              <input type="hidden" {...form.register("deliveryDate")} />

              <FormField control={form.control} name="orderedQuantity" render={({ field }) => (
                <FormItem>
                  <FormLabel>発注数量（{item.unit}）<span className="text-destructive ml-0.5">*</span>
                    <span className="text-xs text-muted-foreground ml-2 font-normal">最大 {remaining.toLocaleString()}{item.unit}</span>
                  </FormLabel>
                  <FormControl><Input {...field} type="number" min={1} step="any" className="w-48" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="ordererName" render={({ field }) => (
                <FormItem>
                  <FormLabel>発注者名<span className="text-destructive ml-0.5">*</span></FormLabel>
                  <FormControl><Input {...field} placeholder="例: 倉庫担当 鈴木" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="ordererExtension" render={({ field }) => (
                <FormItem>
                  <FormLabel>内線番号（任意）</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ""} placeholder="例: 1234" className="w-48" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="note" render={({ field }) => (
                <FormItem>
                  <FormLabel>備考（任意）</FormLabel>
                  <FormControl><Textarea {...field} value={field.value ?? ""} placeholder="分納対応など特記事項があれば記入" rows={2} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <Button type="submit" disabled={orderMutation.isPending} className="w-full">
                <ShoppingCart size={14} className="mr-1.5" />
                {orderMutation.isPending ? "発注中..." : "発注を確定する"}
              </Button>
            </form>
          </Form>
        </div>
      )}
    </div>
  );
}
