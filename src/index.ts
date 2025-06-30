import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { stat, writeFile } from "fs/promises";
import { createReadStream } from "fs";
import { handle } from "hono/aws-lambda";
import { createHash } from "crypto";
import { File } from "buffer";
import { env } from "process";
import { inspect, promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

const app = new Hono();

app.get("/", (c) => {
  return c.html(mainPage());
});

const s3 = new S3Client();

const bucketName = env.bucketName;
if (bucketName === undefined) {
  throw new Error(
    "Define `bucketName` in `sst.config.ts` as an environment variable.",
  );
}

const libreofficePath = env.LIBREOFFICE_PATH;
if (libreofficePath === undefined) {
  throw new Error(
    "Define `LIBREOFFICE_PATH` in `Dockerfile` as an environment variable.",
  );
}

app.post(
  "/",
  bodyLimit({
    maxSize: 100 * 1024 * 1024,
    onError: (c) => {
      return c.html(mainPage({
        type: "error",
        data: "File size exceeds 100MB limit.",
      }));
    },
  }),
  async (c) => {
    try {
      const body = await c.req.parseBody();
      const file = body["uploaded_file"];
      if (!file || !(file instanceof File)) {
        return c.html(mainPage({
          type: "error",
          data: "No file was uploaded or file is invalid.",
        }));
      }
      const isExcel = file.name.toLowerCase().endsWith(".xlsx") &&
        file.type ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      if (!isExcel) {
        return c.html(mainPage({
          type: "error",
          data: "Invalid file format.",
        }));
      }
      const checksum = await calculateChecksum(file);
      const command = new GetObjectCommand({
        Key: checksum,
        Bucket: bucketName,
      });
      const fileExist = await doesFileExist(s3, checksum);
      if (fileExist) {
        const url = await getSignedUrl(s3, command, {
          expiresIn: 6 * 60 * 60,
        });
        return c.html(mainPage({
          type: "url",
          data: url,
        }));
      }
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await writeFile("/tmp/document.xlsx", buffer);
      console.log("Processing...");
      await execAsync(
        `${libreofficePath} --headless --convert-to pdf --outdir /tmp /tmp/document.xlsx`,
      );
      console.log("Processed!");
      const path = "/tmp/document.pdf";
      const stats = await stat(path);
      const converted = createReadStream(path);
      const uploadCommand = new PutObjectCommand({
        Bucket: bucketName,
        Key: checksum,
        Body: converted,
        ContentType: "application/pdf",
        ContentLength: stats.size,
      });
      await s3.send(uploadCommand);
      const url = await getSignedUrl(s3, command, {
        expiresIn: 6 * 60 * 60,
      });
      return c.html(mainPage({
        type: "url",
        data: url,
      }));
    } catch (error) {
      console.error("Upload error:", inspect(error));
      return c.html(mainPage({
        type: "error",
        data: "Failed to upload file.",
      }));
    }
  },
);

function mainPage(content?: { type: "error" | "url"; data: string }) {
  let html = `
  <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Excel to PDF converter</title>
      </head>

      <body>
        <h1>Upload file</h1>
        <form action="/" method="post" enctype="multipart/form-data">
          <div>
            <label for="file">Select File:</label>
            <input type="file" id="file" name="uploaded_file" required>
          </div>
          <button type="submit">Upload File</button>
        </form>
  `;
  if (content !== undefined) {
    html += "<strong>";
    switch (content.type) {
      case "error":
        html += `Error: ${content.data}`;
        break;
      case "url":
        html += `<a href="${content.data}" target="_blank">Converted file</a>`;
    }
    html += "</strong>";
  }
  html += `
        </body>
    </html>
  `;
  return html;
}

async function doesFileExist(
  s3: S3Client,
  key: string,
): Promise<boolean> {
  try {
    await s3.send(
      new HeadObjectCommand({
        Key: key,
        Bucket: bucketName,
      }),
    );
    return true;
  } catch (e) {
    if (e instanceof Error) {
      if (e.name === "NotFound") {
        return false;
      }
    }
    throw e;
  }
}

async function calculateChecksum(file: File) {
  const hash = createHash("sha256");
  const reader = file.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
    }
    return hash.digest("hex");
  } finally {
    reader.releaseLock();
  }
}

export const handler = handle(app);
