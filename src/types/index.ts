export interface FolderInfo {
  fid: number;
  title: string;
  mediaCount: number;
  cover?: string;
  /** 是否为「默认收藏夹」 */
  isDefault: boolean;
  /** 自建 or 收藏的他人收藏夹 */
  kind: 'created' | 'collected';
}

export interface FolderStat {
  fid: number;
  title: string;
  count: number;
  cover?: string;
  isDefault: boolean;
  kind: 'created' | 'collected';
}

export interface PageMeta {
  page: number;
  cid: number;
  part: string;
  duration: number;
}

export interface VideoMeta {
  bvid: string;
  aid: number;
  title: string;
  desc?: string;
  cover: string;
  up: { mid: number; name: string };
  pubDate: number;
  duration: number;
  tid?: number;
  tname?: string;
  stat?: { view: number; danmaku: number; like: number; favorite: number };
  url: string;
  /** 收藏时对应的分 P（1-based） */
  collectedPage: number;
  /** 全部分 P（下载规划阶段由 view 接口补齐） */
  pages?: PageMeta[];
  /** 所属收藏夹（可能多个） */
  folders: { fid: number; title: string; favTime: number }[];
  /** 归属目录（scanner 依据 folderPick 决策） */
  primaryFolder?: { fid: number; title: string; dir: string };
  local?: {
    status: 'pending' | 'downloading' | 'done' | 'failed' | 'skipped' | 'dead';
    dir?: string;
    video?: string;
    poster?: string;
    subtitles?: { format: 'ass' | 'srt'; file: string }[];
    meta?: string;
    downloadedAt?: number;
  };
}

export interface IndexFile {
  schema: string;
  generatedAt: number;
  user: { mid: number; uname: string };
  folders: FolderStat[];
  videos: VideoMeta[];
  skipped: { nonVideo: number; dead: number };
}

export interface FavoritesFile {
  schema: string;
  generatedAt: number;
  user: { mid: number; uname: string };
  folders: FolderStat[];
}
