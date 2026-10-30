export interface DieOutcome {
  name: string;
  hex: string;
}

export interface RollRecord {
  rollNumber: number;
  hash: string;
  time: number | null;
  isRigged: boolean;
  names: string[];
  colors: string[];
  dice: DieOutcome[];
}

export interface ColorStatItem {
  name: string;
  hex: string;
  count: number;
  percentage: number;
  deviation: number;
}

export interface StrategyItem {
  id: string;
  name: string;
  color: string;
  secondaryColor?: string;
  tertiaryColor?: string;
  hex: string;
  secondaryHex?: string;
  tertiaryHex?: string;
  strategy: string;
  confidence: number;
  recentHits: number;
  gap: number;
  rationale: string;
}

export interface CandidateItem {
  name: string;
  hex: string;
  score: number;
  recentHits: number;
  gap: number;
}

export interface SuggestedPickData {
  color: string;
  secondaryColor?: string;
  tertiaryColor?: string;
  hex: string;
  strategy: string;
  confidence: number;
  count: number;
  percentage: number;
  recentHits: number;
  gap: number;
  totalDice: number;
  rationale: string;
  clusterCoverageConfidence?: number;
  dualCoverageConfidence?: number;
  strategies: StrategyItem[];
  allCandidates: CandidateItem[];
}

export interface SessionStats {
  totalRolls: number;
  totalDiceAnalyzed: number;
  riggedFlagsCount: number;
  allFair: boolean;
  expectedPerColorPct: number;
  colors: Record<string, ColorStatItem>;
  coldest: ColorStatItem | null;
  hottest: ColorStatItem | null;
}

export interface SessionData {
  success: boolean;
  sessionId: string;
  roomId?: string;
  source: string;
  isolated?: boolean;
  zeroCollisions?: boolean;
  totalRolls: number;
  stats: SessionStats;
  suggestedPick: SuggestedPickData;
  rolls: RollRecord[];
  error?: string;
}

export interface AuthState {
  success: boolean;
  valid: boolean;
  key: string;
  role: 'owner' | 'admin' | 'user' | 'free';
  duration?: string;
  createdAt?: number;
  expiresAt?: number | null;
  remainingMs?: number | null;
  label?: string;
  hwid?: string | null;
  hwidLock?: boolean;
  isMaster?: boolean;
  roomId?: string;
  error?: string;
  hwidMismatch?: boolean;
}

export interface AnnouncementData {
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success';
  enabled: boolean;
  updatedAt?: number;
}

export interface MaintenanceData {
  enabled: boolean;
  title?: string;
  headline?: string;
  message?: string;
  durationMinutes?: number;
  startedAt?: number;
}

