import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { Order } from '@/types';
import dayjs from 'dayjs';

// Disable default English hyphenation on Cyrillic text to prevent layout crash
Font.registerHyphenationCallback((word) => [word]);

// Safe font registration via CDN
Font.register({
  family: 'Roboto',
  fonts: [
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf',
      fontWeight: 'normal',
    },
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf',
      fontWeight: 'bold',
    },
  ],
});

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

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 28,
    paddingLeft: 32,
    paddingRight: 32,
    fontFamily: 'Roboto',
    fontSize: 9,
    color: '#000',
    lineHeight: 1.3,
  },
  title: {
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  invoiceSubtitle: {
    fontSize: 9.5,
    textAlign: 'center',
    marginBottom: 16,
    color: '#222',
  },
  table: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#000',
    borderRightWidth: 0,
    borderBottomWidth: 0,
    marginBottom: 10,
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableColHeader: {
    borderWidth: 1,
    borderColor: '#000',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    backgroundColor: '#f8f8f8',
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 3,
    paddingRight: 3,
    fontWeight: 'bold',
    fontSize: 8.5,
    textAlign: 'center',
  },
  tableCol: {
    borderWidth: 1,
    borderColor: '#000',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 8.5,
  },
  colNo: { width: '6%', textAlign: 'center' },
  colName: { width: '42%', textAlign: 'left' },
  colBox: { width: '13%', textAlign: 'center' },
  colDateQty: { width: '13%', textAlign: 'center' },
  colPrice: { width: '13%', textAlign: 'right' },
  colTotal: { width: '13%', textAlign: 'right' },

  footerRow: {
    flexDirection: 'row',
    backgroundColor: '#fafafa',
  },
  footerColSummary: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#000',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 4,
    fontWeight: 'bold',
    fontSize: 8.5,
    textAlign: 'center',
  },
  footerColEmpty: {
    width: '13%',
    borderWidth: 1,
    borderColor: '#000',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 4,
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 8.5,
  },
  footerColQty: {
    width: '13%',
    borderWidth: 1,
    borderColor: '#000',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 4,
    fontWeight: 'bold',
    fontSize: 8.5,
    textAlign: 'center',
  },
  footerColTotal: {
    width: '13%',
    borderWidth: 1,
    borderColor: '#000',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 4,
    fontWeight: 'bold',
    fontSize: 8.5,
    textAlign: 'right',
  },

  commentBox: {
    marginTop: 10,
    fontSize: 8.5,
    fontStyle: 'italic',
  },

  signaturesContainer: {
    marginTop: 35,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  sigBlock: {
    fontSize: 9,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  sigLine: {
    width: 160,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    marginLeft: 6,
    marginBottom: 2,
  },
});

interface Props {
  order: Order;
}

export default function InvoicePdfTemplate({ order }: Props) {
  const rawDate = order?.date;
  const parsedDate = rawDate ? dayjs(rawDate) : null;
  const formattedDate = parsedDate?.isValid()
    ? parsedDate.format('DD.MM.YYYY')
    : dayjs().format('DD.MM.YYYY');

  const driverName = order?.driverName?.trim();
  const items = order?.items ?? [];

  let totalBoxes = 0;
  let totalCost = 0;

  items.forEach((it) => {
    const qty = Math.round(it?.quantity ?? 0);
    const boxCount = Math.round(it?.boxCount ?? 0);
    totalBoxes += boxCount;

    const unitsPerBox =
      boxCount > 0
        ? Math.round(qty / boxCount)
        : ((it as { piecesPerBox?: number })?.piecesPerBox ?? 1);

    const unitPrice = it?.unitPrice ?? 0;
    const lineCost =
      boxCount > 0 ? boxCount * Number(unitsPerBox) * unitPrice : (it?.amount ?? qty * unitPrice);
    totalCost += lineCost;
  });

  const invoiceLabel = formatHumanInvoiceNumber(order?.invoiceNumber, order?.id);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Заголовок */}
        <Text style={styles.title}>РАСХОДНАЯ НАКЛАДНАЯ от {formattedDate}</Text>
        <Text style={styles.invoiceSubtitle}>Накладная №: {invoiceLabel}</Text>

        {/* Таблица позиций */}
        <View style={styles.table}>
          {/* Шапка таблицы */}
          <View style={styles.tableRow}>
            <View style={[styles.tableColHeader, styles.colNo]}>
              <Text>№</Text>
            </View>
            <View style={[styles.tableColHeader, styles.colName]}>
              <Text>Наименование продукции</Text>
            </View>
            <View style={[styles.tableColHeader, styles.colBox]}>
              <Text>В коробке</Text>
            </View>
            <View style={[styles.tableColHeader, styles.colDateQty]}>
              <Text>Кол-во коробок</Text>
            </View>
            <View style={[styles.tableColHeader, styles.colPrice]}>
              <Text>Цена (сом)</Text>
            </View>
            <View style={[styles.tableColHeader, styles.colTotal]}>
              <Text>Стоимость</Text>
            </View>
          </View>

          {/* Строки таблицы */}
          {items.map((item, i) => {
            const qty = Math.round(item?.quantity ?? 0);
            const boxCount = Math.round(item?.boxCount ?? 0);
            const unitsPerBox =
              boxCount > 0
                ? String(Math.round(qty / boxCount))
                : String((item as { piecesPerBox?: number })?.piecesPerBox ?? 1);

            const unitPrice = item?.unitPrice ?? 0;
            const lineCost =
              boxCount > 0
                ? boxCount * Number(unitsPerBox) * unitPrice
                : (item?.amount ?? qty * unitPrice);

            return (
              <View style={styles.tableRow} key={i}>
                <View style={[styles.tableCol, styles.colNo]}>
                  <Text>{i + 1}</Text>
                </View>
                <View style={[styles.tableCol, styles.colName]}>
                  <Text>{item.productName || item.barcode}</Text>
                </View>
                <View style={[styles.tableCol, styles.colBox]}>
                  <Text>{unitsPerBox !== '0' ? unitsPerBox : '—'}</Text>
                </View>
                <View style={[styles.tableCol, styles.colDateQty]}>
                  <Text>{boxCount}</Text>
                </View>
                <View style={[styles.tableCol, styles.colPrice]}>
                  <Text>{unitPrice > 0 ? formatMoney(unitPrice) : '—'}</Text>
                </View>
                <View style={[styles.tableCol, styles.colTotal]}>
                  <Text>{lineCost > 0 ? formatMoney(lineCost) : '—'}</Text>
                </View>
              </View>
            );
          })}

          {/* Строка Итого */}
          <View style={styles.footerRow}>
            <View style={styles.footerColSummary}>
              <Text>Итого</Text>
            </View>
            <View style={styles.footerColEmpty}>
              <Text>—</Text>
            </View>
            <View style={styles.footerColQty}>
              <Text>{totalBoxes}</Text>
            </View>
            <View style={styles.footerColEmpty}>
              <Text>—</Text>
            </View>
            <View style={styles.footerColTotal}>
              <Text>{formatMoney(totalCost)}</Text>
            </View>
          </View>
        </View>

        {/* Комментарий */}
        {order?.notes ? <Text style={styles.commentBox}>Комментарий: {order.notes}</Text> : null}

        {/* Подписи */}
        <View style={styles.signaturesContainer}>
          <View style={styles.sigBlock}>
            <Text>Отпустил:</Text>
            <View style={styles.sigLine} />
          </View>
          <View style={styles.sigBlock}>
            <Text>Получил:</Text>
            <View style={styles.sigLine} />
            {driverName ? <Text style={{ marginLeft: 4 }}>({driverName})</Text> : null}
          </View>
        </View>
      </Page>
    </Document>
  );
}
