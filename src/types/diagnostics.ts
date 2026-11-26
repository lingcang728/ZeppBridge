/* 诊断报告与反馈提交。从 types/index.ts 按领域拆出，形状不变。 */

export interface DiagnosticField {
  name: string;
  jsonType: 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object' | string;
}

export interface DiagnosticObjectShape {
  path: string;
  fields: DiagnosticField[];
}

export interface DiagnosticDeviceCandidate {
  catalogId: string;
  canonicalName: string;
  firmware?: string | null;
  matchStatus: 'exact' | 'alias' | 'unknown';
}

export interface DiagnosticReport {
  format: string;
  appVersion: string;
  schemaVersion: number;
  normalizerRevision: string;
  operatingSystem: string;
  deviceEvidence: {
    status: string;
    objectCount: number;
    unknownDeviceCount: number;
    idAliasObjects: number;
    serialAliasObjects: number;
    nameFieldObjects: number;
    firmwareFieldObjects: number;
    candidates: DiagnosticDeviceCandidate[];
    unmatchedProductHints: string[];
    modelIdentifierHints?: string[];
    /** 认不出的设备一台一组；没有认不出的设备时不出现 */
    unknownDevices?: Array<{ deviceSource?: number; deviceType?: number; productName?: string }>;
    shapes: DiagnosticObjectShape[];
  };
  unknownWorkoutCodes: Array<{ code: number; records: number }>;
  workoutTypeConflicts: number;
}

export interface FeedbackSubmissionResult {
  reportId: string;
  submittedAt: string;
}
