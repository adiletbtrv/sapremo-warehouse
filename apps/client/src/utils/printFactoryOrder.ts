import dayjs from 'dayjs';
import type { FactoryOrder, Product } from '@/types';
import { db } from '@/db/schema';

function escapeHtml(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatHumanInvoiceNumber(inv?: string, id?: string): string {
  const candidates = [inv?.trim(), id?.trim()];

  for (const candidate of candidates) {
    if (candidate && /^[A-Za-z0-9._/-]{1,40}$/.test(candidate)) {
      return candidate;
    }
  }

  return '________';
}

function formatMoney(amount: number): string {
  return amount.toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
  });
}

export function generateFactoryOrderHtml(
  order: FactoryOrder,
  allProducts: Product[],
  allOrders: FactoryOrder[],
): string {
  // 1. Определение номера накладной
  let orderNumber = order.orderNumber ? String(order.orderNumber) : '';
  if (!orderNumber) {
    const orderIdx = allOrders.findIndex((o) => o.id === order.id);
    orderNumber = orderIdx !== -1 ? String(orderIdx + 1) : '';
  }
  const displayInvoiceNumber = escapeHtml(formatHumanInvoiceNumber(orderNumber, order.id));
  const formattedDate = dayjs(order.date).isValid()
    ? dayjs(order.date).format('DD.MM.YYYY')
    : dayjs().format('DD.MM.YYYY');

  // 2. Расчет строк таблицы и итогов
  let totalBoxes = 0;
  let totalPiecesSum = 0;
  let totalSum = 0;

  const rows = order.items
    .map((it, idx) => {
      const itProdId = String(it.productId ?? '').trim();
      const itProdName = String(it.productName ?? '')
        .trim()
        .toLowerCase();

      const prod =
        allProducts.find((p) => String(p.id).trim() === itProdId) ??
        allProducts.find((p) => String(p.barcode).trim() === itProdId) ??
        (itProdName
          ? allProducts.find((p) => p.name.trim().toLowerCase() === itProdName)
          : undefined);

      const productName = prod?.name ?? it.productName ?? 'Товар';
      const price = prod?.factoryPrice ?? 0;
      const piecesPerBox = prod?.boxQuantity && prod.boxQuantity > 0 ? prod.boxQuantity : 1;

      // it.qty в заявке к заводу - это количество коробок!
      const boxesCount = it.boxCount !== undefined && it.boxCount > 0 ? it.boxCount : (it.qty ?? 0);

      const totalPieces = boxesCount * piecesPerBox;
      const rowSum = totalPieces * price;

      totalBoxes += boxesCount;
      totalPiecesSum += totalPieces;
      totalSum += rowSum;

      return `
      <tr>
        <td class="center">${idx + 1}</td>
        <td>${escapeHtml(productName)}</td>
        <td class="center">${piecesPerBox}</td>
        <td class="center bold">${boxesCount > 0 ? boxesCount : '—'}</td>
        <td class="center bold">${totalPieces > 0 ? totalPieces : '—'}</td>
        <td class="num">${price > 0 ? formatMoney(price) : '—'}</td>
        <td class="num bold">${rowSum > 0 ? formatMoney(rowSum) : '—'}</td>
      </tr>`;
    })
    .join('');

  const commentHtml = order.comment
    ? `<div class="comment"><strong>Комментарий:</strong> ${escapeHtml(order.comment)}</div>`
    : '';

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Накладная № ${displayInvoiceNumber}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: "Times New Roman", Times, serif; color: #000; margin: 0; padding: 15px; font-size: 13px; line-height: 1.3; }
    .title { text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
    .header-table td { vertical-align: top; width: 50%; font-size: 12px; }
    .party-row { margin-bottom: 4px; }
    .buyer-line { display: inline-block; width: 180px; border-bottom: 1px solid #000; height: 14px; }
    .data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
    .data-table th, .data-table td { border: 1px solid #000; padding: 6px 8px; }
    .data-table th { background: #f2f2f2; font-weight: bold; text-align: center; }
    .center { text-align: center; }
    .num { text-align: right; }
    .bold { font-weight: bold; }
    .footer-row td { font-weight: bold; background: #fafafa; }
    .signatures-container { margin-top: 30px; }
    .sig-row { display: flex; align-items: flex-end; margin-bottom: 18px; font-size: 12px; }
    .sig-title { width: 260px; font-weight: bold; }
    .sig-line { flex: 1; border-bottom: 1px solid #000; height: 16px; margin: 0 10px; }
    .sig-fio { width: 60px; text-align: center; color: #555; font-size: 11px; }
    .comment { margin-bottom: 15px; font-size: 12px; font-style: italic; }
  </style>
</head>
<body>
  <div class="title">НАКЛАДНАЯ № ${displayInvoiceNumber} от ${formattedDate}</div>

  <table class="header-table">
    <tr>
      <td>
        <div class="party-row"><strong>Продавец:</strong> Sapremo Distribution LLC</div>
        <div class="party-row"><strong>Адрес:</strong> Центральный логистический терминал №1</div>
        <div class="party-row"><strong>Телефон:</strong> +996 (000) 00-00-00</div>
      </td>
      <td>
        <div class="party-row"><strong>Покупатель:</strong> <span class="buyer-line"></span></div>
        <div class="party-row"><strong>Адрес:</strong> г. Бишкек</div>
      </td>
    </tr>
  </table>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 30px;">№</th>
        <th>Наименование продукции</th>
        <th style="width: 75px;">В коробке<br/>(шт)</th>
        <th style="width: 85px;">Количество<br/>коробок (кор.)</th>
        <th style="width: 80px;">Всего<br/>(шт)</th>
        <th style="width: 105px;">Цена (за шт) с<br/>учетом НДС и НСП</th>
        <th style="width: 110px;">Стоимость</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="footer-row">
        <td class="center" colspan="2">Итого</td>
        <td class="center">—</td>
        <td class="center bold">${totalBoxes}</td>
        <td class="center bold">${totalPiecesSum}</td>
        <td class="center">—</td>
        <td class="num bold">${formatMoney(totalSum)}</td>
      </tr>
    </tbody>
  </table>
  
  ${commentHtml}

  <div class="signatures-container">
    <div class="sig-row">
      <span class="sig-title">Проверил бухгалтер Sapremo Distribution</span>
      <span class="sig-line"></span>
      <span class="sig-fio">Ф.И.О.</span>
    </div>
    <div class="sig-row">
      <span class="sig-title">Отпустил зав. склад Sapremo Distribution</span>
      <span class="sig-line"></span>
      <span class="sig-fio">Ф.И.О.</span>
    </div>
    <div class="sig-row">
      <span class="sig-title">Получил</span>
      <span class="sig-line"></span>
      <span class="sig-fio">Ф.И.О.</span>
    </div>
  </div>
</body>
</html>`;
}

export async function printFactoryOrder(order: FactoryOrder): Promise<void> {
  const [allProducts, allOrders] = await Promise.all([
    db.products.toArray(),
    db.factoryOrders.orderBy('date').toArray(),
  ]);

  const html = generateFactoryOrderHtml(order, allProducts, allOrders);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
  }

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 1000);
  }, 250);
}
