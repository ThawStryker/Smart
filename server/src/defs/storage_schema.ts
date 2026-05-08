/**
 * Storage Schema
 *
 * Define your storage buckets here for compile-time type safety.
 * This file is the source of truth for bucket metadata.
 * Bucket names are first-level path prefixes in the environment's R2 bucket.
 *
 * After editing this file, run:
 *   edgespark storage apply
 *
 * Usage in code:
 *   import { buckets } from "@defs";
 *   await edgespark.storage.from(buckets.sourceBuckets).put("file.jpg", buffer);
 */

import type { BucketDef } from "@sdk/server-types";

export const sourceBuckets: BucketDef<"tool-sources"> = {
  bucket_name: "tool-sources",
  description: "AI 生成的工具源代码包",
};

export const artifactBuckets: BucketDef<"tool-artifacts"> = {
  bucket_name: "tool-artifacts",
  description: "构建产物（dist/ 打包文件）",
};

export const attachmentBuckets: BucketDef<"attachments"> = {
  bucket_name: "attachments",
  description: "用户上传的附件文件",
};
