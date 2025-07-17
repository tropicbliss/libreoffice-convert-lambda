import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { stat, writeFile } from "fs/promises";
import { createReadStream, createWriteStream, ReadStream } from "fs";
import { handle } from "hono/aws-lambda";
import { File } from "buffer";
import { env } from "process";
import { inspect, promisify } from "util";
import { exec } from "child_process";
import { pipeline } from "stream/promises";
import Excel from "exceljs";
import path from "path";
import { stream } from "hono/streaming";
import { html } from "hono/html";

const MAX_UPLOAD_FILE_SIZE_BYTES = 18 * 1000 * 1000;

const execAsync = promisify(exec);

const app = new Hono();

app.get("/", (c) => {
  return c.html(mainPage());
});

const libreofficePath = env.LIBREOFFICE_PATH;
if (libreofficePath === undefined) {
  throw new Error(
    "Define `LIBREOFFICE_PATH` in `Dockerfile` as an environment variable.",
  );
}

app.post(
  "/",
  bodyLimit({
    maxSize: MAX_UPLOAD_FILE_SIZE_BYTES,
    onError: (c) => {
      return c.html(
        mainPage(
          `File size exceeds ${
            MAX_UPLOAD_FILE_SIZE_BYTES / 1000 / 1000
          }MB limit.`,
        ),
      );
    },
  }),
  async (c) => {
    try {
      const body = await c.req.parseBody();
      const file = body["uploaded_file"];
      if (!file || !(file instanceof File)) {
        return c.html(mainPage("No file was uploaded or file is invalid."));
      }
      const isExcel = file.name.toLowerCase().endsWith(".xlsx") &&
        file.type ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      if (!isExcel) {
        return c.html(mainPage("Invalid file format."));
      }
      const TEMP_DIRECTORY = "/tmp";
      const STARTING_FILE_PATH = `${TEMP_DIRECTORY}/document.xlsx`;
      const ENDING_FILE_PATH = `${TEMP_DIRECTORY}/document.pdf`;
      const stream = file.stream();
      const destination = createWriteStream(STARTING_FILE_PATH);
      await pipeline(stream, destination);
      console.log("Processing...");
      await scaleExcelFile(STARTING_FILE_PATH);
      await execAsync(
        `${libreofficePath} --headless --invisible --nodefault --view --nolockcheck --nologo --norestore --convert-to pdf --outdir ${TEMP_DIRECTORY} ${STARTING_FILE_PATH}`,
      );
      console.log("Processed!");
      return returnData(c, ENDING_FILE_PATH, file.name);
    } catch (error) {
      console.error("Upload error:", inspect(error));
      return c.html(mainPage("Failed to upload file."));
    }
  },
);

async function returnData(
  c: Context,
  filePath: string,
  canonicalFilename: string,
) {
  const stats = await stat(filePath);
  c.header("Content-Type", "application/octet-stream");
  c.header("Content-Length", stats.size.toString());
  c.header(
    "Content-Disposition",
    `inline; filename="${path.parse(canonicalFilename).name}.pdf"`,
  );
  return stream(c, async (stream) => {
    await stream.pipe(
      ReadStream.toWeb(createReadStream(filePath)) as ReadableStream,
    );
  });
}

function mainPage(error?: string) {
  let result = html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Excel to PDF Converter</title>
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
        ${error !== undefined
          ? html`
            <strong>Error: ${error}</strong>
          `
          : ""}
      </body>
    </html>
  `;
  return result;
}

async function scaleExcelFile(path: string) {
  const workbook = new Excel.Workbook();
  await workbook.xlsx.read(createReadStream(path));
  workbook.eachSheet((worksheet, _id) => {
    worksheet.pageSetup.fitToPage = true;
    worksheet.pageSetup.fitToHeight = 0;
  });
  await workbook.xlsx.write(createWriteStream(path));
}

export const handler = handle(app);
