export type UserId = string;
export type ProjectId = string;
export type VideoId = string;
export type Feedback = "up" | "down" | null;

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  isSilence?: boolean;
  speaker?: string;
}

export interface Transcript {
  videoId: VideoId;
  userId: UserId;
  projectId: ProjectId;
  duration: number;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
  source: "whisper" | "heuristic";
}

export interface CutAction {
  action: "cut";
  start: number;
  end: number;
  reason: string;
}

export interface PromptLogRecord {
  id: string;
  userId: UserId;
  projectId: ProjectId;
  prompt: string;
  transcriptSnippet: string;
  editPlanJson: unknown;
  timestamp: string;
  feedback: Feedback;
}

export interface ProjectFile {
  version: number;
  userId: UserId;
  projectId: ProjectId;
  prompt: string;
  transcript: Transcript;
  plan: CutAction[];
  updatedAt: string;
}

export interface UploadResult {
  videoId: VideoId;
  userId: UserId;
  projectId: ProjectId;
  name: string;
  sourceKey: string;
  sourceUrl: string;
  transcript: Transcript;
  duration: number;
}
