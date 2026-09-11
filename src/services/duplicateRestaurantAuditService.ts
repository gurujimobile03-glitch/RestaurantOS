import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Restaurant } from '../types/restaurant';

export interface RestaurantAuditSummary {
  restaurantId: string;
  name: string;
  city: string;
  ownerId: string;
  createdAt: string | null;
  updatedAt: string | null;
  provisioningType?: string;
  createdBy?: string;
  counts: {
    orders: number;
    kots: number;
    menuItems: number;
    categories: number;
    tables: number;
    tableSessions: number;
    payments: number;
    members: number;
    auditLogs: number;
    devices: number;
  };
  totalActivityScore: number;
  isPrimaryCandidate: boolean;
  isDuplicateCandidate: boolean;
  classificationReason: string;
}

export interface DuplicateAuditReport {
  timestamp: string;
  ownerId: string;
  totalRestaurantsFound: number;
  primaryRestaurantId: string | null;
  duplicateCandidateIds: string[];
  summaries: RestaurantAuditSummary[];
}

export async function auditUserRestaurants(ownerId: string): Promise<DuplicateAuditReport> {
  const q = query(collection(db, 'restaurants'), where('ownerId', '==', ownerId));
  const snap = await getDocs(q);

  const restaurants: Restaurant[] = [];
  snap.forEach((d) => {
    restaurants.push({ restaurantId: d.id, ...d.data() } as Restaurant);
  });

  const summaries: RestaurantAuditSummary[] = [];

  for (const r of restaurants) {
    const subcollections = [
      'orders',
      'kots',
      'items',
      'categories',
      'tables',
      'tableSessions',
      'payments',
      'members',
      'auditLogs',
      'devices'
    ];

    const counts: Record<string, number> = {};

    for (const sub of subcollections) {
      try {
        const subSnap = await getDocs(collection(db, 'restaurants', r.restaurantId, sub));
        counts[sub] = subSnap.size;
      } catch (e) {
        counts[sub] = 0;
      }
    }

    const activityScore =
      counts['orders'] * 10 +
      counts['kots'] * 5 +
      counts['payments'] * 10 +
      counts['items'] * 2 +
      counts['categories'] * 2 +
      counts['tables'] +
      counts['members'] * 5 +
      counts['auditLogs'] +
      counts['devices'];

    let createdAtStr: string | null = null;
    if (r.createdAt) {
      if (typeof r.createdAt.toDate === 'function') {
        createdAtStr = r.createdAt.toDate().toISOString();
      } else if (r.createdAt.seconds) {
        createdAtStr = new Date(r.createdAt.seconds * 1000).toISOString();
      } else if (typeof r.createdAt === 'string') {
        createdAtStr = r.createdAt;
      }
    }

    let updatedAtStr: string | null = null;
    if (r.updatedAt) {
      if (typeof r.updatedAt.toDate === 'function') {
        updatedAtStr = r.updatedAt.toDate().toISOString();
      } else if (r.updatedAt.seconds) {
        updatedAtStr = new Date(r.updatedAt.seconds * 1000).toISOString();
      } else if (typeof r.updatedAt === 'string') {
        updatedAtStr = r.updatedAt;
      }
    }

    summaries.push({
      restaurantId: r.restaurantId,
      name: r.name,
      city: r.city || '',
      ownerId: r.ownerId,
      createdAt: createdAtStr,
      updatedAt: updatedAtStr,
      provisioningType: r.provisioningType,
      createdBy: r.createdBy,
      counts: {
        orders: counts['orders'],
        kots: counts['kots'],
        menuItems: counts['items'],
        categories: counts['categories'],
        tables: counts['tables'],
        tableSessions: counts['tableSessions'],
        payments: counts['payments'],
        members: counts['members'],
        auditLogs: counts['auditLogs'],
        devices: counts['devices']
      },
      totalActivityScore: activityScore,
      isPrimaryCandidate: false,
      isDuplicateCandidate: false,
      classificationReason: ''
    });
  }

  summaries.sort((a, b) => {
    if (b.totalActivityScore !== a.totalActivityScore) {
      return b.totalActivityScore - a.totalActivityScore;
    }
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });

  if (summaries.length > 0) {
    summaries[0].isPrimaryCandidate = true;
    summaries[0].classificationReason = `Primary Outlet Document (Highest activity score: ${summaries[0].totalActivityScore})`;

    for (let i = 1; i < summaries.length; i++) {
      if (summaries[i].totalActivityScore === 0) {
        summaries[i].isDuplicateCandidate = true;
        summaries[i].classificationReason = 'Candidate Duplicate Document (Zero business activity, 0 orders/KOTs)';
      } else {
        summaries[i].isPrimaryCandidate = true;
        summaries[i].classificationReason = `Legitimate Branch Outlet (Has ${summaries[i].counts.orders} orders, ${summaries[i].counts.menuItems} menu items)`;
      }
    }
  }

  const primaryId = summaries.find((s) => s.isPrimaryCandidate)?.restaurantId || null;
  const duplicateIds = summaries.filter((s) => s.isDuplicateCandidate).map((s) => s.restaurantId);

  return {
    timestamp: new Date().toISOString(),
    ownerId,
    totalRestaurantsFound: summaries.length,
    primaryRestaurantId: primaryId,
    duplicateCandidateIds: duplicateIds,
    summaries
  };
}
