import {
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from "aws-lambda";
import { readFile, stat, writeFile } from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import { env } from "process";
import { inspect, promisify } from "util";
import { exec } from "child_process";
import Excel from "exceljs";
import path from "path";

// Maximum file size allowed for uploads (18MB)
const MAX_UPLOAD_FILE_SIZE_BYTES = 18 * 1000 * 1000;

// Promisify the exec function for async/await usage
const execAsync = promisify(exec);

// Get LibreOffice path from environment variables
const libreofficePath = env.LIBREOFFICE_PATH;
if (libreofficePath === undefined) {
  throw new Error(
    "Define `LIBREOFFICE_PATH` in `Dockerfile` as an environment variable.",
  );
}

/**
 * Main AWS Lambda handler function
 * Handles both GET requests (returns HTML form) and POST requests (processes file upload)
 */
export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    // Handle GET request - return HTML form for file upload
    if (event.httpMethod === "GET") {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "text/html",
        },
        body: generateMainPage(),
      };
    }

    // Handle POST request - process file upload
    if (event.httpMethod === "POST") {
      return await handleFileUpload(event);
    }

    // Method not allowed
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "text/html",
      },
      body: generateMainPage("Method not allowed"),
    };
  } catch (error) {
    console.error("Handler error:", inspect(error));
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "text/html",
      },
      body: generateMainPage("Internal server error"),
    };
  }
};

/**
 * Handles file upload and conversion process
 */
async function handleFileUpload(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    // Parse the multipart form data from the request body
    const { file, filename } = await parseMultipartFormData(event);

    if (!file) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "text/html",
        },
        body: generateMainPage("No file was uploaded or file is invalid."),
      };
    }

    // Check file size
    if (file.length > MAX_UPLOAD_FILE_SIZE_BYTES) {
      return {
        statusCode: 413,
        headers: {
          "Content-Type": "text/html",
        },
        body: generateMainPage(
          `File size exceeds ${
            MAX_UPLOAD_FILE_SIZE_BYTES / 1000 / 1000
          }MB limit.`,
        ),
      };
    }

    // Validate file format (must be Excel .xlsx)
    const isExcel = filename.toLowerCase().endsWith(".xlsx");
    if (!isExcel) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "text/html",
        },
        body: generateMainPage(
          "Invalid file format. Please upload an Excel (.xlsx) file.",
        ),
      };
    }

    // Process the file
    const TEMP_DIRECTORY = "/tmp";
    const STARTING_FILE_PATH = `${TEMP_DIRECTORY}/document.xlsx`;
    const ENDING_FILE_PATH = `${TEMP_DIRECTORY}/document.pdf`;

    // Write uploaded file to temporary directory
    await writeFile(STARTING_FILE_PATH, file);

    console.log("Processing Excel file...");

    // Scale the Excel file to fit on pages
    await scaleExcelFile(STARTING_FILE_PATH);

    // Convert Excel to PDF using LibreOffice
    await execAsync(
      `${libreofficePath} --headless --convert-to pdf --outdir ${TEMP_DIRECTORY} ${STARTING_FILE_PATH}`,
    );

    console.log("Conversion completed!");

    // Return the PDF file
    return await returnPdfFile(ENDING_FILE_PATH, filename);
  } catch (error) {
    console.error("Upload error:", inspect(error));
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "text/html",
      },
      body: generateMainPage("Failed to process file."),
    };
  }
}

/**
 * Simple multipart form data parser
 * Note: This is a basic implementation. For production use, consider using a proper library. Please use something to parse this file.
 */
async function parseMultipartFormData(event: APIGatewayProxyEvent): Promise<{
  file: Buffer | null;
  filename: string;
}> {
  const body = event.body;
  const contentType = event.headers["content-type"] ||
    event.headers["Content-Type"];

  if (!body || !contentType || !contentType.includes("multipart/form-data")) {
    return { file: null, filename: "" };
  }

  // Extract boundary from content type
  const boundary = contentType.split("boundary=")[1];
  if (!boundary) {
    return { file: null, filename: "" };
  }

  // Decode base64 body if needed
  const bodyBuffer = event.isBase64Encoded
    ? Buffer.from(body, "base64")
    : Buffer.from(body);

  // Parse multipart data (basic implementation)
  const parts = bodyBuffer.toString().split(`--${boundary}`);

  for (const part of parts) {
    if (part.includes('name="uploaded_file"')) {
      // Extract filename
      const filenameMatch = part.match(/filename="([^"]+)"/);
      const filename = filenameMatch ? filenameMatch[1] : "document.xlsx";

      // Extract file content (everything after the double CRLF)
      const contentStart = part.indexOf("\r\n\r\n");
      if (contentStart === -1) continue;

      const fileContent = part.substring(contentStart + 4);
      const fileBuffer = Buffer.from(fileContent, "binary");

      return { file: fileBuffer, filename };
    }
  }

  return { file: null, filename: "" };
}

/**
 * Returns the converted PDF file as a response
 */
async function returnPdfFile(
  filePath: string,
  originalFilename: string,
): Promise<APIGatewayProxyResult> {
  try {
    // Read the PDF file
    const pdfBuffer = await readFile(filePath);
    const stats = await stat(filePath);

    // Generate PDF filename from original filename
    const pdfFilename = `${path.parse(originalFilename).name}.pdf`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": stats.size.toString(),
        "Content-Disposition": `inline; filename="${pdfFilename}"`,
      },
      body: pdfBuffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error("Error reading PDF file:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "text/html",
      },
      body: generateMainPage("Failed to generate PDF file."),
    };
  }
}

/**
 * Generates the HTML page with file upload form
 */
function generateMainPage(error?: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Excel to PDF Converter</title>
      </head>
      <body>
        <h1>Excel to PDF Converter</h1>
        <p>Upload an Excel (.xlsx) file to convert it to PDF format.</p>
        
        <form action="/" method="post" enctype="multipart/form-data">
          <div class="form-group">
            <label for="file">Select Excel File (.xlsx):</label>
            <input type="file" id="file" name="uploaded_file" accept=".xlsx" required>
          </div>
          <button type="submit">Convert to PDF</button>
        </form>
        
        ${
    error ? `<div class="error"><strong>Error: ${error}</strong></div>` : ""
  }
      </body>
    </html>
  `;
}

/**
 * Scales the Excel file to fit on PDF pages
 * Sets the page setup to fit content to page width
 */
async function scaleExcelFile(filePath: string): Promise<void> {
  const workbook = new Excel.Workbook();

  // Read the Excel file
  await workbook.xlsx.read(createReadStream(filePath));

  // Configure each worksheet to fit content on pages
  workbook.eachSheet((worksheet, _id) => {
    // Set page setup to fit content to page
    worksheet.pageSetup.fitToPage = true;
    worksheet.pageSetup.fitToHeight = 0; // Fit to width, allow multiple pages in height
  });

  // Write the modified workbook back to file
  await workbook.xlsx.write(createWriteStream(filePath));
}
