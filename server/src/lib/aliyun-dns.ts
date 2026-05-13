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

export async function listDnsRecords(rr: string): Promise<Array<{ recordId: string; type: string }>> {
  const result = await callAliyunApi({
    Action: "DescribeDomainRecords",
    DomainName: "torresx.cn",
    RRKeyWord: rr,
  });
  const records = (result as any).DomainRecords?.Record || [];
  if (!Array.isArray(records)) return [];
  return records.map((r: any) => ({
    recordId: r.RecordId as string,
    type: r.Type as string,
  }));
}
