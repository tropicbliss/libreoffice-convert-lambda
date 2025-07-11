// Import necessary modules for web server, file handling, and Excel processing
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

// Set maximum allowed file size to 18MB
const MAX_UPLOAD_FILE_SIZE_BYTES = 18 * 1000 * 1000;

// Convert exec function to return promises instead of using callbacks
const execAsync = promisify(exec);

// Initialize the Hono web application
const app = new Hono();

// GET route: Serve the main upload page
app.get("/", (c) => {
  return c.html(mainPage());
});

// Get LibreOffice executable path from environment variables
// LibreOffice is used to convert Excel files to PDF
const libreofficePath = env.LIBREOFFICE_PATH;
if (libreofficePath === undefined) {
  throw new Error(
    "Define `LIBREOFFICE_PATH` in `Dockerfile` as an environment variable.",
  );
}

// POST route: Handle file upload and conversion to PDF
app.post(
  "/",
  // Middleware to limit request body size and handle oversized files
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
      // Parse the uploaded file from the request body
      const body = await c.req.parseBody();
      const file = body["uploaded_file"];

      // Validate that a file was uploaded and is a valid File object
      if (!file || !(file instanceof File)) {
        return c.html(mainPage("No file was uploaded or file is invalid."));
      }

      // Check if the uploaded file is a valid Excel file (.xlsx format)
      const isExcel = file.name.toLowerCase().endsWith(".xlsx") &&
        file.type ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      if (!isExcel) {
        return c.html(mainPage("Invalid file format."));
      }

      // Define temporary file paths for processing
      const TEMP_DIRECTORY = "/tmp";
      const STARTING_FILE_PATH = `${TEMP_DIRECTORY}/document.xlsx`;
      const ENDING_FILE_PATH = `${TEMP_DIRECTORY}/document.pdf`;

      // Stream the uploaded file to temporary storage
      const stream = file.stream();
      const destination = createWriteStream(STARTING_FILE_PATH);
      await pipeline(stream, destination);

      // Also write the file using buffer method (redundant but ensures file is saved)
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await writeFile(STARTING_FILE_PATH, buffer);

      console.log("Processing...");

      // Scale the Excel file to fit on PDF pages properly
      await scaleExcelFile(STARTING_FILE_PATH);

      // Use LibreOffice to convert the Excel file to PDF
      await execAsync(
        `${libreofficePath} --headless --convert-to pdf --outdir ${TEMP_DIRECTORY} ${STARTING_FILE_PATH}`,
      );

      console.log("Processed!");

      // Return the converted PDF file to the user
      return returnData(c, ENDING_FILE_PATH, file.name);
    } catch (error) {
      // Handle any errors during the upload/conversion process
      console.error("Upload error:", inspect(error));
      return c.html(mainPage("Failed to upload file."));
    }
  },
);

/**
 * Stream the converted PDF file back to the client as a download
 * @param c - Hono context object
 * @param filePath - Path to the converted PDF file
 * @param canonicalFilename - Original filename to base the PDF name on
 */
async function returnData(
  c: Context,
  filePath: string,
  canonicalFilename: string,
) {
  // Get file stats to determine content length
  const stats = await stat(filePath);

  // Set appropriate headers for file download
  c.header("Content-Type", "application/octet-stream");
  c.header("Content-Length", stats.size.toString());
  c.header(
    "Content-Disposition",
    `inline; filename="${path.parse(canonicalFilename).name}.pdf"`,
  );

  // Stream the file content to the client
  return stream(c, async (stream) => {
    await stream.pipe(
      ReadStream.toWeb(createReadStream(filePath)) as ReadableStream,
    );
  });
}

/**
 * Generate the HTML for the main upload page
 * @param error - Optional error message to display to the user
 * @returns HTML template for the upload form
 */
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

/**
 * Modify Excel file settings to ensure proper scaling when converted to PDF
 * Sets each worksheet to fit to page width with unlimited height
 * @param path - Path to the Excel file to modify
 */
async function scaleExcelFile(path: string) {
  // Load the Excel workbook
  const workbook = new Excel.Workbook();
  await workbook.xlsx.read(createReadStream(path));

  // Configure each worksheet for optimal PDF conversion
  workbook.eachSheet((worksheet, _id) => {
    // Enable fit-to-page scaling
    worksheet.pageSetup.fitToPage = true;
    // Set unlimited height (0 = no height limit)
    worksheet.pageSetup.fitToHeight = 0;
  });

  // Save the modified workbook back to the same file
  await workbook.xlsx.write(createWriteStream(path));
}

// Export the handler for AWS Lambda deployment
export const handler = handle(app);
