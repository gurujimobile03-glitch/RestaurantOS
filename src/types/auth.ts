export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  isAnonymous?: boolean;
  emailVerified?: boolean;
  providerData?: Array<{ providerId: string }>;
}

export interface UserProfile {
  userId: string;
  displayName: string;
  email: string;
  photoUrl: string | null;
  restaurantId?: string;
  role?: StaffRole;
  createdAt?: any;
  updatedAt?: any;
}

export type StaffRole = 'owner' | 'manager' | 'cashier' | 'kitchen' | 'captain' | 'accountant';

export interface RestaurantMember {
  memberId: string;
  restaurantId: string;
  userId: string;
  role: StaffRole;
  isActive: boolean;
  status?: 'active' | 'inactive' | 'pending_setup' | 'expired' | 'revoked';
  authLinked?: boolean;
  displayName?: string;
  email?: string;
  invitedBy?: string;
  isOwner?: boolean;
  invitationToken?: string;
  invitationUrl?: string;
  expiresAt?: number | any;
  invitationStatus?: 'inviting' | 'invitation_sent' | 'invitation_failed' | 'pending_setup' | 'active' | 'expired' | 'revoked';
  invitationError?: string | null;
  createdAt?: any;
  updatedAt?: any;
}
