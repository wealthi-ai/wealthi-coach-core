export interface CoachPersonaConfig {
  institutionName: string;
  domainDescription: string;
  subjectMatter: string;
}

export interface CoachRequestPayload {
  studentId: string;
  trigger?: string;
}

export interface CoachResponse {
  message: string;
  fallback?: boolean;
}

export interface CoachError {
  error: string;
}
