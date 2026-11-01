import dayjs from 'dayjs';
import type { Order, Product } from '@/types';
import i18n from '@/i18n';

function escapeHtml(value: string | number | null | undefined): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatHumanInvoiceNumber(inv?: string, id?: string): string {
  const trimmed = inv?.trim();
  if (
    trimmed &&
    !trimmed.startsWith('SUP-') &&
    !trimmed.startsWith('ORD-') &&
    trimmed.length < 20
  ) {
    return trimmed;
  }
  if (trimmed && (trimmed.startsWith('INV-') || trimmed.startsWith('FO-'))) {
    return trimmed;
  }
  if (id && id.length <= 10 && !id.includes('-')) {
    return id;
  }
  if (id && id.length > 8 && id.includes('-')) {
    const parts = id.split('-');
    return parts[0].toUpperCase();
  }
  return id ?? '________';
}

function formatMoney(amount: number): string {
  return amount.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function printDriverOrder(order: Order, products?: Product[]): void {
  const rawDate = order?.date;
  const parsedDate = rawDate ? dayjs(rawDate) : null;
  const formattedDate = parsedDate?.isValid()
    ? parsedDate.format('DD.MM.YYYY')
    : dayjs().format('DD.MM.YYYY');

  const driverName = order?.driverName?.trim();
  const items = order?.items ?? [];

  let totalBoxes = 0;
  let totalCost = 0;

  const rows = items
    .map((it, idx) => {
      const prod = products?.find(
        (p) =>
          p.barcode === it?.barcode ||
          p.id === it?.barcode ||
          p.id === it?.productName ||
          (it?.productName && p.name.toLowerCase() === it.productName.toLowerCase()),
      );

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(it?.productName ?? '');
      const productName =
        prod?.name ??
        (!isUuid && it?.productName
          ? it.productName
          : (prod?.name ?? it?.productName ?? it?.barcode));

      const qty = Math.round(it?.quantity ?? 0);
      const boxCount = Math.round(it?.boxCount ?? 0);
      totalBoxes += boxCount;

      const unitsPerBox =
        prod?.boxQuantity && prod.boxQuantity > 0
          ? prod.boxQuantity
          : boxCount > 0
            ? Math.round(qty / boxCount)
            : ((it as { piecesPerBox?: number })?.piecesPerBox ?? 1);

      const unitPrice =
        (it?.unitPrice && it.unitPrice > 0 ? it.unitPrice : prod?.factoryPrice) ?? 0;
      const lineCost =
        boxCount > 0
          ? boxCount * unitsPerBox * unitPrice
          : it?.amount && it.amount > 0
            ? it.amount
            : qty * unitPrice;
      totalCost += lineCost;

      return `
      <tr>
        <td class="center">${idx + 1}</td>
        <td>${escapeHtml(productName)}</td>
        <td class="center">${unitsPerBox > 0 ? unitsPerBox : '—'}</td>
        <td class="center bold">${boxCount > 0 ? boxCount : '0'}</td>
        <td class="num">${unitPrice > 0 ? formatMoney(unitPrice) : '—'}</td>
        <td class="num bold">${lineCost > 0 ? formatMoney(lineCost) : '—'}</td>
      </tr>`;
    })
    .join('');

  const invoiceLabel = escapeHtml(formatHumanInvoiceNumber(order?.invoiceNumber, order?.id));

  const commentHtml = order?.notes
    ? `<div class="comment"><strong>Комментарий:</strong> ${escapeHtml(order.notes)}</div>`
    : '';

  const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Расходная накладная № ${invoiceLabel}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #000; margin: 0; padding: 15px; font-size: 13px; line-height: 1.3; }
    
    .title { text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 4px; text-transform: uppercase; }
    .subtitle { text-align: center; font-size: 13px; margin-bottom: 20px; color: #333; }
    
    table.data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    table.data-table th, table.data-table td { border: 1px solid #000; padding: 5px 8px; font-size: 12px; }
    table.data-table th { font-weight: bold; text-align: center; background: #f2f2f2; }
    
    .center { text-align: center; }
    .num { text-align: right; }
    .bold { font-weight: bold; }
    
    .footer-row td { font-weight: bold; background: #fafafa; }
    
    .signatures-container { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; }
    .sig-block { font-size: 13px; font-weight: 500; }
    .sig-line { display: inline-block; width: 200px; border-bottom: 1px solid #000; margin-left: 8px; }
    
    .comment { margin-top: 14px; font-size: 12px; font-style: italic; }

    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="title">РАСХОДНАЯ НАКЛАДНАЯ от ${formattedDate}</div>
  <div class="subtitle">Накладная № ${invoiceLabel}</div>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 35px;">№</th>
        <th>${i18n.t('orders.colProductName', 'Наименование продукции')}</th>
        <th style="width: 85px;">${i18n.t('orders.colPcsPerBox', 'В коробке')}</th>
        <th style="width: 95px;">${i18n.t('orders.colBoxCount', 'Количество коробок (шт)')}</th>
        <th style="width: 90px;">${i18n.t('orders.colPrice', 'Цена (за шт)')}</th>
        <th style="width: 100px;">${i18n.t('orders.colAmount', 'Стоимость')}</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="footer-row">
        <td class="center" colspan="2">Итого</td>
        <td class="center">—</td>
        <td class="center bold">${totalBoxes}</td>
        <td class="center">—</td>
        <td class="num bold">${formatMoney(totalCost)}</td>
      </tr>
    </tbody>
  </table>
  
  ${commentHtml}

  <div class="signatures-container">
    <div class="sig-block">
      Отпустил: <span class="sig-line"></span>
    </div>
    <div class="sig-block">
      Получил: <span class="sig-line"></span> ${driverName ? `(${escapeHtml(driverName)})` : ''}
    </div>
  </div>
</body>
</html>`;

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
