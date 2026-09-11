import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { Restaurant, RestaurantFormData } from '../types/restaurant';
import {
  getRestaurantById,
  getRestaurantsForUser,
  createDefaultRestaurant,
  subscribeToRestaurant,
  updateRestaurantProfile
} from '../services/restaurantService';
import {
  getUserProfile,
  updateUserProfileRestaurantId
} from '../services/authService';
import { staffService } from '../services/staffService';
import { auth, db } from '../config/firebase';
import { doc, getDoc, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { StaffRole } from '../types/auth';

interface RestaurantContextType {
  restaurant: Restaurant | null;
  loading: boolean;
  error: string | null;
  updateSettings: (data: Partial<RestaurantFormData>) => Promise<void>;
  formatPrice: (amount: number) => string;
  retry: () => void;
  availableRestaurants: Restaurant[];
  switchRestaurant: (restaurantId: string) => Promise<void>;
  isSwitching: boolean;
}

const RestaurantContext = createContext<RestaurantContextType | undefined>(undefined);

export const RestaurantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, setProfile } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState<number>(0);

  // Phase 5C States
  const [availableRestaurants, setAvailableRestaurants] = useState<Restaurant[]>([]);
  const [activeRestaurantId, setActiveRestaurantId] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState<boolean>(false);
  const unsubscribeRef = React.useRef<(() => void) | undefined>(undefined);

  const retry = () => setRetryTrigger((c) => c + 1);

  // Helper to fetch all available restaurants for the user in a secure, non-blocking way
  const fetchAvailableRestaurants = async (userId: string, profileRestId?: string): Promise<Restaurant[]> => {
    const discovered = new Map<string, Restaurant>();

    // 1. Fetch owned restaurants
    try {
      const owned = await getRestaurantsForUser(userId);
      owned.forEach(r => discovered.set(r.restaurantId, r));
    } catch (err) {
      console.warn('[RestaurantOS Debug] Failed to fetch owned restaurants:', err);
    }

    // 2. Fetch profile restaurant
    if (profileRestId && !discovered.has(profileRestId)) {
      try {
        const r = await getRestaurantById(profileRestId);
        if (r) discovered.set(r.restaurantId, r);
      } catch (err) {
        console.warn('[RestaurantOS Debug] Failed to fetch profile restaurant:', err);
      }
    }

    // 3. Collection Group query on 'members' to discover staff roles in other restaurants
    try {
      const q = query(
        collectionGroup(db, 'members'),
        where('userId', '==', userId),
        where('isActive', '==', true)
      );
      const snap = await getDocs(q);
      const memberRestIds: string[] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.restaurantId && data.isActive === true && data.status !== 'inactive') {
          memberRestIds.push(data.restaurantId);
        }
      });

      await Promise.all(
        memberRestIds.map(async (rid) => {
          if (!discovered.has(rid)) {
            try {
              const r = await getRestaurantById(rid);
              if (r) discovered.set(rid, r);
            } catch (err) {
              console.warn(`[RestaurantOS Debug] Failed to fetch member restaurant ${rid}:`, err);
            }
          }
        })
      );
    } catch (err) {
      console.log('[RestaurantOS Debug] Collection group query for memberships skipped or requires index:', err);
    }

    return Array.from(discovered.values());
  };

  const switchRestaurant = async (newId: string) => {
    if (!user) throw new Error('Unauthenticated');
    setIsSwitching(true);
    try {
      console.log('[RestaurantOS Debug] Initiating switch to restaurant:', newId);
      const found = await getRestaurantById(newId);
      if (!found) {
        throw new Error('Restaurant not found or inaccessible.');
      }

      let activeRole: StaffRole = 'owner';
      if (found.ownerId !== user.uid) {
        const memberRef = doc(db, 'restaurants', found.restaurantId, 'members', user.uid);
        const memberSnap = await getDoc(memberRef);
        if (memberSnap.exists()) {
          const memberData = memberSnap.data();
          const isActive = memberData.isActive !== false && memberData.status !== 'inactive';
          if (isActive) {
            activeRole = memberData.role as StaffRole;
          } else {
            throw new Error('Access Denied: Your staff membership is inactive or disabled.');
          }
        } else {
          throw new Error('Access Denied: You do not have permission to access this restaurant.');
        }
      }

      // 1. Clean up existing listener
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = undefined;
      }

      // 2. Persist selection to localStorage & Firestore profile
      try {
        localStorage.setItem(`restaurantos_restaurant_id_${user.uid}`, found.restaurantId);
      } catch {}

      try {
        await updateUserProfileRestaurantId(user.uid, found.restaurantId);
      } catch (linkErr) {
        console.warn('[RestaurantOS Debug] Failed to persist restaurantId link to profile:', linkErr);
      }

      // 3. Update active states
      setActiveRestaurantId(found.restaurantId);
      setRestaurant(found);
      setError(null);

      // 4. Update role and restaurantId in AuthContext profile
      setProfile((prev) => {
        if (prev) {
          return {
            ...prev,
            restaurantId: found.restaurantId,
            role: activeRole
          };
        }
        return {
          userId: user.uid,
          displayName: user.displayName || user.email?.split('@')[0] || 'Staff',
          email: user.email || '',
          photoUrl: user.photoURL || null,
          role: activeRole,
          restaurantId: found.restaurantId
        };
      });

      // 5. Start new listener
      unsubscribeRef.current = subscribeToRestaurant(
        found.restaurantId,
        (updated) => {
          if (updated) {
            setRestaurant(updated);
          }
        },
        (err) => {
          console.error('[RestaurantOS Debug] Restaurant subscription error:', err);
        }
      );

      console.log('[RestaurantOS Debug] Switch complete. Current active role:', activeRole);
    } catch (err: any) {
      console.error('[RestaurantOS Debug] Failed to switch restaurant:', err);
      throw err;
    } finally {
      setIsSwitching(false);
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const initRestaurant = async () => {
      if (!user) {
        setRestaurant(null);
        setAvailableRestaurants([]);
        setActiveRestaurantId(null);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      console.log('[RestaurantOS Debug] Auth user detected:', {
        authUid: user.uid,
        email: user.email,
        displayName: user.displayName || profile?.displayName || null,
        isAnonymous: user.isAnonymous ?? false
      });

      const ownerName = profile?.displayName || user.displayName || 'Owner';
      let resolvedRestaurant: Restaurant | null = null;
      let readErrorEncountered: string | null = null;
      let verifiedProfile = profile;

      try {
        // -------------------------------------------------------------
        // Step 0: Claim any pending invitations or unlinked staff records
        // for this authenticated user's email
        // -------------------------------------------------------------
        if (user.email) {
          try {
            await staffService.claimPendingInvitationsForUser({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || profile?.displayName || null,
              emailVerified: user.emailVerified,
              providerData: user.providerData
            });
          } catch (claimErr) {
            console.warn('[RestaurantOS Debug] Pending invitation claim note (non-fatal):', claimErr);
          }
        }

        // -------------------------------------------------------------
        // Strategy 1: Cached local pointer for this authenticated user (HINT ONLY)
        // Never trusted for authorization - must verify existence and membership from Firestore
        // -------------------------------------------------------------
        const cachedRestaurantId = localStorage.getItem(`restaurantos_restaurant_id_${user.uid}`);
        if (cachedRestaurantId) {
          console.log('[RestaurantOS Debug] Strategy 1: Checking cached restaurantId in localStorage:', cachedRestaurantId);
          try {
            const found = await getRestaurantById(cachedRestaurantId);
            if (found) {
              let hasAccess = found.ownerId === user.uid;
              if (!hasAccess) {
                try {
                  const memberRef = doc(db, 'restaurants', found.restaurantId, 'members', user.uid);
                  const memberSnap = await getDoc(memberRef);
                  if (memberSnap.exists()) {
                    const memberData = memberSnap.data();
                    if (memberData.isActive !== false && memberData.status !== 'inactive') {
                      hasAccess = true;
                    }
                  }
                } catch (memberErr) {
                  console.warn('[RestaurantOS Debug] Failed to check member access for cached restaurant:', memberErr);
                }
              }

              if (hasAccess) {
                resolvedRestaurant = found;
                console.log('[RestaurantOS Debug] Successfully verified and resolved restaurant via cached ID:', {
                  restaurantId: resolvedRestaurant.restaurantId,
                  name: resolvedRestaurant.name,
                  docPath: `restaurants/${resolvedRestaurant.restaurantId}`,
                  ownerId: resolvedRestaurant.ownerId
                });
              } else {
                console.warn('[RestaurantOS Debug] Cached restaurantId belongs to different owner/inaccessible. Invalidating cache.');
                try {
                  localStorage.removeItem(`restaurantos_restaurant_id_${user.uid}`);
                } catch {}
              }
            } else {
              // Pointed to non-existent document
              try {
                localStorage.removeItem(`restaurantos_restaurant_id_${user.uid}`);
              } catch {}
            }
          } catch (cacheErr: any) {
            console.warn('[RestaurantOS Debug] Cached restaurantId lookup failed:', cacheErr);
            if (cacheErr?.message && !cacheErr.message.includes('not found')) {
              readErrorEncountered = cacheErr.message;
            }
          }
        }

        // -------------------------------------------------------------
        // Strategy 2: Check user profile in Firestore for existing restaurantId
        // Must verify that document exists and belongs to authenticated user/member
        // -------------------------------------------------------------
        if (!resolvedRestaurant) {
          let targetRestaurantId = profile?.restaurantId;
          if (!targetRestaurantId) {
            try {
              const freshProfile = await getUserProfile(user.uid);
              verifiedProfile = freshProfile;
              if (freshProfile?.restaurantId) {
                targetRestaurantId = freshProfile.restaurantId;
              }
            } catch (profErr: any) {
              console.warn('[RestaurantOS Debug] Could not fetch fresh user profile:', profErr);
              if (profErr?.message) readErrorEncountered = profErr.message;
            }
          }

          if (targetRestaurantId) {
            console.log('[RestaurantOS Debug] Strategy 2: Looking up restaurant from user profile restaurantId:', targetRestaurantId);
            try {
              const found = await getRestaurantById(targetRestaurantId);
              if (found) {
                let hasAccess = found.ownerId === user.uid;
                if (!hasAccess) {
                  try {
                    const memberRef = doc(db, 'restaurants', found.restaurantId, 'members', user.uid);
                    const memberSnap = await getDoc(memberRef);
                    if (memberSnap.exists()) {
                      const memberData = memberSnap.data();
                      if (memberData.isActive !== false && memberData.status !== 'inactive') {
                        hasAccess = true;
                      }
                    }
                  } catch (memberErr) {
                    console.warn('[RestaurantOS Debug] Failed to check member access for profile restaurant:', memberErr);
                  }
                }

                if (hasAccess) {
                  resolvedRestaurant = found;
                  console.log('[RestaurantOS Debug] Successfully verified and resolved restaurant via profile.restaurantId:', {
                    restaurantId: resolvedRestaurant.restaurantId,
                    name: resolvedRestaurant.name,
                    docPath: `restaurants/${resolvedRestaurant.restaurantId}`,
                    ownerId: resolvedRestaurant.ownerId
                  });
                } else {
                  console.warn('[RestaurantOS Debug] Profile restaurantId points to document not accessible by user. Ignoring pointer.');
                }
              }
            } catch (profLookupErr: any) {
              console.warn('[RestaurantOS Debug] Profile restaurantId lookup error:', profLookupErr);
              if (profLookupErr?.message) readErrorEncountered = profLookupErr.message;
            }
          }
        }

        // -------------------------------------------------------------
        // Strategy 3: Check direct deterministic document paths
        // (Direct getDoc lookup - does not require collection list query permissions)
        // -------------------------------------------------------------
        if (!resolvedRestaurant) {
          const sanitizeId = user.uid.toLowerCase().replace(/[^a-z0-9]/g, '_');
          const deterministicDocId = `rest_init_${sanitizeId}`;
          console.log('[RestaurantOS Debug] Strategy 3: Checking direct deterministic paths:', deterministicDocId, `restaurants/${user.uid}`);
          try {
            const byInitDoc = await getRestaurantById(deterministicDocId);
            if (byInitDoc && byInitDoc.ownerId === user.uid) {
              resolvedRestaurant = byInitDoc;
            } else {
              const byUidRest = await getRestaurantById(user.uid);
              if (byUidRest && byUidRest.ownerId === user.uid) {
                resolvedRestaurant = byUidRest;
              }
            }
            if (resolvedRestaurant) {
              console.log('[RestaurantOS Debug] Successfully resolved restaurant via direct deterministic document:', {
                restaurantId: resolvedRestaurant.restaurantId,
                name: resolvedRestaurant.name,
                docPath: `restaurants/${resolvedRestaurant.restaurantId}`,
                ownerId: resolvedRestaurant.ownerId
              });
            }
          } catch (byUidErr: any) {
            console.warn('[RestaurantOS Debug] Direct document lookup error (non-fatal):', byUidErr);
          }
        }

        // -------------------------------------------------------------
        // Strategy 4: Query restaurants collection for ownerId == user.uid
        // (Safely isolated in try/catch so list-permission errors do not crash resolution)
        // -------------------------------------------------------------
        if (!resolvedRestaurant) {
          console.log('[RestaurantOS Debug] Strategy 4: Querying restaurants collection where ownerId ==', user.uid);
          try {
            const ownedList = await getRestaurantsForUser(user.uid);
            console.log('[RestaurantOS Debug] Strategy 4: getRestaurantsForUser returned count:', ownedList.length);
            if (ownedList && ownedList.length > 0) {
              resolvedRestaurant = ownedList[0];
              console.log('[RestaurantOS Debug] Successfully resolved restaurant via ownerId query:', {
                restaurantId: resolvedRestaurant.restaurantId,
                name: resolvedRestaurant.name,
                docPath: `restaurants/${resolvedRestaurant.restaurantId}`,
                ownerId: resolvedRestaurant.ownerId
              });
            }
          } catch (queryErr: any) {
            console.warn('[RestaurantOS Debug] Strategy 4: Collection list query error:', queryErr);
          }
        }

        // -------------------------------------------------------------
        // Strategy 4B: Staff membership discovery across restaurants
        // -------------------------------------------------------------
        if (!resolvedRestaurant) {
          console.log('[RestaurantOS Debug] Strategy 4B: Discovering staff memberships for user:', user.uid);
          try {
            const staffMembership = await staffService.findStaffMembershipForUser(user.uid, user.email);
            if (staffMembership) {
              const found = await getRestaurantById(staffMembership.restaurantId);
              if (found) {
                resolvedRestaurant = found;
                console.log('[RestaurantOS Debug] Successfully resolved restaurant via active staff membership:', {
                  restaurantId: resolvedRestaurant.restaurantId,
                  name: resolvedRestaurant.name,
                  role: staffMembership.role
                });
              }
            }
          } catch (staffFindErr: any) {
            console.warn('[RestaurantOS Debug] Strategy 4B: Staff membership lookup error:', staffFindErr);
          }
        }

        // -------------------------------------------------------------
        // DUPLICATE RESTAURANT PROTECTION & STRICT PROOF CHECK:
        // A staff member must NEVER fall into createDefaultRestaurant()!
        // -------------------------------------------------------------
        if (!resolvedRestaurant) {
          if (readErrorEncountered) {
            throw new Error(`Cannot verify existing restaurant due to Firestore error: ${readErrorEncountered}`);
          }

          // Check if user has an inactive / deactivated membership in any restaurant
          const hasInactiveMembership = await staffService.checkIfUserHasInactiveMembership(user.uid, user.email);
          if (hasInactiveMembership) {
            throw new Error('Access Denied: Your staff membership is inactive or disabled.');
          }

          // If user profile has an explicit staff role (non-owner)
          if (verifiedProfile?.role && verifiedProfile.role !== 'owner') {
            throw new Error(
              'Access Denied: Your staff account is not linked to an active restaurant. Please contact the restaurant owner.'
            );
          }

          // Check if user's email was registered or invited as staff anywhere
          const isStaffUser = await staffService.checkIfEmailIsStaff(user.email);
          if (isStaffUser) {
            throw new Error(
              'Access Denied: Your staff account is not linked to an active restaurant. Please contact the restaurant owner.'
            );
          }

          console.log('[RestaurantOS Debug] Strategy 5: Proved clean absence of existing restaurant for verified owner. Creating default restaurant for user:', user.uid);
          resolvedRestaurant = await createDefaultRestaurant(user.uid, user.email || '', ownerName);
          console.log('[RestaurantOS Debug] Provisioned new default restaurant:', {
            restaurantId: resolvedRestaurant.restaurantId,
            docPath: `restaurants/${resolvedRestaurant.restaurantId}`
          });
        }

        // Persist the resolved restaurant ID to both localStorage and Firestore profile
        if (resolvedRestaurant) {
          let activeRole: StaffRole = 'owner';
          if (resolvedRestaurant.ownerId !== user.uid) {
            const memberRef = doc(db, 'restaurants', resolvedRestaurant.restaurantId, 'members', user.uid);
            const memberSnap = await getDoc(memberRef);
            if (memberSnap.exists()) {
              const memberData = memberSnap.data();
              const isActive = memberData.isActive !== false && memberData.status !== 'inactive';
              if (isActive) {
                activeRole = memberData.role as StaffRole;
              } else {
                throw new Error('Access Denied: Your staff membership is inactive or disabled.');
              }
            } else {
              throw new Error('Access Denied: You do not have permission to access this restaurant.');
            }
          }

          try {
            localStorage.setItem(`restaurantos_restaurant_id_${user.uid}`, resolvedRestaurant.restaurantId);
          } catch {}

          try {
            await updateUserProfileRestaurantId(user.uid, resolvedRestaurant.restaurantId);
          } catch (linkErr) {
            console.warn('[RestaurantOS Debug] Failed to persist restaurantId link to profile:', linkErr);
          }

          setProfile((prev) => {
            if (prev && prev.role === activeRole && prev.restaurantId === resolvedRestaurant?.restaurantId) return prev;
            if (prev) return { ...prev, role: activeRole, restaurantId: resolvedRestaurant?.restaurantId };
            return {
              userId: user.uid,
              displayName: user.displayName || user.email?.split('@')[0] || 'Staff',
              email: user.email || '',
              photoUrl: user.photoURL || null,
              role: activeRole,
              restaurantId: resolvedRestaurant?.restaurantId
            };
          });
        }

        if (isCancelled) return;

        // Set states
        setRestaurant(resolvedRestaurant);
        setActiveRestaurantId(resolvedRestaurant.restaurantId);
        setError(null);

        // Fetch available restaurants in the background
        fetchAvailableRestaurants(user.uid, resolvedRestaurant.restaurantId)
          .then((list) => {
            if (!isCancelled) {
              setAvailableRestaurants(list);
            }
          })
          .catch((err) => {
            console.warn('[RestaurantOS Debug] Error fetching available restaurants:', err);
          });

        console.log('[RestaurantOS Debug] Final restaurant paths initialized:', {
          authUid: user.uid,
          userEmail: user.email,
          resolvedRestaurantId: resolvedRestaurant.restaurantId,
          restaurantDocPath: `restaurants/${resolvedRestaurant.restaurantId}`
        });

        // Set up real-time listener for the active restaurant document
        if (!isCancelled) {
          if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = undefined;
          }
          unsubscribeRef.current = subscribeToRestaurant(
            resolvedRestaurant.restaurantId,
            (updated) => {
              if (updated && !isCancelled) {
                setRestaurant(updated);
              }
            },
            (err) => {
              if (isCancelled || !auth.currentUser) return;
              console.error('[RestaurantOS Debug] Restaurant subscription error:', err);
            }
          );
        }

      } catch (err: any) {
        if (isCancelled) return;
        console.error('[RestaurantOS Debug] Failed to resolve restaurant from Firestore:', err);
        setRestaurant(null);
        setActiveRestaurantId(null);

        let rawMsg = err?.message || 'Failed to load restaurant profile from Firestore';
        const jsonMatch = rawMsg.match(/\{[\s\S]*\}/);
        let displayError = rawMsg;
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.error) displayError = parsed.error;
          } catch {}
        }
        setError(displayError);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    initRestaurant();

    return () => {
      isCancelled = true;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = undefined;
      }
    };
  }, [user, profile?.restaurantId, profile?.role, retryTrigger]);

  const updateSettings = async (data: Partial<RestaurantFormData>) => {
    if (!restaurant) throw new Error('No active restaurant');
    try {
      await updateRestaurantProfile(restaurant.restaurantId, data);
      setRestaurant((prev) => (prev ? { ...prev, ...data } : prev));
    } catch (err) {
      setRestaurant((prev) => (prev ? { ...prev, ...data } : prev));
      throw err;
    }
  };

  const formatPrice = (amount: number) => {
    const symbol = restaurant?.currencySymbol || '₹';
    return `${symbol}${Number(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  return (
    <RestaurantContext.Provider
      value={{
        restaurant,
        loading,
        error,
        updateSettings,
        formatPrice,
        retry,
        availableRestaurants,
        switchRestaurant,
        isSwitching
      }}
    >
      {children}
    </RestaurantContext.Provider>
  );
};

export function useRestaurant() {
  const context = useContext(RestaurantContext);
  if (!context) {
    throw new Error('useRestaurant must be used within a RestaurantProvider');
  }
  return context;
}
