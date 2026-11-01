import React from 'react';
import type { Order } from '@/types';
import type { DocumentProps } from '@react-pdf/renderer';
import { saveBinaryFile } from '@/adapters/nativeAdapter';

export const downloadInvoicePdf = async (order: Order, filename: string) => {
  let blob: Blob;
  try {
    const [{ pdf }, { default: InvoicePdfTemplate }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('@/features/orders/InvoicePdfTemplate'),
    ]);

    const document = React.createElement(InvoicePdfTemplate, {
      order,
    }) as React.ReactElement<DocumentProps>;
    blob = await pdf(document).toBlob();
  } catch (renderError) {
    console.error('[PDF Generator] Error during @react-pdf render:', renderError);
    throw renderError;
  }

  await saveBinaryFile({
    defaultFileName: filename,
    mimeType: 'application/pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    data: blob,
  });
};
