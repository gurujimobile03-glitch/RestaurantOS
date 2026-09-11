import { auth } from '../config/firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): Error {
  const errCode = (error as any)?.code;
  const errMsg = error instanceof Error ? error.message : String(error);

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };

  if (errCode === 'unavailable' || errMsg.includes('Could not reach Cloud Firestore backend')) {
    console.warn('[Firestore Offline/Connection] Backend unavailable or operating in offline mode:', path);
  } else if (errCode === 'permission-denied' || errMsg.includes('insufficient permissions')) {
    console.warn('[Firestore Permission Notice] Permission denied at path:', path, 'Check firestore.rules deployment.');
    notifyPermissionIssue(path);
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }

  const cleanMessage = (errCode === 'permission-denied' || errMsg.includes('insufficient permissions'))
    ? `Permission restricted for ${path || 'resource'}. Ensure firestore.rules are deployed.`
    : JSON.stringify(errInfo);

  const errorObj = new Error(cleanMessage);
  (errorObj as any).info = errInfo;
  (errorObj as any).code = errCode;
  return errorObj;
}

// Global listener for permission issues to display an administrative notice banner
type PermissionIssueListener = (path: string | null) => void;
const permissionListeners: Set<PermissionIssueListener> = new Set();
let lastReportedPath: string | null = null;

export function subscribeToPermissionIssues(listener: PermissionIssueListener): () => void {
  permissionListeners.add(listener);
  if (lastReportedPath) {
    listener(lastReportedPath);
  }
  return () => {
    permissionListeners.delete(listener);
  };
}

export function notifyPermissionIssue(path: string | null) {
  lastReportedPath = path;
  permissionListeners.forEach((listener) => {
    try {
      listener(path);
    } catch (err) {
      console.warn('Error in permission listener:', err);
    }
  });
}

