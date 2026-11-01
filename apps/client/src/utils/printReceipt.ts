import dayjs from 'dayjs';
import type { GoodsReceipt, Product } from '@/types';

function escapeHtml(value: string | number | undefined | null): string {
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
    maximumFractionDigits: 2,
  });
}

export function printReceipt(receipt: GoodsReceipt, productsList?: Product[]): void {
  const productsMap = new Map((productsList ?? []).map((p) => [p.barcode, p]));

  let totalBoxes = 0;
  let totalCost = 0;

  const rows = receipt.items
    .map((it, idx) => {
      const prod = productsMap.get(it.barcode);
      const piecesPerBox = prod?.boxQuantity && prod.boxQuantity > 0 ? prod.boxQuantity : 1;
      const boxesCount = Math.max(1, Math.floor(it.actualQuantity / piecesPerBox));
      totalBoxes += boxesCount;
      const lineCost = it.actualQuantity * it.factoryPrice;
      totalCost += lineCost;
      const productName = it.productName ? it.productName : (prod?.name ?? it.barcode);

      return `
      <tr>
        <td class="center">${idx + 1}</td>
        <td>${escapeHtml(productName)}</td>
        <td class="center">${piecesPerBox}</td>
        <td class="center bold">${boxesCount}</td>
        <td class="num">${it.factoryPrice > 0 ? formatMoney(it.factoryPrice) : '—'}</td>
        <td class="num bold">${lineCost > 0 ? formatMoney(lineCost) : '—'}</td>
      </tr>`;
    })
    .join('');

  const dateFormatted = dayjs(receipt.date).isValid()
    ? dayjs(receipt.date).format('DD.MM.YYYY')
    : dayjs().format('DD.MM.YYYY');

  const waybillNumber = escapeHtml(
    formatHumanInvoiceNumber((receipt as { invoiceNumber?: string }).invoiceNumber, receipt.id),
  );

  const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Накладная № ${waybillNumber}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: "Times New Roman", Times, serif; color: #000; margin: 0; padding: 15px; font-size: 13px; line-height: 1.3; }
    
    .title { text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 18px; text-transform: uppercase; }
    
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; border: 1px solid #000; }
    .header-table td { width: 50%; border: 1px solid #000; padding: 8px 12px; vertical-align: top; font-size: 13px; }
    .party-row { margin-bottom: 4px; }
    .buyer-line { display: inline-block; width: 220px; border-bottom: 1px solid #000; height: 16px; vertical-align: bottom; }
    
    table.data-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
    table.data-table th, table.data-table td { border: 1px solid #000; padding: 5px 8px; font-size: 12px; }
    table.data-table th { font-weight: bold; text-align: center; background: #f8f8f8; }
    
    .center { text-align: center; }
    .num { text-align: right; }
    .bold { font-weight: bold; }
    
    .footer-row td { font-weight: bold; background: #fafafa; }
    
    .signatures-container { margin-top: 30px; }
    .sig-row { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 18px; font-size: 13px; }
    .sig-title { width: 330px; }
    .sig-line { flex: 1; border-bottom: 1px solid #000; margin: 0 15px; }
    .sig-fio { width: 60px; text-align: right; font-size: 12px; }

    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="title">НАКЛАДНАЯ № ${waybillNumber} от. ${dateFormatted}</div>

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
        <th style="width: 90px;">В коробке<br/>(шт)</th>
        <th style="width: 100px;">Количество<br/>коробок (шт)</th>
        <th style="width: 110px;">Цена (за шт) с<br/>учетом НДС и НСП</th>
        <th style="width: 110px;">Стоимость</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="footer-row">
        <td class="center" colspan="2">Итого</td>
        <td class="center">—</td>
        <td class="center bold">${totalBoxes}</td>
        <td class="center">—</td>
        <td class="num bold">${formatMoney(totalCost > 0 ? totalCost : receipt.totalAmount)}</td>
      </tr>
    </tbody>
  </table>

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
