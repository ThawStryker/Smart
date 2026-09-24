import { secret } from "edgespark";

async function callAliyunApi(params: Record<string, string>): Promise<Record<string, unknown>> {
  const accessKeyId = secret.get("ALIYUN_ACCESS_KEY_ID");
  const accessKeySecret = secret.get("ALIYUN_ACCESS_KEY_SECRET");
  if (!accessKeyId || !accessKeySecret) {
    throw new Error("Aliyun credentials not configured");
  }

  const allParams: Record<string, string> = {
    ...params,
    Format: "JSON",
    Version: "2015-01-09",
    AccessKeyId: accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    SignatureNonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
  };

  const sortedKeys = Object.keys(allParams).sort();
  const queryString = sortedKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`).join("&");
  const stringToSign = `POST&${encodeURIComponent("/")}&${encodeURIComponent(queryString)}`;
  const key = accessKeySecret + "&";

  const encoder = new TextEncoder();
  const keyData = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", keyData, encoder.encode(stringToSign));
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  const signedQS = `${queryString}&Signature=${encodeURIComponent(signatureBase64)}`;
  const res = await fetch(`https://alidns.aliyuncs.com/?${signedQS}`, { method: "POST" });
  const result = await res.json() as Record<string, unknown>;

  if (result.Code) {
    throw new Error(`Aliyun DNS error: ${result.Code} - ${result.Message || "Unknown"}`);
  }
  return result;
}

export async function addDnsRecord(
  type: "CNAME" | "TXT",
  rr: string,
  value: string,
): Promise<string> {
  const result = await callAliyunApi({
    Action: "AddDomainRecord",
    DomainName: "torresx.cn",
    RR: rr,
    Type: type,
    Value: value,
  });
  return (result as any).RecordId as string;
}

export async function deleteDnsRecord(recordId: string): Promise<void> {
  await callAliyunApi({
    Action: "DeleteDomainRecord",
    RecordId: recordId,
  });
}

export interface AliyunDnsRecord {
  recordId: string;
  type: string;
  rr: string;
  value: string;
  status: string;
}

function readAliyunRecords(result: Record<string, unknown>): AliyunDnsRecord[] {
  const raw = (result as { DomainRecords?: { Record?: unknown } }).DomainRecords?.Record || [];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map((item) => {
    const r = item as Record<string, unknown>;
    return {
      recordId: String(r.RecordId || ""),
      type: String(r.Type || ""),
      rr: String(r.RR || ""),
      value: String(r.Value || ""),
      status: String(r.Status || "ENABLE").toUpperCase(),
    };
  }).filter((r) => r.recordId);
}

export async function listDnsRecords(rr: string): Promise<Array<{ recordId: string; type: string; rr: string }>> {
  const result = await callAliyunApi({
    Action: "DescribeDomainRecords",
    DomainName: "torresx.cn",
    RRKeyWord: rr,
  });
  return readAliyunRecords(result).map((r) => ({
    recordId: r.recordId,
    type: r.type,
    rr: r.rr,
  }));
}

/** 分页拉齐 torresx.cn 全部解析 */
export async function listAllDnsRecords(): Promise<AliyunDnsRecord[]> {
  const out: AliyunDnsRecord[] = [];
  let page = 1;
  const pageSize = 500;
  while (page <= 20) {
    const result = await callAliyunApi({
      Action: "DescribeDomainRecords",
      DomainName: "torresx.cn",
      PageNumber: String(page),
      PageSize: String(pageSize),
    });
    const batch = readAliyunRecords(result);
    out.push(...batch);
    const total = Number((result as { TotalCount?: unknown }).TotalCount ?? out.length);
    if (out.length >= total || batch.length === 0) break;
    page += 1;
  }
  return out;
}
