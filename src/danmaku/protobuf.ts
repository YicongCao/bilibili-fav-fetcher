import protobuf from 'protobufjs';

const DM_PROTO = `
syntax = "proto3";
message DanmakuElem {
  int64 id = 1;
  int32 progress = 2;
  int32 mode = 3;
  int32 fontsize = 4;
  uint32 color = 5;
  string midHash = 6;
  string content = 7;
  int64 ctime = 8;
  int32 weight = 9;
  string action = 10;
  int32 pool = 11;
  string idStr = 12;
  int32 attr = 13;
  string animation = 14;
}
message DmSegReply {
  repeated DanmakuElem elems = 1;
  int32 state = 2;
  string text = 3;
}
`;

export interface DanmakuElem {
  id?: number | string;
  progress?: number;
  mode?: number;
  fontsize?: number;
  color?: number;
  content?: string;
  ctime?: number | string;
  weight?: number;
  pool?: number;
  idStr?: string;
}

let DmSegReply: protobuf.Type | null = null;

function type(): protobuf.Type {
  if (!DmSegReply) {
    const root = protobuf.parse(DM_PROTO).root;
    DmSegReply = root.lookupType('DmSegReply');
  }
  return DmSegReply;
}

/** 解析弹幕段（seg.so） */
export function parseDanmakuSegment(buffer: Uint8Array): DanmakuElem[] {
  const T = type();
  const message = T.decode(buffer) as unknown as { elems?: DanmakuElem[] };
  return (message.elems ?? []).map((e) => ({
    ...e,
    id: e.idStr ?? String(e.id ?? ''),
    progress: Number(e.progress ?? 0),
    mode: Number(e.mode ?? 1),
    fontsize: Number(e.fontsize ?? 25),
    color: Number(e.color ?? 0xffffff),
    content: e.content ?? '',
  }));
}
