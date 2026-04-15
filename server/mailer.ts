import nodemailer from "nodemailer";

// SMTP設定は環境変数から読み込み
// 未設定の場合はメール送信をスキップ
function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const fromAddress = process.env.SMTP_FROM || user;

  if (!host || !user || !pass) {
    console.log("[mailer] SMTP未設定のため、メール送信は無効です。.envにSMTP_HOST, SMTP_USER, SMTP_PASSを設定してください。");
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

let transporter: nodemailer.Transporter | null = null;

export function initMailer() {
  transporter = createTransporter();
  if (transporter) {
    console.log("[mailer] SMTP設定を検出しました。メール送信が有効です。");
  }
}

export interface CompletionMailData {
  toEmail: string;
  requestId: number;
  requesterName: string;
  requesterBase: string;
  items: { productName: string; productCode: string; quantity: number; unit: string }[];
}

export async function sendCompletionEmail(data: CompletionMailData): Promise<boolean> {
  if (!transporter) {
    console.log(`[mailer] SMTP未設定のため、完了通知メールをスキップしました (依頼#${data.requestId})`);
    return false;
  }

  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || "";
  const itemLines = data.items
    .map((i) => `  ・${i.productName}（${i.productCode}）: ${i.quantity}${i.unit}`)
    .join("\n");

  const mailOptions = {
    from: fromAddress,
    to: data.toEmail,
    subject: `【在庫管理】依頼 #${data.requestId} の全発注が完了しました`,
    text: `${data.requesterName} 様

お疲れ様です。
以下の在庫依頼について、全商品の発注数量が満たされ、ステータスが「完了」になりました。

━━━━━━━━━━━━━━━━━━
依頼番号: #${data.requestId}
依頼拠点: ${data.requesterBase}
依頼者: ${data.requesterName}

対象商品:
${itemLines}
━━━━━━━━━━━━━━━━━━

このメールは在庫入出庫管理システムから自動送信されています。
`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[mailer] 完了通知メール送信成功: ${data.toEmail} (依頼#${data.requestId})`);
    return true;
  } catch (err) {
    console.error(`[mailer] メール送信エラー (依頼#${data.requestId}):`, err);
    return false;
  }
}
