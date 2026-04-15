import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, ArrowUpCircle, ArrowDownCircle, Plus, Trash2, Lock,
} from "lucide-react";
import { Link } from "wouter";
import type { StockRequestWithItems } from "@shared/schema";
import { useState } from "react";

// ========== スキーマ ==========
const itemSchema = z.object({
  productCode: z.string().min(1, "商品コードは必須"),
  productName: z.string().min(1, "商品名は必須"),
  quantity: z.coerce.number().positive("1以上を入力"),
  unit: z.string().min(1, "単位は必須"),
  expiryDate: z.string().default(""),
  itemNote: z.string().default(""),
});

const formSchema = z.object({
  type: z.enum(["出", "求"]),
  postDeadline: z.string().min(1, "掲示期限は必須です"),
  requesterBase: z.string().min(1, "依頼拠点は必須です"),
  requesterName: z.string().min(1, "依頼者名は必須です"),
  requesterExtension: z.string().default(""),
  requesterEmail: z.string().email("正しいメールアドレスを入力してください"),
  pin: z.string().min(4, "PINは4〜6桁で入力").max(6, "PINは4〜6桁で入力").regex(/^\d+$/, "PINは数字のみ"),
  note: z.string().default(""),
  items: z.array(itemSchema).min(1, "商品を1件以上追加してください").max(10),
});

type FormValues = z.infer<typeof formSchema>;

const UNIT_OPTIONS = ["本", "ケース", "箱", "袋", "缶", "個", "kg", "L"];

interface Props {
  editId?: string;
}

export default function NewRequest({ editId }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isEditMode = !!editId;
  const [pinVerified, setPinVerified] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  // 編集モード: 既存データを取得
  const { data: existing } = useQuery<StockRequestWithItems>({
    queryKey: ["/api/requests", editId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/requests/${editId}`);
      return res.json();
    },
    enabled: isEditMode,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "出",
      postDeadline: "",
      requesterBase: "",
      requesterName: "",
      requesterExtension: "",
      requesterEmail: "",
      pin: "",
      note: "",
      items: [
        { productCode: "", productName: "", quantity: 1, unit: "本", expiryDate: "", itemNote: "" },
      ],
    },
  });

  // 既存データをフォームにセット（編集モード）
  const [formReady, setFormReady] = useState(false);
  if (isEditMode && existing && !formReady && pinVerified) {
    form.reset({
      type: existing.type as "出" | "求",
      postDeadline: existing.postDeadline,
      requesterBase: existing.requesterBase,
      requesterName: existing.requesterName,
      requesterExtension: existing.requesterExtension ?? "",
      requesterEmail: (existing as any).requesterEmail ?? "",
      pin: pinInput, // PIN認証済みのものをセット
      note: existing.note ?? "",
      items: existing.items.map((item) => ({
        productCode: item.productCode,
        productName: item.productName,
        quantity: item.quantity,
        unit: item.unit,
        expiryDate: item.expiryDate ?? "",
        itemNote: item.itemNote ?? "",
      })),
    });
    setFormReady(true);
  }

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  // PIN検証（編集モード時）
  const handlePinVerify = async () => {
    try {
      const res = await apiRequest("POST", `/api/requests/${editId}/verify-pin`, { pin: pinInput });
      const { valid } = await res.json();
      if (valid) {
        setPinVerified(true);
        setPinError("");
      } else {
        setPinError("PINが正しくありません");
      }
    } catch {
      setPinError("認証に失敗しました");
    }
  };

  // 新規作成
  const createMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const res = await apiRequest("POST", "/api/requests", {
        ...data,
        status: "受付中",
        items: data.items.map((item, i) => ({ ...item, requestId: 0, sortOrder: i })),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      toast({ title: "掲示板に投稿しました" });
      navigate("/");
    },
    onError: () => toast({ title: "投稿に失敗しました", variant: "destructive" }),
  });

  // 編集更新
  const updateMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const res = await apiRequest("PUT", `/api/requests/${editId}`, {
        ...data,
        status: existing?.status ?? "受付中",
        items: data.items.map((item, i) => ({ ...item, requestId: parseInt(editId!), sortOrder: i })),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "更新失敗");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/requests", editId] });
      toast({ title: "依頼を更新しました" });
      navigate(`/requests/${editId}`);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const onSubmit = (data: FormValues) => {
    if (isEditMode) updateMutation.mutate(data);
    else createMutation.mutate(data);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  // 編集モードでPIN未認証の場合、PIN入力画面を表示
  if (isEditMode && !pinVerified) {
    return (
      <div className="max-w-md mx-auto mt-16">
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <Lock size={40} className="mx-auto mb-4 text-primary opacity-60" />
          <h2 className="text-lg font-bold text-foreground mb-2">編集にはPINが必要です</h2>
          <p className="text-sm text-muted-foreground mb-4">
            依頼追加時に設定した4〜6桁のPINを入力してください。
          </p>
          <div className="flex gap-2 justify-center mb-2">
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="PIN（4〜6桁）"
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, "")); setPinError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") handlePinVerify(); }}
              className="w-40 text-center text-lg tracking-widest"
              data-testid="input-pin-verify"
            />
            <Button onClick={handlePinVerify} data-testid="button-pin-verify">認証</Button>
          </div>
          {pinError && <p className="text-sm text-destructive mt-1">{pinError}</p>}
          <Link href={`/requests/${editId}`}>
            <Button variant="ghost" size="sm" className="mt-4">戻る</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={isEditMode ? `/requests/${editId}` : "/"}>
          <a className="text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back">
            <ArrowLeft size={20} />
          </a>
        </Link>
        <h1 className="text-xl font-bold text-foreground">
          {isEditMode ? "依頼を編集" : "依頼を追加"}
        </h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

          {/* ===== 区分選択 ===== */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">区分</h2>
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      data-testid="button-type-shutsu"
                      onClick={() => field.onChange("出")}
                      className={`flex flex-col items-center justify-center gap-2 border-2 rounded-lg py-4 transition-all ${
                        field.value === "出"
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      <ArrowUpCircle size={26} />
                      <span className="font-bold">出　出庫依頼</span>
                      <span className="text-xs opacity-70">商品を出庫したい</span>
                    </button>
                    <button
                      type="button"
                      data-testid="button-type-motome"
                      onClick={() => field.onChange("求")}
                      className={`flex flex-col items-center justify-center gap-2 border-2 rounded-lg py-4 transition-all ${
                        field.value === "求"
                          ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400"
                          : "border-border text-muted-foreground hover:border-orange-300"
                      }`}
                    >
                      <ArrowDownCircle size={26} />
                      <span className="font-bold">求　入庫要求</span>
                      <span className="text-xs opacity-70">商品が必要・補充したい</span>
                    </button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* ===== 依頼者情報 ===== */}
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">依頼者情報</h2>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="requesterBase"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>依頼拠点 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="例: 東京本社" data-testid="input-requester-base" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="requesterName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>依頼者名 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="例: 田中 花子" data-testid="input-requester-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="requesterExtension"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>内線番号</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="例: 1234" data-testid="input-extension" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="postDeadline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>掲示期限 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} type="date" data-testid="input-post-deadline" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* メールアドレス */}
            <FormField
              control={form.control}
              name="requesterEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>メールアドレス <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="例: tanaka@example.co.jp" data-testid="input-email" />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1">全数量の発注完了時に通知メールが送信されます</p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* PIN */}
            <FormField
              control={form.control}
              name="pin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <Lock size={13} />
                    PIN（4〜6桁） <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="編集・削除時に使用する暗証番号"
                      onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
                      className="w-48"
                      data-testid="input-pin"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1">この依頼を編集・削除する際に必要です。忘れないようにしてください。</p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>全体備考</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} placeholder="まとめての補足事項があれば記入" rows={2} data-testid="input-note" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* ===== 商品ライン ===== */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                商品一覧（最大10件）
              </h2>
              <span className="text-xs text-muted-foreground">{fields.length} / 10 件</span>
            </div>

            <div className="space-y-4">
              {fields.map((field, index) => (
                <ItemRow
                  key={field.id}
                  index={index}
                  form={form}
                  onRemove={() => remove(index)}
                  canRemove={fields.length > 1}
                />
              ))}
            </div>

            {fields.length < 10 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 w-full border-dashed"
                data-testid="button-add-item"
                onClick={() =>
                  append({ productCode: "", productName: "", quantity: 1, unit: "本", expiryDate: "", itemNote: "" })
                }
              >
                <Plus size={15} className="mr-1" />
                商品を追加
              </Button>
            )}
          </div>

          {/* ===== 送信 ===== */}
          <div className="flex justify-end gap-3 pb-8">
            <Link href={isEditMode ? `/requests/${editId}` : "/"}>
              <Button type="button" variant="outline" data-testid="button-cancel">キャンセル</Button>
            </Link>
            <Button type="submit" disabled={isPending} data-testid="button-submit">
              {isPending ? "送信中..." : isEditMode ? "変更を保存する" : "掲示板に投稿する"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

// ========== 商品1行コンポーネント ==========
import type { UseFormReturn } from "react-hook-form";

function ItemRow({
  index,
  form,
  onRemove,
  canRemove,
}: {
  index: number;
  form: UseFormReturn<FormValues>;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="border border-border rounded-lg p-4 bg-muted/20 relative">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
          商品 {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
            data-testid={`button-remove-item-${index}`}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name={`items.${index}.productCode`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">商品コード *</FormLabel>
              <FormControl>
                <Input {...field} placeholder="例: OI-600G" data-testid={`input-product-code-${index}`} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`items.${index}.productName`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">商品名 *</FormLabel>
              <FormControl>
                <Input {...field} placeholder="例: お〜いお茶 緑茶 600ml" data-testid={`input-product-name-${index}`} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`items.${index}.quantity`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">数量 *</FormLabel>
              <FormControl>
                <Input {...field} type="number" min={1} step="any" data-testid={`input-quantity-${index}`} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`items.${index}.unit`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">単位 *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger data-testid={`select-unit-${index}`}>
                    <SelectValue placeholder="単位を選択" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {UNIT_OPTIONS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`items.${index}.expiryDate`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">賞味期限</FormLabel>
              <FormControl>
                <Input {...field} type="date" value={field.value ?? ""} data-testid={`input-expiry-${index}`} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`items.${index}.itemNote`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">商品備考</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} placeholder="特記事項" data-testid={`input-item-note-${index}`} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
