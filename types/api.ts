/**
 * Headless Dice — TypeScript Core Type Definitions
 * Strict contracts for License Verification, Multi-User Room Isolation, and Admin Operations.
 */

export type UserRole = 'OWNER' | 'ADMIN' | 'VIP' | 'USER';
export type KeyStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface VerifyRequestBody {
  key: string;
  hwid?: string;
}

export interface VerifyResponseBody {
  success: boolean;
  key?: string;
  role?: UserRole;
  duration?: string;
  boundHwid?: string;
  status?: KeyStatus;
  roomId?: string;
  sessionId?: string;
  token?: string;
  error?: string;
}

export type AdminAction =
  | 'verify_master'
  | 'list_keys'
  | 'generate_key'
  | 'delete_key'
  | 'revoke_key'
  | 'reset_hwid'
  | 'post_announcement'
  | 'clear_announcement'
  | 'get_predictions';

export interface AdminRequestBody {
  masterKey: string;
  action: AdminAction;
  key?: string;
  role?: UserRole;
  duration?: string;
  hwidLock?: boolean;
  notes?: string;
  text?: string;
}

export interface AdminResponseBody {
  success: boolean;
  keys?: Record<string, KeyRecord>;
  count?: number;
  key?: string;
  message?: string;
  error?: string;
}

export interface KeyRecord {
  role: UserRole;
  boundHwid: string;
  duration: string;
  createdTimestamp: number;
  expireTimestamp?: number;
  status: KeyStatus;
  notes?: string;
}

export interface UserSessionState {
  key: string;
  role: UserRole;
  roomId: string;
  sessionId: string;
  boundHwid: string;
  status: KeyStatus;
  timestamp: number;
}

export interface PredictionPayload {
  timestamp: number;
  timeFormatted: string;
  hwid: string;
  rollNumber: number;
  roundDice: string[];
  topColor: string;
  topProbability: number;
  entropyScore: number;
  roomId: string;
}

