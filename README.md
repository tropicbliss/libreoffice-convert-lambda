# libreoffice-convert-lambda

An example of deploying AWS Lambda container images with SST, which is not
officially supported at the time of writing. This project wraps around
LibreOffice to convert Excel files to PDF. Excel files are uploaded to the
server and the converted PDF files are in turn uploaded to S3. The lambda
returns a pre-signed URL to the object valid for 6 hours.

Fonts have not been included in the repo for licensing reasons.
