import { KOT } from '../types/kot';
import { FormattedPrintDocument, PaperWidth } from '../types/printer';
import { getCharacterWidth, centerLine, padLine } from './receiptFormatter';

export interface FormatKOTOptions {
  paperWidth?: PaperWidth;
  restaurantName?: string;
  orderNumber?: string;
  tableName?: string;
  orderType?: string;
}

export function formatKOTPrintDocument(
  kot: KOT,
  options: FormatKOTOptions = {}
): FormattedPrintDocument {
  const paperWidth = options.paperWidth || '80mm';
  const charWidth = getCharacterWidth(paperWidth);
  const lines: string[] = [];

  const divider = '-'.repeat(charWidth);
  const doubleDivider = '='.repeat(charWidth);

  // KOT Header
  lines.push(doubleDivider);
  lines.push(centerLine('*** KITCHEN ORDER TICKET ***', charWidth));
  lines.push(doubleDivider);

  if (options.restaurantName) {
    lines.push(centerLine(options.restaurantName.toUpperCase(), charWidth));
  }

  lines.push(padLine('KOT #:', kot.kotNumber, charWidth));
  if (options.orderNumber) {
    lines.push(padLine('Ref Order #:', options.orderNumber, charWidth));
  }

  const resolvedOrderType = options.orderType || (kot.tableId ? 'DINE-IN' : 'TAKEAWAY');
  lines.push(padLine('Type:', resolvedOrderType.toUpperCase(), charWidth));

  if (options.tableName || kot.tableId) {
    lines.push(padLine('Table:', options.tableName || `Table ${kot.tableId}`, charWidth));
  }

  const dateStr = kot.createdAt
    ? new Date(
        typeof (kot.createdAt as any).toDate === 'function'
          ? (kot.createdAt as any).toDate()
          : kot.createdAt
      ).toLocaleString('en-IN')
    : new Date().toLocaleString('en-IN');
  lines.push(padLine('Time:', dateStr, charWidth));

  lines.push(divider);

  if (kot.notes) {
    lines.push(`NOTES: ${kot.notes}`);
    lines.push(divider);
  }

  // Items Header
  // 58mm (32 chars): QTY (5), ITEM (27)
  // 80mm (48 chars): QTY (6), ITEM (42)
  const qtyWidth = paperWidth === '58mm' ? 5 : 6;
  const itemWidth = charWidth - qtyWidth;

  const headerStr = 'QTY'.padEnd(qtyWidth) + 'ITEM'.padEnd(itemWidth);
  lines.push(headerStr);
  lines.push(divider);

  // Items
  kot.items.forEach((item) => {
    const qtyStr = `${item.quantity}x`.padEnd(qtyWidth);
    const itemName = item.shortNameSnapshot || item.nameSnapshot;
    
    // Wrapped item name if needed
    if (itemName.length <= itemWidth) {
      lines.push(qtyStr + itemName);
    } else {
      lines.push(qtyStr + itemName.substring(0, itemWidth));
      let remaining = itemName.substring(itemWidth);
      while (remaining.length > 0) {
        lines.push(' '.repeat(qtyWidth) + remaining.substring(0, itemWidth));
        remaining = remaining.substring(itemWidth);
      }
    }

    if (item.modifiers && item.modifiers.length > 0) {
      item.modifiers.forEach((m) => {
        lines.push(' '.repeat(qtyWidth) + ` + ${m.name}`);
      });
    }

    if (item.notes) {
      lines.push(' '.repeat(qtyWidth) + ` * ${item.notes}`);
    }
  });

  lines.push(doubleDivider);

  return {
    title: `KOT ${kot.kotNumber}`,
    paperWidth,
    characterWidth: charWidth,
    textLines: lines,
    htmlContent: `<pre style="font-family: monospace; font-size: 13px; font-weight: bold; line-height: 1.2;">${lines.join('\n')}</pre>`
  };
}
