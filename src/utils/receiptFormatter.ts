import { Order } from '../types/order';
import { Restaurant } from '../types/restaurant';
import { FormattedPrintDocument, PaperWidth } from '../types/printer';
import { formatMoney } from './money';

export interface FormatReceiptOptions {
  paperWidth?: PaperWidth;
  isReprint?: boolean;
}

export function getCharacterWidth(paperWidth: PaperWidth): number {
  return paperWidth === '58mm' ? 32 : 48;
}

export function padLine(left: string, right: string, width: number): string {
  const spaceNeeded = width - left.length - right.length;
  if (spaceNeeded <= 0) {
    const truncatedLeft = left.substring(0, Math.max(1, width - right.length - 1));
    return truncatedLeft + ' ' + right;
  }
  return left + ' '.repeat(spaceNeeded) + right;
}

export function centerLine(text: string, width: number): string {
  if (text.length >= width) return text.substring(0, width);
  const leftPadding = Math.floor((width - text.length) / 2);
  return ' '.repeat(leftPadding) + text;
}

export function formatBillReceipt(
  order: Order,
  restaurant: Partial<Restaurant> | null,
  options: FormatReceiptOptions = {}
): FormattedPrintDocument {
  const paperWidth = options.paperWidth || '80mm';
  const charWidth = getCharacterWidth(paperWidth);
  const symbol = restaurant?.currencySymbol || '₹';
  const lines: string[] = [];

  const divider = '-'.repeat(charWidth);
  const doubleDivider = '='.repeat(charWidth);

  if (options.isReprint || order.status === 'completed') {
    lines.push(centerLine('*** REPRINT / DUPLICATE ***', charWidth));
    lines.push(divider);
  }

  // Restaurant Header
  const resName = (restaurant?.name || 'RestaurantOS').toUpperCase();
  lines.push(centerLine(resName, charWidth));

  if (restaurant?.address) {
    lines.push(centerLine(restaurant.address, charWidth));
  }
  if (restaurant?.city) {
    const locationStr = `${restaurant.city}${restaurant.state ? ', ' + restaurant.state : ''} ${restaurant.postalCode || ''}`.trim();
    lines.push(centerLine(locationStr, charWidth));
  }
  if (restaurant?.phone) {
    lines.push(centerLine(`Ph: ${restaurant.phone}`, charWidth));
  }
  if (restaurant?.gstNumber) {
    lines.push(centerLine(`GSTIN: ${restaurant.gstNumber}`, charWidth));
  }

  lines.push(divider);

  // Meta Information
  lines.push(padLine('Order #:', order.orderNumber, charWidth));
  lines.push(padLine('Type:', order.orderType.toUpperCase(), charWidth));
  if (order.tableId) {
    lines.push(padLine('Table:', `Table ${order.tableId}`, charWidth));
  }

  const dateStr = order.createdAt
    ? new Date(
        typeof (order.createdAt as any).toDate === 'function'
          ? (order.createdAt as any).toDate()
          : order.createdAt
      ).toLocaleString('en-IN')
    : new Date().toLocaleString('en-IN');
  lines.push(padLine('Date:', dateStr, charWidth));

  lines.push(divider);

  // Item Table
  // 58mm (32 chars): Item (18), Qty (4), Amt (10)
  // 80mm (48 chars): Item (30), Qty (6), Amt (12)
  const qtyColWidth = paperWidth === '58mm' ? 4 : 6;
  const amtColWidth = paperWidth === '58mm' ? 10 : 12;
  const itemColWidth = charWidth - qtyColWidth - amtColWidth;

  const colHeader =
    'ITEM'.padEnd(itemColWidth) +
    'QTY'.padStart(qtyColWidth) +
    'AMOUNT'.padStart(amtColWidth);
  lines.push(colHeader);
  lines.push(divider);

  order.items.forEach((item) => {
    const itemName = item.nameSnapshot.length > itemColWidth
      ? item.nameSnapshot.substring(0, itemColWidth - 1) + '…'
      : item.nameSnapshot;
    const qtyStr = String(item.quantity);
    const amtStr = formatMoney(item.lineTotalMinor, symbol);

    const line =
      itemName.padEnd(itemColWidth) +
      qtyStr.padStart(qtyColWidth) +
      amtStr.padStart(amtColWidth);
    lines.push(line);

    if (item.modifiers && item.modifiers.length > 0) {
      item.modifiers.forEach((m) => {
        lines.push(`  + ${m.name}`);
      });
    }
  });

  lines.push(divider);

  // Financial Totals (Authoritative from Order)
  lines.push(padLine('Subtotal:', formatMoney(order.subtotalMinor, symbol), charWidth));

  if (order.discountMinor > 0) {
    lines.push(padLine('Discount:', `-${formatMoney(order.discountMinor, symbol)}`, charWidth));
  }

  lines.push(padLine('Taxable Amount:', formatMoney(order.taxableAmountMinor, symbol), charWidth));

  if (order.cgstMinor > 0) {
    lines.push(padLine('CGST:', formatMoney(order.cgstMinor, symbol), charWidth));
  }
  if (order.sgstMinor > 0) {
    lines.push(padLine('SGST:', formatMoney(order.sgstMinor, symbol), charWidth));
  }
  if (order.igstMinor > 0) {
    lines.push(padLine('IGST:', formatMoney(order.igstMinor, symbol), charWidth));
  }

  lines.push(doubleDivider);
  lines.push(padLine('GRAND TOTAL:', formatMoney(order.grandTotalMinor, symbol), charWidth));
  lines.push(doubleDivider);

  // Payment Status
  lines.push(padLine('Paid Amount:', formatMoney(order.paidAmountMinor, symbol), charWidth));
  lines.push(padLine('Due Amount:', formatMoney(order.dueAmountMinor, symbol), charWidth));

  if (order.dueAmountMinor === 0) {
    lines.push(centerLine('** FULLY PAID & SETTLED **', charWidth));
  }

  lines.push(divider);
  lines.push(centerLine('Thank you for dining with us!', charWidth));

  return {
    title: `Bill ${order.orderNumber}`,
    paperWidth,
    characterWidth: charWidth,
    textLines: lines,
    htmlContent: `<pre style="font-family: monospace; font-size: 12px; line-height: 1.2;">${lines.join('\n')}</pre>`
  };
}
