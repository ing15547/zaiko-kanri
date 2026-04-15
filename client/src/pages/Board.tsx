import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  PlusCircle, Package, ArrowUpCircle, ArrowDownCircle,
  Clock, CheckCircle, AlertCircle, XCircle, Search, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { StockRequestWithItems, StockItem } from "@/lib/db";
import { getAllRequestsWithItems } from "@/lib/db";
import { isAfter, parseISO } from "date-fns";
import { useState, useMemo } from "react";

const TYPE_CONFIG: Record<string, { label: string; icon: JSX.Element; className: string }> = {
  出: { label: "出庫", icon: <ArrowUpCircle size={13} />, className: "badge-shutsu" },
  求: { label: "入庫要求", icon: <ArrowDownCircle size={13} />, className: "badge-motome" },
};

const STATUS_CONFIG: Record<string, { label: string; icon: JSX.Element; className: string }> = {
  受付中: { label: "受付中", icon: <Clock size={12} />, className: "status-uketsuke" },
  対応中: { label: "対応中", icon: <AlertCircle size={12} />, className: "status-taiou" },
  完了: { label: "完了", icon: <CheckCircle size={12} />, className: "status-kanryo" },
  キャンセル: { label: "キャンセル", icon: <XCircle size={12} />, className: "status-cancel" },
};

const STATUS_FILTERS = ["すべて", "受付中", "対応中", "完了", "キャンセル"];
const TYPE_FILTERS = ["すべて", "出", "求"];

function isExpiredPost(deadline: string) {
  try { return deadline && !isAfter(parseISO(deadline), new Date()); }
  catch { return false; }
}

function matchSearch(query: string, req: StockRequestWithItems, item: StockItem): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  const targets = [
    item.productName, item.productCode,
    req.requesterBase, req.requesterName,
    item.itemNote ?? "", req.note ?? "",
  ].map((s) => s.toLowerCase());
  return targets.some((t) => t.includes(q));
}

export default function Board() {
  const [statusFilter, setStatusFilter] = useState("すべて");
  const [typeFilter, setTypeFilter] = useState("すべて");
  const [showExpired, setShowExpired] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: requests, isLoading } = useQuery<StockRequestWithItems[]>({
    queryKey: ["requests"],
    queryFn: getAllRequestsWithItems,
  });

  const records = useMemo(
    () => (requests ?? []).flatMap((req) => req.items.map((item) => ({ req, item }))),
    [requests]
  );

  const filtered = useMemo(() =>
    records.filter(({ req, item }) => {
      const statusOk = statusFilter === "すべて" || req.status === statusFilter;
      const typeOk = typeFilter === "すべて" || req.type === typeFilter;
      const expiredOk = showExpired || !isExpiredPost(req.postDeadline);
      const searchOk = matchSearch(searchQuery, req, item);
      return statusOk && typeOk && expiredOk && searchOk;
    }),
    [records, statusFilter, typeFilter, showExpired, searchQuery]
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">在庫依頼一覧</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            「出」=出庫依頼　「求」=入庫要求　— 商品1件ごとに1行
          </p>
        </div>
        <Link href="/new">
          <Button data-testid="button-new-request" className="flex items-center gap-1.5 shrink-0">
            <PlusCircle size={15} />依頼を追加
          </Button>
        </Link>
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="商品名・商品コード・拠点・依頼者名で検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9"
          data-testid="input-search"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 mb-4">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">区分:</span>
          {TYPE_FILTERS.map((f) => (
            <button key={f} onClick={() => setTypeFilter(f)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${typeFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
              {f === "すべて" ? "すべて" : f === "出" ? "出庫" : "入庫要求"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">状態:</span>
          {STATUS_FILTERS.map((f) => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${statusFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
              {f}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-auto select-none">
          <input type="checkbox" checked={showExpired} onChange={(e) => setShowExpired(e.target.checked)} className="rounded" />
          期限切れも表示
        </label>
      </div>

      {!isLoading && filtered.length > 0 && (
        <div className="hidden md:grid grid-cols-[72px_100px_1fr_130px_70px_60px_88px_88px_76px] gap-2 px-4 py-2 text-xs font-semibold text-muted-foreground border-b border-border mb-1 bg-muted/30 rounded-t-lg">
          <span>区分</span><span>商品コード</span><span>商品名</span>
          <span>依頼者／拠点</span><span className="text-right">数量</span>
          <span>単位</span><span>賞味期限</span><span>掲示期限</span><span>状態</span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Package size={44} className="mb-3 opacity-30" />
          {searchQuery ? (
            <>
              <p className="text-sm">「{searchQuery}」に一致する依頼がありません</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setSearchQuery("")}>検索をクリア</Button>
            </>
          ) : (
            <>
              <p className="text-sm">依頼がありません</p>
              <Link href="/new"><Button variant="outline" className="mt-4" size="sm">最初の依頼を追加する</Button></Link>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-px">
          {filtered.map(({ req, item }) => (
            <BoardRow key={`${req.id}-${item.id}`} req={req} item={item} searchQuery={searchQuery} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-right mt-3">
        {filtered.length} 件表示
        {searchQuery && <span className="ml-1">（「{searchQuery}」で絞り込み中）</span>}
      </p>
    </div>
  );
}

function highlight(text: string, query: string): JSX.Element {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase().trim());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-700 text-foreground rounded-sm px-0.5">
        {text.slice(idx, idx + query.trim().length)}
      </mark>
      {text.slice(idx + query.trim().length)}
    </>
  );
}

function BoardRow({ req, item, searchQuery }: { req: StockRequestWithItems; item: StockItem; searchQuery: string }) {
  const typeConfig = TYPE_CONFIG[req.type];
  const statusConfig = STATUS_CONFIG[req.status] ?? STATUS_CONFIG["受付中"];
  const expired = isExpiredPost(req.postDeadline);
  const requesterLabel = `${req.requesterBase} / ${req.requesterName}`;

  return (
    <Link href={`/requests/${req.id}`}>
      <a data-testid={`row-item-${req.id}-${item.id}`}
        className={`block border-b border-border bg-card hover:bg-accent/40 transition-colors cursor-pointer px-4 py-3 ${expired ? "opacity-55" : ""}`}>
        <div className="hidden md:grid grid-cols-[72px_100px_1fr_130px_70px_60px_88px_88px_76px] gap-2 items-center text-sm">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold w-fit ${typeConfig?.className ?? ""}`}>
            {typeConfig?.icon}{typeConfig?.label}
          </span>
          <span className="text-xs text-muted-foreground font-mono truncate">{highlight(item.productCode, searchQuery)}</span>
          <span className="font-medium text-foreground truncate">{highlight(item.productName, searchQuery)}</span>
          <span className="text-xs text-muted-foreground truncate">{highlight(requesterLabel, searchQuery)}</span>
          <span className="font-bold text-primary text-right tabular-nums">{item.quantity.toLocaleString()}</span>
          <span className="text-sm text-foreground">{item.unit}</span>
          <span className="text-xs text-muted-foreground">{item.expiryDate || "—"}</span>
          <span className={`text-xs ${expired ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
            {req.postDeadline || "—"}{expired && <span className="ml-1 text-[10px]">期限切</span>}
          </span>
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${statusConfig.className}`}>
            {statusConfig.icon}{statusConfig.label}
          </span>
        </div>
        <div className="md:hidden space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold ${typeConfig?.className ?? ""}`}>
              {typeConfig?.icon}{typeConfig?.label}
            </span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${statusConfig.className}`}>
              {statusConfig.icon}{statusConfig.label}
            </span>
            {expired && <span className="text-xs text-destructive font-medium">期限切れ</span>}
          </div>
          <div className="font-medium text-foreground">{highlight(item.productName, searchQuery)}</div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="font-bold text-primary">{item.quantity.toLocaleString()} {item.unit}</span>
            {item.expiryDate && <span>賞味期限: {item.expiryDate}</span>}
            <span>{highlight(requesterLabel, searchQuery)}</span>
            <span>掲示期限: {req.postDeadline || "—"}</span>
          </div>
        </div>
      </a>
    </Link>
  );
}
